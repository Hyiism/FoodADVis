<script setup lang="ts">
import { onMounted, ref, watch, nextTick, onUnmounted, computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';

const store = useExplorerStore();
const { selectedSampleId, explanations, pivotFilter } = storeToRefs(store);

// 1. 获取分析模式
const currentMode = computed(() => store.currentAnalysisMode || 'risk');

// 2. 动态颜色配置 (Safe vs Risk)
const TYPE_COLORS = computed(() => {
  const isSafe = currentMode.value === 'safe';
  return {
    // 核心节点颜色区分
    'InspectionRecord': isSafe ? '#67c23a' : '#e15759', // 绿 vs 红
    'Product': '#f28e2c',          
    'Market': '#4e79a7',           
    'Farmer': isSafe ? '#529b2e' : '#59a14f', // 安全模式下农户深绿
    'Contaminant': '#76b7b2',      
    'Unknown': '#bab0ac'
  };
});

const ENTITY_TYPES = ['Farmer', 'Contaminant', 'Product', 'InspectionRecord', 'Market', 'Unknown'];

const typeAngleScale = d3.scalePoint()
  .domain(ENTITY_TYPES)
  .range([0, 2 * Math.PI]); 

const chartContainer = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);

let simulation: d3.Simulation<any, any> | null = null;
let resizeObserver: ResizeObserver | null = null;

// 3. 数据准备 (增加 ID 查找容错)
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

  // 模式 A: Pivot (关联查询)
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
  // 模式 B: 样本视图 (Selected Sample)
  else if (selectedSampleId.value) {
    const id = selectedSampleId.value;
    const expMap = explanations.value || {};
    
    // [核心修复] 查找容错：先找数字 Key，再找字符串 Key
    const chain = expMap[id] || expMap[String(id)];

    if (chain && chain.length > 0) {
        const centerId = `InspectionRecord_${id}`;
        const centerLabel = getLabelFromChain(centerId, chain) || `Sample #${id}`;
        
        nodesMap.set(centerId, { id: centerId, ...parse(centerId), isCenter: true, val: 30, displayName: centerLabel });

        chain.forEach((link: any) => {
            let u = link.from;
            let v = link.to;
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

// 4. D3 绘图
const drawTopology = () => {
  if (!chartContainer.value) return;
  if (simulation) simulation.stop();
  const container = d3.select(chartContainer.value);
  container.selectAll("*").remove();

  const rawData = graphData.value;
  
  // 空状态
  if (rawData.nodes.length === 0) {
    const w = chartContainer.value.clientWidth;
    const h = chartContainer.value.clientHeight || 300;
    renderEmptyState(container, w, h);
    return;
  }

  const nodes = JSON.parse(JSON.stringify(rawData.nodes));
  let links = JSON.parse(JSON.stringify(rawData.links));
  const graphMode = rawData.mode;

  const width = chartContainer.value.clientWidth;
  const height = chartContainer.value.clientHeight || 300;
  const maxRadius = Math.min(width, height) / 2;

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .style("font-family", "'Times New Roman', serif")
    .style("background-color", "#fff");

  const maxVal = d3.max(nodes, (d: any) => d.val) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxVal]).range([12, 30]); 

  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d: any) => d.id).distance(80))
    .force("charge", d3.forceManyBody().strength(-200)) 
    .force("center", d3.forceCenter(0, 0))
    .force("collide", d3.forceCollide().radius((d: any) => rScale(d.val) + 5).iterations(3));

  if (graphMode === 'SAMPLE') {
    const angleOffset = -Math.PI / 2;
    simulation.force("x", d3.forceX((d: any) => {
      if (d.isCenter) return 0;
      const angle = (typeAngleScale(d.type) || 0) + angleOffset;
      return Math.cos(angle) * (maxRadius * 0.6); 
    }).strength(0.3));

    simulation.force("y", d3.forceY((d: any) => {
      if (d.isCenter) return 0;
      const angle = (typeAngleScale(d.type) || 0) + angleOffset;
      return Math.sin(angle) * (maxRadius * 0.6);
    }).strength(0.3));
  }

  const contentLayer = svg.append("g").attr("class", "content-layer");

  // [修改] 连线颜色：根据 Safe 模式变绿
  const isSafe = currentMode.value === 'safe';
  const linkColor = isSafe ? '#b3e19d' : '#bbb'; 

  const linkSelection = contentLayer.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", linkColor) 
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.6);

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
                const rawIdStr = d.id.split('_')[1];
                store.selectSample(parseInt(rawIdStr));
                store.clearPivotFilter();
            } else if (d.isCenter) {
                store.clearPivotFilter();
            }
        }
    });

  // [修改] 节点填充色：实时从 TYPE_COLORS 计算属性获取
  nodeSelection.append("circle")
    .attr("r", (d: any) => d.isCenter ? 28 : rScale(d.val))
    .attr("fill", (d: any) => {
        if (d.isCenter) return isSafe ? '#444' : '#333'; 
        return TYPE_COLORS.value[d.type] || '#ccc';
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  nodeSelection.append("circle")
    .attr("r", (d: any) => (d.isCenter ? 28 : rScale(d.val)) + 4)
    .attr("fill", "none")
    .attr("stroke", isSafe ? '#67c23a' : '#333') // 外圈颜色也变化
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

  // 背景标签
  if (graphMode === 'SAMPLE') {
    const labelLayer = svg.append("g").attr("class", "labels").lower();
    const angleOffset = -Math.PI / 2;
    ENTITY_TYPES.forEach(type => {
       if(['Farmer', 'Market', 'Product', 'Contaminant'].includes(type)) {
           const angle = (typeAngleScale(type) || 0) + angleOffset;
           const lx = Math.cos(angle) * (maxRadius * 0.9);
           const ly = Math.sin(angle) * (maxRadius * 0.9);
           labelLayer.append("text")
             .text(type)
             .attr("x", lx)
             .attr("y", ly)
             .attr("text-anchor", "middle")
             .attr("dy", "0.35em")
             .style("font-size", "9px")
             .style("fill", "#ddd")
             .style("font-weight", "bold")
             .style("pointer-events", "none");
       }
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
     .text(selectedSampleId.value ? "No Explanation Path" : "Select a Sample")
     .attr("text-anchor", "middle").style("fill", "#ccc").style("font-size", "12px");
};

// [核心修复] 监听 currentMode，一旦变化强制重绘
watch([selectedSampleId, pivotFilter, explanations, currentMode], () => {
    nextTick(drawTopology);
});

onMounted(() => {
  if (chartContainer.value) {
    resizeObserver = new ResizeObserver(() => requestAnimationFrame(drawTopology));
    resizeObserver.observe(chartContainer.value);
  }
  nextTick(drawTopology);
});

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (simulation) simulation.stop();
});
</script>

<template>
  <div class="graph-wrapper">
    <div class="chart-title">
        <span v-if="pivotFilter">Pivot View</span>
        <span v-else>
            {{ currentMode === 'safe' ? '✨ Safe Traceability' : '🚨 Causal Topology' }}
        </span>
    </div>
    <div ref="chartContainer" class="chart-container"></div>
    <div ref="tooltipRef" class="graph-tooltip"></div>
  </div>
</template>

<style scoped>
/* 样式保持不变 */
.graph-wrapper {
  width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center;
  background-color: #ffffff; padding: 10px; box-sizing: border-box; 
  position: relative;
  border-left: 1px solid #f0f0f0; 
}

.chart-title {
    font-family: 'Times New Roman', serif; 
    font-size: 13px; 
    font-weight: bold;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid #eee;
    padding-bottom: 4px;
    margin-bottom: 5px;
    width: 100%;
    text-align: center;
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
  z-index: 9999;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
</style>