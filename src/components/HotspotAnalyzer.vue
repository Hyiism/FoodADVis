<script setup lang="ts">
import { onMounted, ref, watch, nextTick, onUnmounted, computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';
// 引入 Element Plus 的图标 (如果没有安装，可以用简单的 SVG 替换)
import { FullScreen, CopyDocument } from '@element-plus/icons-vue';

const store = useExplorerStore();
const { selectedSampleId, explanations, context, pivotFilter } = storeToRefs(store);

// --- 全屏逻辑 Start ---
const isFullscreen = ref(false);

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
  // 状态改变后，ResizeObserver 会捕捉到尺寸变化并触发 drawTopology
};

// 监听 ESC 键退出全屏
const handleEscKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false;
  }
};
// --- 全屏逻辑 End ---

// 1. 获取分析模式
const currentMode = computed(() => {
  if (store.currentAnalysisMode) return store.currentAnalysisMode;
  const sample = store.samples?.find(s => s.id === selectedSampleId.value);
  if (sample && sample.riskLevel === '低风险') return 'safe';
  return 'risk';
});

// 2. 动态颜色配置
const TYPE_COLORS = computed(() => {
  const isSafe = currentMode.value === 'safe';
  return {
    'InspectionRecord': isSafe ? '#67c23a' : '#e15759', 
    'Product': '#f28e2c',          
    'Market': '#4e79a7',           
    'Farmer': isSafe ? '#529b2e' : '#59a14f', 
    'Contaminant': '#76b7b2',      
    'Unknown': '#bab0ac'
  };
});

const chartContainer = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);

let simulation: d3.Simulation<any, any> | null = null;
let resizeObserver: ResizeObserver | null = null;

const graphData = computed(() => {
  const nodesMap = new Map<string, any>();
  const linksArr: any[] = [];

  const parse = (str: string) => {
    if (!str) return { type: 'Unknown', rawId: '?' };
    const cleanStr = str.replace(/['"]/g, '').trim();
    const match = cleanStr.match(/^([a-zA-Z]+)[_\[](\d+)\]?$/);
    if (match) return { type: match[1], rawId: match[2], fullName: cleanStr };
    const parts = cleanStr.split('_');
    if (parts.length > 1) return { type: parts[0], rawId: parts[1], fullName: cleanStr };
    return { type: 'Unknown', rawId: cleanStr, fullName: cleanStr };
  };

  const getLabelFromChain = (idStr: string, chain: any[]) => {
    if (!chain) return null;
    for (const link of chain) {
      if (link.from === idStr && link.from_label) return link.from_label;
      if (link.to === idStr && link.to_label) return link.to_label;
    }
    return null;
  };

  const reconstructSupplyChain = (id: number, rawCtx: any) => {
    const chain: any[] = [];
    const centerId = `InspectionRecord_${id}`;

    const farmers = rawCtx.farmers || [];
    const products = rawCtx.products || [];
    const markets = rawCtx.markets || [];
    const contaminants = rawCtx.contaminants || [];

    farmers.forEach((fid: any) => {
        const fNodeId = `Farmer_${fid}`;
        if (products.length > 0) {
            products.forEach((pid: any) => {
                chain.push({ from: fNodeId, to: `Product_${pid}`, from_label: `Farmer #${fid}`, to_label: `Product #${pid}` });
            });
        } else {
            chain.push({ from: fNodeId, to: centerId, from_label: `Farmer #${fid}`, to_label: `Sample #${id}` });
        }
    });

    products.forEach((pid: any) => {
        const pNodeId = `Product_${pid}`;
        contaminants.forEach((cid: any) => {
             chain.push({ from: `Contaminant_${cid}`, to: pNodeId, from_label: `Contaminant #${cid}`, to_label: `Product #${pid}` });
        });
        if (markets.length > 0) {
            markets.forEach((mid: any) => {
                chain.push({ from: pNodeId, to: `Market_${mid}`, from_label: `Product #${pid}`, to_label: `Market #${mid}` });
            });
        } else {
            chain.push({ from: pNodeId, to: centerId, from_label: `Product #${pid}`, to_label: `Sample #${id}` });
        }
    });

    markets.forEach((mid: any) => {
        chain.push({ from: `Market_${mid}`, to: centerId, from_label: `Market #${mid}`, to_label: `Sample #${id}` });
    });

    if (chain.length === 0) {
        Object.entries(rawCtx).forEach(([key, idList]) => {
            let type = key.charAt(0).toUpperCase() + key.slice(1);
            if (type.endsWith('s')) type = type.slice(0, -1);
            if (Array.isArray(idList)) {
                idList.forEach((nid) => {
                    chain.push({ from: `${type}_${nid}`, to: centerId, from_label: `${type} #${nid}`, to_label: `Sample #${id}` });
                });
            }
        });
    }
    return chain;
  };

  if (pivotFilter.value) {
    const centerEntity = pivotFilter.value;
    nodesMap.set(centerEntity, { id: centerEntity, ...parse(centerEntity), isCenter: true, val: 40, displayName: centerEntity });
    const expMap = explanations.value || {};
    Object.entries(expMap).forEach(([sId, pathLinks]) => {
      let isRelated = false;
      const chain = pathLinks as any[];
      for (const link of chain) {
        if (link.from === centerEntity || link.to === centerEntity) { isRelated = true; break; }
      }
      if (isRelated) {
        const sampleName = `InspectionRecord_${sId}`;
        if (!nodesMap.has(sampleName)) {
            const label = getLabelFromChain(sampleName, chain) || sampleName;
            nodesMap.set(sampleName, { id: sampleName, ...parse(sampleName), val: 10, displayName: label });
        }
        linksArr.push({ source: centerEntity, target: sampleName });
      }
    });
  } 
  else if (selectedSampleId.value) {
    const id = selectedSampleId.value;
    const expMap = explanations.value || {};
    const ctxMap = context.value || {}; 

    let chain = expMap[id] || expMap[String(id)];
    let isReconstructed = false;

    if (!chain || chain.length === 0) {
        const rawCtx = ctxMap[id] || ctxMap[String(id)];
        if (rawCtx) {
            chain = reconstructSupplyChain(id, rawCtx);
            isReconstructed = true;
        }
    }

    if (chain && chain.length > 0) {
        const centerId = `InspectionRecord_${id}`;
        const centerLabel = isReconstructed ? `Sample #${id} (Safe Trace)` : (getLabelFromChain(centerId, chain) || `Sample #${id}`);
        
        nodesMap.set(centerId, { id: centerId, ...parse(centerId), isCenter: true, val: 30, displayName: centerLabel });

        chain.forEach((link: any) => {
            const norm = (s: string) => { const p = parse(s); return `${p.type}_${p.rawId}`; };
            const u = norm(link.from);
            const v = norm(link.to);

            if (!nodesMap.has(u)) nodesMap.set(u, { id: u, ...parse(u), val: 1, displayName: link.from_label || u });
            else nodesMap.get(u).val++;
            
            if (!nodesMap.has(v)) nodesMap.set(v, { id: v, ...parse(v), val: 1, displayName: link.to_label || v });
            else nodesMap.get(v).val++;

            const exists = linksArr.some(l => (l.source === u && l.target === v) || (l.source === v && l.target === u));
            if (!exists) linksArr.push({ source: u, target: v });
        });
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links: linksArr,
    mode: pivotFilter.value ? 'ENTITY' : 'SAMPLE' 
  };
});

const drawTopology = () => {
  if (!chartContainer.value) return;
  if (simulation) simulation.stop();
  const container = d3.select(chartContainer.value);
  container.selectAll("*").remove();

  const rawData = graphData.value;
  const isSafe = currentMode.value === 'safe';
  
  // 实时获取容器大小 (全屏时会自动变大)
  const width = chartContainer.value.clientWidth;
  const height = chartContainer.value.clientHeight || 300;
  
  if (rawData.nodes.length === 0) {
    renderEmptyState(container, width, height);
    return;
  }

  const nodes = JSON.parse(JSON.stringify(rawData.nodes));
  let links = JSON.parse(JSON.stringify(rawData.links));
  const graphMode = rawData.mode;

  const nodeIds = new Set(nodes.map((n: any) => n.id));
  links = links.filter((l: any) => nodeIds.has(l.source) && nodeIds.has(l.target));

  // [优化] 视口计算：全屏模式下增加一点内边距，防止贴边
  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    // 动态 ViewBox: 让图居中并适应屏幕
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .style("font-family", "'Times New Roman', serif")
    .style("background-color", isFullscreen.value ? "#f9f9f9" : "#fff");

  const maxVal = d3.max(nodes, (d: any) => d.val) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxVal]).range([12, 30]); 

  // [关键] 调整力导向力度：屏幕越大，斥力越大，连线越长
  const chargeStrength = isFullscreen.value ? -500 : -300;
  const linkDistance = isFullscreen.value ? 100 : 60;
  const xForceFactor = isFullscreen.value ? 0.2 : 0.15; // 全屏时拉得更开

  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d: any) => d.id).distance(linkDistance))
    .force("charge", d3.forceManyBody().strength(chargeStrength)) 
    .force("center", d3.forceCenter(0, 0))
    .force("collide", d3.forceCollide().radius((d: any) => rScale(d.val) + 10).iterations(3));

  if (graphMode === 'SAMPLE') {
      const layerMap: Record<string, number> = {
          'Farmer': -2, 'Contaminant': -1.5, 'Product': -1, 'Market': 1, 'InspectionRecord': 2
      };
      
      simulation.force("x", d3.forceX((d: any) => {
          if (d.isCenter) return width * 0.3; 
          const layer = layerMap[d.type] || 0;
          return layer * (width * xForceFactor); 
      }).strength(0.5));
      
      simulation.force("y", d3.forceY(0).strength(0.1));
  }

  const contentLayer = svg.append("g").attr("class", "content-layer");
  const linkColor = isSafe ? '#b3e19d' : '#bbb'; 

  svg.append("defs").append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 25) 
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", linkColor);

  const linkSelection = contentLayer.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", linkColor) 
    .attr("stroke-width", 2)
    .attr("opacity", 0.7)
    .attr("marker-end", "url(#arrowhead)");

  const nodeSelection = contentLayer.append("g")
    .selectAll(".node")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .call(drag(simulation) as any)
    .style("cursor", "pointer")
    .on("click", (e, d: any) => {
        hideTooltip();
        if (graphMode === 'SAMPLE') {
            if (!d.isCenter) store.setPivotFilter(d.id);
        } else {
            if (d.type === 'InspectionRecord') {
                const cleanId = d.id.replace(/[^0-9]/g, '');
                store.selectSample(parseInt(cleanId));
                store.clearPivotFilter();
            } else if (d.isCenter) store.clearPivotFilter();
        }
    });

  nodeSelection.append("circle")
    .attr("r", (d: any) => d.isCenter ? 28 : rScale(d.val))
    .attr("fill", (d: any) => d.isCenter ? (isSafe ? '#444' : '#333') : (TYPE_COLORS.value[d.type] || '#ccc'))
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  nodeSelection.append("circle")
    .attr("r", (d: any) => (d.isCenter ? 28 : rScale(d.val)) + 4)
    .attr("fill", "none")
    .attr("stroke", isSafe ? '#67c23a' : '#333')
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "3,2")
    .attr("opacity", (d: any) => (pivotFilter.value && pivotFilter.value === d.id) ? 1 : 0);

  nodeSelection.append("text")
    .text((d: any) => d.isCenter ? (graphMode === 'ENTITY' ? 'TARGET' : 'ROOT') : d.rawId)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "10px")
    .style("font-family", "Arial")
    .style("fill", "#fff")
    .style("pointer-events", "none");

  // [优化] 全屏模式下，标签字体可以稍微大一点
  if (graphMode === 'SAMPLE') {
      const titles = [
          { text: "Production", x: -width * (isFullscreen.value ? 0.3 : 0.25) },
          { text: "Logistics", x: 0 },
          { text: "Inspection", x: width * (isFullscreen.value ? 0.3 : 0.25) }
      ];
      const titleLayer = svg.append("g").attr("class", "titles").lower();
      titles.forEach(t => {
          titleLayer.append("text")
            .attr("x", t.x)
            .attr("y", -height/2 + (isFullscreen.value ? 40 : 20))
            .text(t.text)
            .attr("text-anchor", "middle")
            .style("fill", "#ddd")
            .style("font-size", isFullscreen.value ? "14px" : "11px") // 全屏字体变大
            .style("font-weight", "bold")
            .style("letter-spacing", "1px");
      });
  }

  simulation.on("tick", () => {
    linkSelection
      .attr("x1", (d: any) => d.source.x)
      .attr("y1", (d: any) => d.source.y)
      .attr("x2", (d: any) => d.target.x)
      .attr("y2", (d: any) => d.target.y);
    nodeSelection.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
  });
  
  nodeSelection.on("mouseover", function(event, d: any) {
      d3.select(this).select("circle").attr("stroke", "#333");
      showTooltip(event, d);
  }).on("mouseout", function() {
      d3.select(this).select("circle").attr("stroke", "#fff");
      hideTooltip();
  });
};

const drag = (simulation: d3.Simulation<any, any>) => {
  function dragstarted(event: any, d: any) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event: any, d: any) { d.fx = event.x; d.fy = event.y; }
  function dragended(event: any, d: any) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
  }
  return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
};

const showTooltip = (event: MouseEvent, d: any) => {
  if (!tooltipRef.value) return;
  const color = TYPE_COLORS.value[d.type] || '#333';
  tooltipRef.value.style.opacity = '1';
  tooltipRef.value.innerHTML = `
    <div style="font-weight:bold;color:${color}">${d.type}</div>
    <div style="font-size:12px;color:#333;margin-top:2px">${d.displayName || d.fullName}</div>
    <div style="font-size:10px;color:#999;font-family:monospace">ID: ${d.rawId}</div>
  `;
  tooltipRef.value.style.left = `${event.clientX + 10}px`;
  tooltipRef.value.style.top = `${event.clientY + 10}px`;
};
const hideTooltip = () => { if (tooltipRef.value) tooltipRef.value.style.opacity = '0'; };

const renderEmptyState = (container: any, width: number, height: number) => {
  const svg = container.append("svg").attr("width", width).attr("height", height);
  svg.append("text").attr("x", width/2).attr("y", height/2)
     .text(selectedSampleId.value ? "No Data Available" : "Select a Sample")
     .attr("text-anchor", "middle").style("fill", "#ccc").style("font-size", "12px");
};

watch([selectedSampleId, pivotFilter, explanations, context, currentMode], () => {
    nextTick(drawTopology);
});

onMounted(() => {
  window.addEventListener('keydown', handleEscKey); // 添加 ESC 监听
  if (chartContainer.value) {
    resizeObserver = new ResizeObserver(() => requestAnimationFrame(drawTopology));
    resizeObserver.observe(chartContainer.value);
  }
  nextTick(drawTopology);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscKey); // 移除监听
  if (resizeObserver) resizeObserver.disconnect();
  if (simulation) simulation.stop();
});
</script>

<template>
  <div class="graph-wrapper" :class="{ 'is-fullscreen': isFullscreen }">
    <div class="chart-header">
        <div class="chart-title">
            <span v-if="pivotFilter">Pivot View</span>
            <span v-else>
                {{ currentMode === 'safe' ? '✨ Safe Traceability' : '🚨 Causal Topology' }}
            </span>
        </div>
        <div class="header-actions">
            <el-icon class="action-icon" @click="toggleFullscreen" title="Toggle Fullscreen">
                <component :is="isFullscreen ? CopyDocument : FullScreen" />
            </el-icon>
        </div>
    </div>
    
    <div ref="chartContainer" class="chart-container"></div>
    <div ref="tooltipRef" class="graph-tooltip"></div>
  </div>
</template>

<style scoped>
.graph-wrapper {
  width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center;
  background-color: #ffffff; padding: 10px; box-sizing: border-box; 
  position: relative;
  border-left: 1px solid #f0f0f0; 
  transition: all 0.3s ease; /* 添加过渡效果 */
}

/* 全屏模式样式 */
.graph-wrapper.is-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 2000; /* 确保层级极高 */
  padding: 20px;
  border: none;
}

.chart-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #eee;
    padding-bottom: 4px;
    margin-bottom: 5px;
}

.chart-title {
    font-family: 'Times New Roman', serif; 
    font-size: 13px; 
    font-weight: bold;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.header-actions {
    display: flex;
    align-items: center;
}

.action-icon {
    cursor: pointer;
    font-size: 16px;
    color: #666;
    transition: color 0.2s;
    padding: 4px;
    border-radius: 4px;
}
.action-icon:hover {
    color: #409eff;
    background-color: #f0f7ff;
}

.chart-container {
  flex: 1; width: 100%; min-height: 0; cursor: grab;
}
.chart-container:active { cursor: grabbing; }

.graph-tooltip {
  position: fixed;
  background: rgba(255,255,255,0.95);
  color: #333;
  border: 1px solid #ddd;
  padding: 6px 10px;
  border-radius: 4px;
  font-family: sans-serif; 
  font-size: 12px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.1s;
  z-index: 9999; /* 比全屏容器更高 */
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
</style>