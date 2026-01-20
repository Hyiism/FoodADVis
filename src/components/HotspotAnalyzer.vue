<!-- <script setup lang="ts">
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
</style> -->

<!-- -------------------保留版-----------------------------------  -->
<!-- <script setup lang="ts">
import { onMounted, ref, watch, nextTick, onUnmounted, computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';
import { FullScreen, CopyDocument } from '@element-plus/icons-vue';

const store = useExplorerStore();
const { selectedSampleId, explanations, context, pivotFilter } = storeToRefs(store);

// --- 全屏逻辑 ---
const isFullscreen = ref(false);
const toggleFullscreen = () => { isFullscreen.value = !isFullscreen.value; };
const handleEscKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen.value) isFullscreen.value = false; };

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

// --- 数据处理逻辑 (保持稳定) ---
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

  const getChainFromExp = (rawExp: any) => {
    if (!rawExp) return [];
    if (Array.isArray(rawExp)) return rawExp;
    if (rawExp.paths && Array.isArray(rawExp.paths)) return rawExp.paths;
    return [];
  };

  if (pivotFilter.value) {
    const centerEntity = pivotFilter.value;
    nodesMap.set(centerEntity, { id: centerEntity, ...parse(centerEntity), isCenter: true, val: 40, displayName: centerEntity });
    const expMap = explanations.value || {};
    
    Object.entries(expMap).forEach(([sId, rawVal]) => {
      const chain = getChainFromExp(rawVal);
      let isRelated = false;
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
    let chain = getChainFromExp(expMap[id] || expMap[String(id)]);

    if (chain && chain.length > 0) {
        const centerId = `InspectionRecord_${id}`;
        const centerLabel = getLabelFromChain(centerId, chain) || `Sample #${id}`;
        
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

// --- 核心绘图逻辑 (扇形布局版) ---
const drawTopology = () => {
  if (!chartContainer.value) return;
  if (simulation) simulation.stop();
  const container = d3.select(chartContainer.value);
  container.selectAll("*").remove();

  const rawData = graphData.value;
  const isSafe = currentMode.value === 'safe';
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

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .style("font-family", "'Times New Roman', serif")
    .style("background-color", isFullscreen.value ? "#f9f9f9" : "#fff");

  const maxVal = d3.max(nodes, (d: any) => d.val) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxVal]).range([14, 28]); 

  // --- [关键修改 1] 物理参数: 扇形适配 ---
  const chargeStrength = isFullscreen.value ? -600 : -400; 
  const linkDistance = isFullscreen.value ? 120 : 80; 
  
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d: any) => d.id).distance(linkDistance))
    .force("charge", d3.forceManyBody().strength(chargeStrength)) 
    .force("center", d3.forceCenter(0, 0))
    .force("collide", d3.forceCollide().radius((d: any) => rScale(d.val) + 12).iterations(2));

  // --- [关键修改 2] 扇形引力布局 (Fan Layout) ---
  if (graphMode === 'SAMPLE') {
      // 布局半径：根据屏幕大小动态计算
      // 左侧扇形的半径 (Radius)
      // width * 0.35 让扇形大致位于左侧 1/3 处
      const R = width * (isFullscreen.value ? 0.35 : 0.4); 
      
      // 定义扇形各层级的角度 (以 0 度水平向左为基准)
      // Farmer: -45度 (左上)
      // Product: -15度 (左微上)
      // Market: +15度 (左微下)
      // Contaminant: +45度 (左下)
      
      // 我们直接定义目标坐标 (Target X, Y)
      // 中心点在右侧 (width * 0.3)
      const centerX = width * 0.3;
      const centerY = 0;

      // 辅助计算函数: 给定角度(度数)和半径，计算相对坐标
      // 这里的角度是相对于 "左侧半圆" 的偏移
      // 实际上我们想要分布在左侧，所以 x 应该是负值
      
      const targetPos: Record<string, {x: number, y: number}> = {
          // 最左上：养殖户
          'Farmer':      { x: -width * 0.25, y: -height * 0.35 },
          // 左侧偏上：产品
          'Product':     { x: -width * 0.35, y: -height * 0.15 },
          // 左侧偏下：市场
          'Market':      { x: -width * 0.35, y: height * 0.15 },
          // 最左下：污染物
          'Contaminant': { x: -width * 0.25, y: height * 0.35 },
          // 中心：样本
          'InspectionRecord': { x: width * 0.3, y: 0 }
      };
      
      // X 轴引力
      simulation.force("x", d3.forceX((d: any) => {
          if (d.isCenter) return width * 0.3; // 样本固定在右侧
          return targetPos[d.type] ? targetPos[d.type].x : 0;
      }).strength(0.6)); // 增强引力，保持形状

      // Y 轴引力
      simulation.force("y", d3.forceY((d: any) => {
          if (d.isCenter) return 0;
          return targetPos[d.type] ? targetPos[d.type].y : 0;
      }).strength(0.6));
  }

  // 绘制箭头
  const contentLayer = svg.append("g").attr("class", "content-layer");
  const linkColor = isSafe ? '#b3e19d' : '#bbb'; 

  svg.append("defs").append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 26) 
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
    .attr("opacity", 0.6)
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

  // 节点圆圈
  nodeSelection.append("circle")
    .attr("r", (d: any) => d.isCenter ? 30 : rScale(d.val))
    .attr("fill", (d: any) => d.isCenter ? (isSafe ? '#444' : '#333') : (TYPE_COLORS.value[d.type] || '#ccc'))
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  nodeSelection.append("circle")
    .attr("r", (d: any) => (d.isCenter ? 30 : rScale(d.val)) + 5)
    .attr("fill", "none")
    .attr("stroke", isSafe ? '#67c23a' : '#333')
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "4,2")
    .attr("opacity", (d: any) => (pivotFilter.value && pivotFilter.value === d.id) ? 1 : 0);

  nodeSelection.append("text")
    .text((d: any) => d.isCenter ? (graphMode === 'ENTITY' ? 'TARGET' : 'ROOT') : d.rawId)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "10px")
    .style("font-family", "Arial")
    .style("fill", "#fff")
    .style("pointer-events", "none");

  // --- [关键修改 3] 背景标签调整 (左侧扇形) ---
  if (graphMode === 'SAMPLE') {
      const titles = [
          // 左上
          { text: "Farmer", x: -width * 0.25, y: -height * 0.4 },
          // 左偏上
          { text: "Product", x: -width * 0.38, y: -height * 0.2 },
          // 左偏下
          { text: "Market", x: -width * 0.38, y: height * 0.2 },
          // 左下
          { text: "Contaminant", x: -width * 0.25, y: height * 0.4 },
          // 右中
          { text: "Target Sample", x: width * 0.3, y: -40 } // 在样本上方一点
      ];
      
      const titleLayer = svg.append("g").attr("class", "titles").lower();
      titles.forEach(t => {
          titleLayer.append("text")
            .attr("x", t.x)
            .attr("y", t.y)
            .text(t.text)
            .attr("text-anchor", "middle")
            .style("fill", "#e0e0e0")
            .style("font-size", isFullscreen.value ? "14px" : "11px") 
            .style("font-weight", "bold")
            .style("letter-spacing", "1px")
            .style("text-transform", "uppercase");
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

watch([selectedSampleId, pivotFilter, explanations, context, currentMode], () => { nextTick(drawTopology); });

onMounted(() => {
  window.addEventListener('keydown', handleEscKey); 
  if (chartContainer.value) {
    resizeObserver = new ResizeObserver(() => requestAnimationFrame(drawTopology));
    resizeObserver.observe(chartContainer.value);
  }
  nextTick(drawTopology);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscKey); 
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
  transition: all 0.3s ease; 
}
.graph-wrapper.is-fullscreen {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2000; padding: 20px; border: none;
}
.chart-header {
    width: 100%; display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 5px;
}
.chart-title {
    font-family: 'Times New Roman', serif; font-size: 13px; font-weight: bold; color: #333; text-transform: uppercase; letter-spacing: 1px;
}
.header-actions { display: flex; align-items: center; }
.action-icon { cursor: pointer; font-size: 16px; color: #666; transition: color 0.2s; padding: 4px; border-radius: 4px; }
.action-icon:hover { color: #409eff; background-color: #f0f7ff; }
.chart-container { flex: 1; width: 100%; min-height: 0; cursor: grab; }
.chart-container:active { cursor: grabbing; }
.graph-tooltip {
  position: fixed; background: rgba(255,255,255,0.95); color: #333; border: 1px solid #ddd;
  padding: 6px 10px; border-radius: 4px; font-family: sans-serif; font-size: 12px;
  pointer-events: none; opacity: 0; transition: opacity 0.1s; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
</style> -->



<!-- <script setup lang="ts">
import { onMounted, ref, watch, nextTick, onUnmounted, computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';
import { FullScreen, CopyDocument, Grid, CircleCheck } from '@element-plus/icons-vue';

const store = useExplorerStore();
const { 
  selectedSampleId, explanations, context, pivotFilter, 
  topRankedAnomalies, topRankedSafeSamples 
} = storeToRefs(store);

// --- 全屏逻辑 ---
const isFullscreen = ref(false);
const toggleFullscreen = () => { isFullscreen.value = !isFullscreen.value; };
const handleEscKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen.value) isFullscreen.value = false; };

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

// --- 3. 数据处理核心逻辑 ---
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

  const getChainFromExp = (rawExp: any) => {
    if (!rawExp) return [];
    if (Array.isArray(rawExp)) return rawExp;
    if (rawExp.paths && Array.isArray(rawExp.paths)) return rawExp.paths;
    return [];
  };

  // >>> 场景 A: 实体透视 (Pivot Mode) <<<
  if (pivotFilter.value) {
    const centerEntity = pivotFilter.value;
    nodesMap.set(centerEntity, { id: centerEntity, ...parse(centerEntity), isCenter: true, val: 40, displayName: centerEntity });
    const expMap = explanations.value || {};
    
    Object.entries(expMap).forEach(([sId, rawVal]) => {
      const chain = getChainFromExp(rawVal);
      let isRelated = false;
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
  // >>> 场景 B: 单样本选中 (Selected Mode) <<<
  else if (selectedSampleId.value) {
    const id = selectedSampleId.value;
    const idStr = String(id);
    const expMap = explanations.value || {};
    
    // 1. 尝试获取风险路径
    let chain = getChainFromExp(expMap[id] || expMap[idStr]);

    if (chain && chain.length > 0) {
        const centerId = `InspectionRecord_${id}`;
        const centerLabel = getLabelFromChain(centerId, chain) || `Sample #${id}`;
        
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
    // 2. [修复] 兜底逻辑：如果是安全样本(无解释)，从 Context 构建图
    else {
        const ctx = context.value?.[idStr];
        if (ctx) {
            const centerId = `InspectionRecord_${id}`;
            nodesMap.set(centerId, { 
                id: centerId, ...parse(centerId), 
                isCenter: true, val: 30, 
                displayName: `Safe Sample #${id}` 
            });

            // 添加 Farmer (Source -> Sample)
            ctx.farmers?.forEach((fid: any) => {
                const nid = `Farmer_${fid}`;
                nodesMap.set(nid, { id: nid, ...parse(nid), val: 10, displayName: `Farmer ${fid}` });
                linksArr.push({ source: nid, target: centerId });
            });

            // 添加 Product
            ctx.products?.forEach((pid: any) => {
                const nid = `Product_${pid}`;
                nodesMap.set(nid, { id: nid, ...parse(nid), val: 10, displayName: `Product ${pid}` });
                linksArr.push({ source: nid, target: centerId });
            });

            // 添加 Market (Sample -> Market)
            ctx.markets?.forEach((mid: any) => {
                const nid = `Market_${mid}`;
                nodesMap.set(nid, { id: nid, ...parse(nid), val: 10, displayName: `Market ${mid}` });
                linksArr.push({ source: centerId, target: nid });
            });
        }
    }
  }
  // >>> 场景 C: 默认概览模式 (Overview Mode) <<<
  else {
      let previewList = [];
      const isSafe = currentMode.value === 'safe';

      if (isSafe) {
          previewList = topRankedSafeSamples.value.slice(0, 4);
      } else {
          previewList = topRankedAnomalies.value.slice(0, 4);
      }
      
      previewList.forEach((sample, idx) => {
          const id = sample.id;
          const centerId = `InspectionRecord_${id}`;
          
          nodesMap.set(centerId, { 
              id: centerId, ...parse(centerId), 
              val: 20, 
              displayName: isSafe ? `Safe #${id}` : `Top ${idx+1}: #${id}`, 
              isClusterHead: true 
          });

          const rawExp = explanations.value[id] || explanations.value[String(id)];
          const chain = getChainFromExp(rawExp).slice(0, 3); 
          
          // 如果有 Path (风险样本)，画 Path
          if (chain.length > 0) {
              chain.forEach((link: any) => {
                  const norm = (s: string) => { const p = parse(s); return `${p.type}_${p.rawId}`; };
                  const u = norm(link.from);
                  const v = norm(link.to);

                  if (!nodesMap.has(u)) nodesMap.set(u, { id: u, ...parse(u), val: 1, displayName: link.from_label || u });
                  if (!nodesMap.has(v)) nodesMap.set(v, { id: v, ...parse(v), val: 1, displayName: link.to_label || v });
                  
                  const exists = linksArr.some(l => (l.source === u && l.target === v) || (l.source === v && l.target === u));
                  if (!exists) linksArr.push({ source: u, target: v });
              });
          } 
          // [修复] 如果是 Overview 里的安全样本 (无Path)，也画 Context 概览
          else if (isSafe) {
             const ctx = context.value?.[String(id)];
             if (ctx) {
                // 简略画一下 Farmer 和 Market 即可
                ctx.farmers?.slice(0,1).forEach((fid:any) => {
                    const nid = `Farmer_${fid}`;
                    if(!nodesMap.has(nid)) nodesMap.set(nid, { id: nid, ...parse(nid), val: 5, displayName: `Farmer` });
                    linksArr.push({ source: nid, target: centerId });
                });
                ctx.markets?.slice(0,1).forEach((mid:any) => {
                    const nid = `Market_${mid}`;
                    if(!nodesMap.has(nid)) nodesMap.set(nid, { id: nid, ...parse(nid), val: 5, displayName: `Market` });
                    linksArr.push({ source: centerId, target: nid });
                });
             }
          }
      });
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links: linksArr,
    mode: pivotFilter.value ? 'ENTITY' : (selectedSampleId.value ? 'SAMPLE' : 'OVERVIEW') 
  };
});

// --- 4. 绘图与物理仿真 ---
const drawTopology = () => {
  if (!chartContainer.value) return;
  if (simulation) simulation.stop();
  const container = d3.select(chartContainer.value);
  container.selectAll("*").remove();

  const rawData = graphData.value;
  const isSafe = currentMode.value === 'safe';
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

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .style("font-family", "'Times New Roman', serif")
    .style("background-color", isFullscreen.value ? "#f9f9f9" : "#fff");

  const maxVal = d3.max(nodes, (d: any) => d.val) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxVal]).range([14, 28]); 

  const chargeStrength = isFullscreen.value ? -600 : -400; 
  const linkDistance = isFullscreen.value ? 100 : 70; 
  
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d: any) => d.id).distance(linkDistance))
    .force("charge", d3.forceManyBody().strength(chargeStrength)) 
    .force("collide", d3.forceCollide().radius((d: any) => rScale(d.val) + 10).iterations(2));
  
  if (graphMode === 'SAMPLE') {
      const targetPos: Record<string, {x: number, y: number}> = {
          'Farmer':      { x: -width * 0.25, y: -height * 0.35 },
          'Product':     { x: -width * 0.35, y: -height * 0.15 },
          'Market':      { x: -width * 0.35, y: height * 0.15 },
          'Contaminant': { x: -width * 0.25, y: height * 0.35 },
          'InspectionRecord': { x: width * 0.3, y: 0 }
      };
      
      simulation.force("x", d3.forceX((d: any) => {
          if (d.isCenter) return width * 0.3; 
          return targetPos[d.type] ? targetPos[d.type].x : 0;
      }).strength(0.6));

      simulation.force("y", d3.forceY((d: any) => {
          if (d.isCenter) return 0;
          return targetPos[d.type] ? targetPos[d.type].y : 0;
      }).strength(0.6));
      
      simulation.force("center", d3.forceCenter(0, 0).strength(0.05));

  } else if (graphMode === 'OVERVIEW') {
      simulation.force("center", d3.forceCenter(0, 0));
      simulation.force("x", d3.forceX(0).strength(0.05));
      simulation.force("y", d3.forceY(0).strength(0.05));
  } else {
      simulation.force("center", d3.forceCenter(0, 0));
  }

  const contentLayer = svg.append("g").attr("class", "content-layer");
  const linkColor = isSafe ? '#b3e19d' : '#bbb'; 

  svg.append("defs").append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 26) 
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
    .attr("opacity", 0.6)
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
        } else if (graphMode === 'OVERVIEW') {
            if (d.type === 'InspectionRecord') {
                const cleanId = d.id.replace(/[^0-9]/g, '');
                store.selectSample(parseInt(cleanId));
            }
        } else {
            if (d.type === 'InspectionRecord') {
                const cleanId = d.id.replace(/[^0-9]/g, '');
                store.selectSample(parseInt(cleanId));
                store.clearPivotFilter();
            } else if (d.isCenter) store.clearPivotFilter();
        }
    });

  nodeSelection.append("circle")
    .attr("r", (d: any) => (d.isCenter || d.isClusterHead) ? 28 : rScale(d.val))
    .attr("fill", (d: any) => (d.isCenter || d.isClusterHead) ? (isSafe ? '#444' : '#333') : (TYPE_COLORS.value[d.type] || '#ccc'))
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  nodeSelection.append("circle")
    .attr("r", (d: any) => ((d.isCenter || d.isClusterHead) ? 28 : rScale(d.val)) + 5)
    .attr("fill", "none")
    .attr("stroke", isSafe ? '#67c23a' : '#e15759')
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "4,2")
    .attr("opacity", (d: any) => (pivotFilter.value === d.id || d.isClusterHead) ? 1 : 0);

  nodeSelection.append("text")
    .text((d: any) => d.isCenter ? (graphMode === 'ENTITY' ? 'TARGET' : 'ROOT') : d.rawId)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "10px")
    .style("font-family", "Arial")
    .style("fill", "#fff")
    .style("pointer-events", "none");

  if (graphMode === 'SAMPLE') {
      const titles = [
          { text: "Farmer", x: -width * 0.25, y: -height * 0.4 },
          { text: "Product", x: -width * 0.38, y: -height * 0.2 },
          { text: "Market", x: -width * 0.38, y: height * 0.2 },
          { text: "Contaminant", x: -width * 0.25, y: height * 0.4 },
          { text: "Target Sample", x: width * 0.3, y: -40 }
      ];
      const titleLayer = svg.append("g").attr("class", "titles").lower();
      titles.forEach(t => {
          titleLayer.append("text")
            .attr("x", t.x).attr("y", t.y)
            .text(t.text).attr("text-anchor", "middle")
            .style("fill", "#e0e0e0").style("font-size", isFullscreen.value ? "14px" : "11px") 
            .style("font-weight", "bold").style("letter-spacing", "1px").style("text-transform", "uppercase");
      });
  } else if (graphMode === 'OVERVIEW') {
       const isSafe = currentMode.value === 'safe';
       svg.append("text")
         .attr("x", 0).attr("y", -height/2 + 20)
         .text(isSafe ? "Typical Safe Supply Chains" : "Top Risk Clusters View")
         .attr("text-anchor", "middle")
         .style("fill", isSafe ? "#67c23a" : "#e15759")
         .style("font-size", "12px").style("font-weight", "bold");
  }

  simulation.on("tick", () => {
    linkSelection
      .attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y)
      .attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
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

watch([selectedSampleId, pivotFilter, explanations, context, currentMode], () => { nextTick(drawTopology); });

onMounted(() => {
  window.addEventListener('keydown', handleEscKey); 
  if (chartContainer.value) {
    resizeObserver = new ResizeObserver(() => requestAnimationFrame(drawTopology));
    resizeObserver.observe(chartContainer.value);
  }
  nextTick(drawTopology);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscKey); 
  if (resizeObserver) resizeObserver.disconnect();
  if (simulation) simulation.stop();
});
</script>

<template>
  <div class="graph-wrapper" :class="{ 'is-fullscreen': isFullscreen }">
    <div class="chart-header">
        <div class="chart-title">
            <span v-if="pivotFilter">Pivot View</span>
            <span v-else-if="selectedSampleId">
                {{ currentMode === 'safe' ? '✨ Safe Traceability' : '🚨 Causal Topology' }}
            </span>
            <span v-else style="display: flex; align-items: center; gap: 4px;" 
                  :style="{ color: currentMode === 'safe' ? '#67c23a' : '#e15759' }">
                <el-icon v-if="currentMode === 'safe'"><CircleCheck /></el-icon>
                <el-icon v-else><Grid /></el-icon>
                {{ currentMode === 'safe' ? 'Typical Safe Supply Chains' : 'Global Risk Clusters' }}
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
  transition: all 0.3s ease; 
}
.graph-wrapper.is-fullscreen {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2000; padding: 20px; border: none;
}
.chart-header {
    width: 100%; display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 5px;
}
.chart-title {
    font-family: 'Times New Roman', serif; font-size: 13px; font-weight: bold; color: #333; text-transform: uppercase; letter-spacing: 1px;
}
.header-actions { display: flex; align-items: center; }
.action-icon { cursor: pointer; font-size: 16px; color: #666; transition: color 0.2s; padding: 4px; border-radius: 4px; }
.action-icon:hover { color: #409eff; background-color: #f0f7ff; }
.chart-container { flex: 1; width: 100%; min-height: 0; cursor: grab; }
.chart-container:active { cursor: grabbing; }
.graph-tooltip {
  position: fixed; background: rgba(255,255,255,0.95); color: #333; border: 1px solid #ddd;
  padding: 6px 10px; border-radius: 4px; font-family: sans-serif; font-size: 12px;
  pointer-events: none; opacity: 0; transition: opacity 0.1s; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
</style> -->






<script setup lang="ts">
import { onMounted, ref, watch, nextTick, onUnmounted, computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';
import { FullScreen, CopyDocument, Grid, CircleCheck } from '@element-plus/icons-vue';

const store = useExplorerStore();
const { 
  selectedSampleId, explanations, context, pivotFilter, 
  topRankedAnomalies, topRankedSafeSamples 
} = storeToRefs(store);

// --- 全屏逻辑 ---
const isFullscreen = ref(false);
const toggleFullscreen = () => { isFullscreen.value = !isFullscreen.value; };
const handleEscKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen.value) isFullscreen.value = false; };

// 1. 获取分析模式
const currentMode = computed(() => {
  if (store.currentAnalysisMode) return store.currentAnalysisMode;
  const sample = store.samples?.find(s => s.id === selectedSampleId.value);
  if (sample && sample.riskLevel === '低风险') return 'safe';
  return 'risk';
});

// 2. 动态颜色配置 (包含展开后的红绿样本)
const TYPE_COLORS = computed(() => {
  const isSafe = currentMode.value === 'safe';
  return {
    'InspectionRecord': isSafe ? '#67c23a' : '#e15759', 
    'Product': '#f28e2c',          
    'Market': '#4e79a7',           
    'Farmer': isSafe ? '#529b2e' : '#59a14f', 
    'Contaminant': '#76b7b2',      
    'Unknown': '#bab0ac',
    // [新] 展开后的子样本颜色
    'RiskSample': '#f56c6c', // 鲜红
    'SafeSample': '#67c23a'  // 鲜绿
  };
});

const chartContainer = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
let simulation: d3.Simulation<any, any> | null = null;
let resizeObserver: ResizeObserver | null = null;

// --- 3. 数据构建 ---
const graphData = computed(() => {
  const nodesMap = new Map<string, any>();
  const linksArr: any[] = [];

  // ID 解析辅助函数
  const parse = (str: string) => {
    if (!str) return { type: 'Unknown', rawId: '?' };
    const cleanStr = str.replace(/['"]/g, '').trim();
    // 兼容 "Farmer_123" 和 "Farmer[123]" 格式
    const match = cleanStr.match(/^([a-zA-Z]+)[_\[](\d+)\]?$/);
    if (match) return { type: match[1], rawId: match[2], fullName: cleanStr };
    const parts = cleanStr.split('_');
    if (parts.length > 1) return { type: parts[0], rawId: parts[1], fullName: cleanStr };
    return { type: 'Unknown', rawId: cleanStr, fullName: cleanStr };
  };

  const getChainFromExp = (rawExp: any) => {
    if (!rawExp) return [];
    if (Array.isArray(rawExp)) return rawExp;
    if (rawExp.paths && Array.isArray(rawExp.paths)) return rawExp.paths;
    return [];
  };

  // >>> 场景 A: 实体透视 (Pivot Mode) - 点击市场/农户后展开 <<<
  if (pivotFilter.value) {
    const centerEntity = pivotFilter.value;
    // 中心节点
    nodesMap.set(centerEntity, { 
        id: centerEntity, ...parse(centerEntity), 
        isCenter: true, val: 50, displayName: centerEntity 
    });
    
    // 遍历寻找关联样本
    store.samples.forEach(sample => {
        const idStr = String(sample.id);
        const ctx = context.value?.[idStr];
        
        let isRelated = false;
        if (ctx) {
            const pureId = centerEntity.split('_')[1]; 
            const type = centerEntity.split('_')[0];

            if (type === 'Farmer' && ctx.farmers?.map(String).includes(pureId)) isRelated = true;
            if (type === 'Market' && ctx.markets?.map(String).includes(pureId)) isRelated = true;
            if (type === 'Product' && ctx.products?.map(String).includes(pureId)) isRelated = true;
            if (type === 'Contaminant' && ctx.contaminants?.includes(pureId)) isRelated = true;
        }

        if (isRelated) {
            const sampleNodeId = `InspectionRecord_${sample.id}`;
            const isRisky = sample.riskLevel !== '低风险';
            // 区分颜色类型
            const nodeType = isRisky ? 'RiskSample' : 'SafeSample';
            
            if (!nodesMap.has(sampleNodeId)) {
                nodesMap.set(sampleNodeId, { 
                    id: sampleNodeId, 
                    type: nodeType, 
                    rawId: String(sample.id), 
                    val: 15, // 稍微大一点好点
                    displayName: `Sample #${sample.id}` 
                });
            }
            linksArr.push({ source: centerEntity, target: sampleNodeId });
        }
    });
  } 
  // >>> 场景 B: 单样本选中 (Sample Mode) <<<
  else if (selectedSampleId.value) {
    const id = selectedSampleId.value;
    const idStr = String(id);
    const expMap = explanations.value || {};
    let chain = getChainFromExp(expMap[id] || expMap[idStr]);

    // 优先用 GNN 解释路径
    if (chain && chain.length > 0) {
        const centerId = `InspectionRecord_${id}`;
        nodesMap.set(centerId, { id: centerId, ...parse(centerId), isCenter: true, val: 40, displayName: `Sample #${id}` });

        chain.forEach((link: any) => {
            const norm = (s: string) => { const p = parse(s); return `${p.type}_${p.rawId}`; };
            const u = norm(link.from);
            const v = norm(link.to);

            if (!nodesMap.has(u)) nodesMap.set(u, { id: u, ...parse(u), val: 20, displayName: link.from_label || u });
            if (!nodesMap.has(v)) nodesMap.set(v, { id: v, ...parse(v), val: 20, displayName: link.to_label || v });

            const exists = linksArr.some(l => (l.source === u && l.target === v) || (l.source === v && l.target === u));
            if (!exists) linksArr.push({ source: u, target: v });
        });
    } 
    // 兜底用 Context 1-hop
    else {
        const ctx = context.value?.[idStr];
        if (ctx) {
            const centerId = `InspectionRecord_${id}`;
            nodesMap.set(centerId, { id: centerId, ...parse(centerId), isCenter: true, val: 40, displayName: `Safe Sample #${id}` });

            ctx.farmers?.forEach((fid: any) => {
                const nid = `Farmer_${fid}`;
                nodesMap.set(nid, { id: nid, ...parse(nid), val: 20, displayName: `Farmer ${fid}` });
                linksArr.push({ source: nid, target: centerId });
            });
            ctx.markets?.forEach((mid: any) => {
                const nid = `Market_${mid}`;
                nodesMap.set(nid, { id: nid, ...parse(nid), val: 20, displayName: `Market ${mid}` });
                linksArr.push({ source: centerId, target: nid });
            });
            ctx.products?.forEach((pid: any) => {
                const nid = `Product_${pid}`;
                nodesMap.set(nid, { id: nid, ...parse(nid), val: 20, displayName: `Product ${pid}` });
                linksArr.push({ source: nid, target: centerId });
            });
        }
    }
  }
  // >>> 场景 C: 概览 (Overview) <<<
  else {
      let previewList = currentMode.value === 'safe' 
        ? topRankedSafeSamples.value.slice(0, 4) 
        : topRankedAnomalies.value.slice(0, 4);
      
      previewList.forEach((sample, idx) => {
          const centerId = `InspectionRecord_${sample.id}`;
          nodesMap.set(centerId, { 
              id: centerId, ...parse(centerId), val: 30, 
              displayName: currentMode.value === 'safe' ? `Safe #${sample.id}` : `Risk #${sample.id}`, 
              isClusterHead: true 
          });
          // ... (简略展示逻辑，保持不变)
      });
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links: linksArr,
    mode: pivotFilter.value ? 'ENTITY' : (selectedSampleId.value ? 'SAMPLE' : 'OVERVIEW') 
  };
});

// --- 4. 绘图逻辑 (物理参数调优) ---
const drawTopology = () => {
  if (!chartContainer.value) return;
  if (simulation) simulation.stop();
  const container = d3.select(chartContainer.value);
  container.selectAll("*").remove();

  const rawData = graphData.value;
  if (rawData.nodes.length === 0) {
    // Empty state
    return;
  }

  const width = chartContainer.value.clientWidth;
  const height = chartContainer.value.clientHeight || 300;
  const nodes = JSON.parse(JSON.stringify(rawData.nodes));
  const links = JSON.parse(JSON.stringify(rawData.links));
  const graphMode = rawData.mode;

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .style("background-color", isFullscreen.value ? "#f9f9f9" : "#fff");

  // [调优 1] 节点半径：根据 val 稍微调小一点，防止太拥挤
  const rScale = d3.scaleSqrt().domain([0, 50]).range([8, 22]);

  // [调优 2] 物理参数：收紧结构
  // - strength: 斥力，绝对值越小越不排斥 (-400 -> -120)
  // - distance: 连线长度 (70 -> 40)
  const chargeStrength = isFullscreen.value ? -200 : -120; 
  const linkDistance = isFullscreen.value ? 60 : 40; 

  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d: any) => d.id).distance(linkDistance))
    .force("charge", d3.forceManyBody().strength(chargeStrength)) 
    .force("collide", d3.forceCollide().radius((d: any) => rScale(d.val) + 5).iterations(2));

  // [调优 3] 布局策略
  if (graphMode === 'ENTITY') {
      // 透视模式：强力向心，把所有关联样本吸在周围
      simulation.force("radial", d3.forceRadial(10, 0, 0).strength(0.1));
      simulation.force("center", d3.forceCenter(0, 0));
  } 
  else if (graphMode === 'SAMPLE') {
      // 样本模式：保持之前的扇形布局，为了美观
      const targetPos: Record<string, {x: number, y: number}> = {
          'Farmer':      { x: -width * 0.2, y: -height * 0.25 }, // 缩进一点
          'Product':     { x: -width * 0.25, y: -height * 0.1 },
          'Market':      { x: -width * 0.25, y: height * 0.1 },
          'Contaminant': { x: -width * 0.2, y: height * 0.25 },
          'InspectionRecord': { x: width * 0.15, y: 0 }
      };
      simulation.force("x", d3.forceX((d: any) => {
          if (d.isCenter) return width * 0.15; 
          return targetPos[d.type] ? targetPos[d.type].x : 0;
      }).strength(0.5));
      simulation.force("y", d3.forceY((d: any) => {
          if (d.isCenter) return 0;
          return targetPos[d.type] ? targetPos[d.type].y : 0;
      }).strength(0.5));
      simulation.force("center", d3.forceCenter(0, 0).strength(0.05));
  } else {
      simulation.force("center", d3.forceCenter(0, 0));
  }

  // --- 绘制 ---
  const contentLayer = svg.append("g");
  const linkColor = currentMode.value === 'safe' ? '#b3e19d' : '#bbb';

  // 连线
  const linkSelection = contentLayer.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", linkColor) 
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.6);

  // 节点
  const nodeSelection = contentLayer.append("g")
    .selectAll(".node")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .call(drag(simulation) as any)
    .style("cursor", "pointer")
    
    // [核心交互修复] 点击事件
    .on("click", (e, d: any) => {
        hideTooltip();
        
        // 1. 如果点击的是【样本】(不管是中心的，还是展开后的红/绿样本)
        // 逻辑：退出透视模式 -> 选中该样本
        if (d.type === 'InspectionRecord' || d.type === 'RiskSample' || d.type === 'SafeSample') {
            const cleanId = d.id.replace(/[^0-9]/g, '');
            store.clearPivotFilter(); // [关键] 先清除透视，否则会卡在 Pivot View
            store.selectSample(parseInt(cleanId));
        } 
        // 2. 如果点击的是【实体】(如市场/农户)，且不是当前中心
        // 逻辑：进入该实体的透视模式
        else if (!d.isCenter) {
            store.setPivotFilter(d.id);
        }
        // 3. 如果点击的是【当前中心实体】
        // 逻辑：取消透视，回到上一个选中样本 (或者全局)
        else if (d.isCenter) {
            store.clearPivotFilter();
        }
    });

  // 圆圈
  nodeSelection.append("circle")
    .attr("r", (d: any) => d.isCenter ? 26 : rScale(d.val))
    .attr("fill", (d: any) => {
        // 中心节点特殊颜色
        if (d.isCenter) return currentMode.value === 'safe' ? '#444' : '#333';
        return TYPE_COLORS.value[d.type] || '#ccc';
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  // 标签
  nodeSelection.append("text")
    .text((d: any) => {
        if (d.isCenter) return graphMode === 'ENTITY' ? 'HUB' : 'ROOT';
        // 如果是样本，只显示 ID 后4位，避免太长
        if (d.type.includes('Sample') || d.type === 'InspectionRecord') return '#' + d.rawId.slice(-4);
        return d.rawId.length > 6 ? d.rawId.slice(0,5)+'..' : d.rawId;
    })
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "9px")
    .style("font-family", "Arial")
    .style("fill", "#fff")
    .style("pointer-events", "none");

  // 背景标题
  if (graphMode === 'ENTITY') {
       svg.append("text")
         .attr("x", 0).attr("y", -height/2 + 20)
         .text(`Expanding: ${pivotFilter.value}`)
         .attr("text-anchor", "middle")
         .style("fill", "#409eff")
         .style("font-size", "12px").style("font-weight", "bold");
  }

  // 动画
  simulation.on("tick", () => {
    linkSelection
      .attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y)
      .attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
    nodeSelection.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
  });
  
  // Tooltip
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
  
  let label = d.displayName || d.fullName || d.id;
  
  tooltipRef.value.style.opacity = '1';
  tooltipRef.value.innerHTML = `
    <div style="font-weight:bold;color:${color}">${d.type}</div>
    <div style="font-size:11px;color:#333;margin-top:2px;max-width:150px;word-wrap:break-word">${label}</div>
  `;
  tooltipRef.value.style.left = `${event.clientX + 10}px`;
  tooltipRef.value.style.top = `${event.clientY + 10}px`;
};
const hideTooltip = () => { if (tooltipRef.value) tooltipRef.value.style.opacity = '0'; };

const renderEmptyState = (container: any, width: number, height: number) => {
  const svg = container.append("svg").attr("width", width).attr("height", height);
  svg.append("text").text("No Data").attr("x", width/2).attr("y", height/2).attr("text-anchor", "middle").style("fill","#ccc");
};

watch([selectedSampleId, pivotFilter, explanations, context, currentMode], () => { nextTick(drawTopology); });

onMounted(() => {
  window.addEventListener('keydown', handleEscKey); 
  if (chartContainer.value) {
    resizeObserver = new ResizeObserver(() => requestAnimationFrame(drawTopology));
    resizeObserver.observe(chartContainer.value);
  }
  nextTick(drawTopology);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscKey); 
  if (resizeObserver) resizeObserver.disconnect();
  if (simulation) simulation.stop();
});
</script>

<template>
  <div class="graph-wrapper" :class="{ 'is-fullscreen': isFullscreen }">
    <div class="chart-header">
        <div class="chart-title">
            <span v-if="pivotFilter">Pivot View</span>
            <span v-else-if="selectedSampleId">
                {{ currentMode === 'safe' ? '✨ Safe Traceability' : '🚨 Causal Topology' }}
            </span>
            <span v-else style="display: flex; align-items: center; gap: 4px;" 
                  :style="{ color: currentMode === 'safe' ? '#67c23a' : '#e15759' }">
                <el-icon v-if="currentMode === 'safe'"><CircleCheck /></el-icon>
                <el-icon v-else><Grid /></el-icon>
                {{ currentMode === 'safe' ? 'Typical Supply Chains' : 'Risk Clusters' }}
            </span>
        </div>
        <div class="header-actions">
            <el-icon class="action-icon" @click="toggleFullscreen"><component :is="isFullscreen ? CopyDocument : FullScreen" /></el-icon>
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
  position: relative; border-left: 1px solid #f0f0f0; transition: all 0.3s ease; 
}
.graph-wrapper.is-fullscreen {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2000; padding: 20px; border: none;
}
.chart-header {
    width: 100%; display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 5px;
}
.chart-title {
    font-family: 'Times New Roman', serif; font-size: 13px; font-weight: bold; color: #333; text-transform: uppercase; letter-spacing: 1px;
}
.header-actions { display: flex; align-items: center; }
.action-icon { cursor: pointer; font-size: 16px; color: #666; transition: color 0.2s; padding: 4px; border-radius: 4px; }
.action-icon:hover { color: #409eff; background-color: #f0f7ff; }
.chart-container { flex: 1; width: 100%; min-height: 0; cursor: grab; }
.chart-container:active { cursor: grabbing; }
.graph-tooltip {
  position: fixed; background: rgba(255,255,255,0.95); color: #333; border: 1px solid #ddd;
  padding: 6px 10px; border-radius: 4px; font-family: sans-serif; font-size: 12px;
  pointer-events: none; opacity: 0; transition: opacity 0.1s; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
</style>