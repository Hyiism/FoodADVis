<!-- <script setup lang="ts">
import { onMounted, ref, watch, nextTick, onUnmounted, computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';

const store = useExplorerStore();
const { selectedSampleId, allExplanations, pivotFilter } = storeToRefs(store);

// --- 1. 配置与布局优化 ---

// [关键修改 1] 重新排序类型数组
// 将主要实体 (Farmer, Product, Market) 隔开，形成三角形分布，避免挤在一边
const ENTITY_TYPES = [
  'Farmer',           // 12点钟方向 (假设)
  'Contaminant',      // 间隔
  'Product',          // 4点钟方向
  'InspectionRecord', // 间隔
  'Market',           // 8点钟方向
  'Unknown'           // 间隔
];

const TYPE_COLORS: Record<string, string> = {
  'InspectionRecord': '#e15759', 
  'Product': '#f28e2c',          
  'Market': '#4e79a7',           
  'Farmer': '#59a14f',           
  'Contaminant': '#76b7b2',      
  'Unknown': '#bab0ac'
};

// 角度映射
const typeAngleScale = d3.scalePoint()
  .domain(ENTITY_TYPES)
  .range([0, 2 * Math.PI]); 

const chartContainer = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);

let simulation: d3.Simulation<any, any> | null = null;
let resizeObserver: ResizeObserver | null = null;

// --- 2. 数据准备 ---
const graphData = computed(() => {
  const nodesMap = new Map<string, any>();
  const linksArr: any[] = [];

  const parse = (str: string) => {
    const match = str.match(/^(\w+)\[(\d+)\]$/);
    return match 
      ? { type: match[1], rawId: match[2], fullName: str } 
      : { type: 'Unknown', rawId: str, fullName: str };
  };

  // 模式 A: 实体视图
  if (pivotFilter.value) {
    const centerEntity = pivotFilter.value;
    nodesMap.set(centerEntity, {
      id: centerEntity, ...parse(centerEntity), isCenter: true, val: 40
    });

    Object.entries(allExplanations.value).forEach(([sId, paths]) => {
      let isRelated = false;
      for (const chain of paths) {
        for (const link of chain) {
          if (link.from === centerEntity || link.to === centerEntity) {
            isRelated = true; break;
          }
        }
        if (isRelated) break;
      }
      if (isRelated) {
        const sampleName = `InspectionRecord[${sId}]`;
        if (!nodesMap.has(sampleName)) nodesMap.set(sampleName, { id: sampleName, ...parse(sampleName), val: 10 });
        linksArr.push({ source: centerEntity, target: sampleName });
      }
    });
  } 
  // 模式 B: 样本视图
  else if (selectedSampleId.value) {
    const id = selectedSampleId.value;
    const paths = allExplanations.value[id] || [];
    const centerId = `InspectionRecord[${id}]`;
    nodesMap.set(centerId, { id: centerId, ...parse(centerId), isCenter: true, val: 30 });

    paths.forEach(chain => {
      chain.forEach(link => {
        if (!nodesMap.has(link.from)) nodesMap.set(link.from, { id: link.from, ...parse(link.from), val: 1 });
        else nodesMap.get(link.from).val++;
        if (!nodesMap.has(link.to)) nodesMap.set(link.to, { id: link.to, ...parse(link.to), val: 1 });
        else nodesMap.get(link.to).val++;
        linksArr.push({ source: link.from, target: link.to });
      });
    });
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links: linksArr,
    mode: pivotFilter.value ? 'ENTITY' : 'SAMPLE' 
  };
});

// --- 3. D3 绘图逻辑 ---
const drawTopology = () => {
  if (!chartContainer.value) return;
  if (simulation) simulation.stop();
  const container = d3.select(chartContainer.value);
  container.selectAll("*").remove();

  const rawData = graphData.value;
  if (rawData.nodes.length === 0) {
    renderEmptyState(container, chartContainer.value.clientWidth, chartContainer.value.clientHeight || 300);
    return;
  }

  const nodes = JSON.parse(JSON.stringify(rawData.nodes));
  let links = JSON.parse(JSON.stringify(rawData.links));
  const currentMode = rawData.mode;

  const nodeIds = new Set(nodes.map((n: any) => n.id));
  links = links.filter((l: any) => nodeIds.has(l.source) && nodeIds.has(l.target));

  const width = chartContainer.value.clientWidth;
  const height = chartContainer.value.clientHeight || 300;
  const maxRadius = Math.min(width, height) / 2;

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .style("font-family", "'Times New Roman', serif")
    .style("background-color", "#fff");

  // --- 物理模拟 ---
  const maxVal = d3.max(nodes, (d: any) => d.val) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxVal]).range([15, 35]); 

  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d: any) => d.id).distance(100))
    // 减小斥力，防止散得太开导致看不见
    .force("charge", d3.forceManyBody().strength(-300)) 
    .force("center", d3.forceCenter(0, 0))
    .force("collide", d3.forceCollide().radius((d: any) => rScale(d.val) + 5).iterations(3));

  // [关键修改 2] 修正扇区引力方向
  // 默认 0度在右边 (3点钟)。我们需要减去 PI/2 让它从上方 (12点钟) 开始
  const angleOffset = -Math.PI / 2;

  if (currentMode === 'SAMPLE') {
    simulation.force("x", d3.forceX((d: any) => {
      if (d.isCenter) return 0;
      const angle = (typeAngleScale(d.type) || 0) + angleOffset;
      // 稍微收缩半径，让节点更聚拢在画面内
      return Math.cos(angle) * (maxRadius * 0.55); 
    }).strength(0.4)); // 增加一点力度，强制归位

    simulation.force("y", d3.forceY((d: any) => {
      if (d.isCenter) return 0;
      const angle = (typeAngleScale(d.type) || 0) + angleOffset;
      return Math.sin(angle) * (maxRadius * 0.55);
    }).strength(0.4));
  }

  // --- 绘制内容 ---
  const contentLayer = svg.append("g").attr("class", "content-layer");

  // 1. 连线
  const linkSelection = contentLayer.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", "#bbb") 
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.5);

  // 2. 节点
  const nodeSelection = contentLayer.append("g")
    .selectAll(".node")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .call(drag(simulation) as any)
    .style("cursor", "pointer")
    .on("click", (e, d: any) => {
        hideTooltip();
        if (currentMode === 'SAMPLE') {
            if (!d.isCenter) store.setPivotFilter(d.id);
        } else {
            if (d.type === 'InspectionRecord') {
                store.selectSample(parseInt(d.rawId));
                store.clearPivotFilter();
            } else if (d.isCenter) {
                store.clearPivotFilter();
            }
        }
    });

  nodeSelection.append("circle")
    .attr("class", "main-circle")
    .attr("r", (d: any) => d.isCenter ? 32 : rScale(d.val)) // 中心稍微缩小一点点
    .attr("fill", (d: any) => d.isCenter ? "#333" : TYPE_COLORS[d.type])
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("transition", "fill 0.2s");

  // 选中外圈
  nodeSelection.append("circle")
    .attr("class", "selection-ring")
    .attr("r", (d: any) => (d.isCenter ? 32 : rScale(d.val)) + 5)
    .attr("fill", "none")
    .attr("stroke", "#333")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "3,3")
    .attr("opacity", (d: any) => {
        if (pivotFilter.value && pivotFilter.value === d.id) return 1;
        return 0;
    });

  // 节点文字
  nodeSelection.append("text")
    .text((d: any) => d.isCenter ? (currentMode === 'ENTITY' ? 'TARGET' : 'ROOT') : d.rawId)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "10px")
    .style("font-family", "Arial, sans-serif")
    .style("fill", "#fff")
    .style("font-weight", "bold")
    .style("pointer-events", "none");

  // 3. [关键修改 3] 绘制极简的方位标签 (Optional: 增加方向感)
  if (currentMode === 'SAMPLE') {
    const labelLayer = svg.append("g").attr("class", "labels").lower();
    const validTypes = ENTITY_TYPES.filter(t => t !== 'InspectionRecord' && t !== 'Unknown');
    
    validTypes.forEach(type => {
       // 只绘制 Farmer, Market, Product 的标签，避免杂乱
       if(['Farmer', 'Market', 'Product'].includes(type)) {
           const angle = (typeAngleScale(type) || 0) + angleOffset;
           const lx = Math.cos(angle) * (maxRadius * 0.85);
           const ly = Math.sin(angle) * (maxRadius * 0.85);
           
           labelLayer.append("text")
             .text(type)
             .attr("x", lx)
             .attr("y", ly)
             .attr("text-anchor", "middle")
             .attr("dy", "0.35em")
             .style("font-size", "10px")
             .style("font-weight", "bold")
             .style("fill", "#e0e0e0") // 极淡的灰色，仅作为背景参考
             .style("text-transform", "uppercase")
             .style("pointer-events", "none");
       }
    });
  }

  // --- 交互 ---
  nodeSelection.on("mouseover", function(event, d: any) {
    nodeSelection.attr("opacity", 0.2);
    linkSelection.attr("opacity", 0.1);
    d3.select(this).attr("opacity", 1);
    const connectedIds = new Set();
    linkSelection.filter((l: any) => {
        if (l.source.id === d.id || l.target.id === d.id) {
            connectedIds.add(l.source.id);
            connectedIds.add(l.target.id);
            return true;
        }
        return false;
    })
    .attr("stroke", "#333")
    .attr("stroke-width", 2)
    .attr("opacity", 1);
    nodeSelection.filter((n: any) => connectedIds.has(n.id)).attr("opacity", 1);
    showTooltip(event, d);
  })
  .on("mouseout", function() {
    nodeSelection.attr("opacity", (d: any) => {
        if (pivotFilter.value && pivotFilter.value !== d.id) return 0.2;
        return 1;
    });
    linkSelection.attr("stroke", "#bbb").attr("stroke-width", 1.5).attr("opacity", 0.6);
    hideTooltip();
  });

  simulation.on("tick", () => {
    linkSelection
      .attr("x1", (d: any) => d.source.x)
      .attr("y1", (d: any) => d.source.y)
      .attr("x2", (d: any) => d.target.x)
      .attr("y2", (d: any) => d.target.y);

    nodeSelection.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
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
  tooltipRef.value.style.opacity = '1';
  tooltipRef.value.innerHTML = `
    <div style="border-bottom:1px solid #eee; padding-bottom:4px; margin-bottom:4px; font-weight:bold; color:#333">
      ${d.type}
    </div>
    <div style="font-family:monospace; color:#666">ID: ${d.rawId}</div>
  `;
  tooltipRef.value.style.left = `${event.clientX + 15}px`;
  tooltipRef.value.style.top = `${event.clientY + 15}px`;
};
const hideTooltip = () => {
  if (tooltipRef.value) tooltipRef.value.style.opacity = '0';
};

const renderEmptyState = (container: any, width: number, height: number) => {
  const svg = container.append("svg").attr("width", width).attr("height", height);
  svg.append("text").attr("x", width / 2).attr("y", height / 2).text("Select a Node").attr("text-anchor", "middle").style("fill", "#ccc").style("font-family", "Times New Roman");
};

watch([selectedSampleId, pivotFilter], () => nextTick(drawTopology));

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
        {{ pivotFilter ? 'Related Context' : 'Entity Topology' }}
    </div>
    <div ref="chartContainer" class="chart-container"></div>
    <div ref="tooltipRef" class="graph-tooltip"></div>
  </div>
</template>

<style scoped>
.graph-wrapper {
  width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center;
  background-color: #ffffff; padding: 20px; box-sizing: border-box; border-right: 1px solid #f0f0f0;
}

.chart-title {
    font-family: 'Times New Roman', serif; 
    font-size: 14px; 
    font-weight: bold;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid #333;
    padding-bottom: 4px;
    margin-bottom: 10px;
    width: 100%;
    text-align: center;
}

.chart-container {
  flex: 1; width: 100%; min-height: 0; cursor: grab;
}
.chart-container:active { cursor: grabbing; }

.graph-tooltip {
  position: fixed;
  background: #ffffff;
  color: #333;
  border: 1px solid #ccc;
  padding: 8px 12px;
  border-radius: 2px;
  font-family: 'Helvetica Neue', sans-serif; 
  font-size: 12px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.1s;
  z-index: 9999;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}
</style> -->



<script setup lang="ts">
import { onMounted, ref, watch, nextTick, onUnmounted, computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';

const store = useExplorerStore();
// [修复] 使用正确的 store 变量名
const { selectedSampleId, explanations, pivotFilter } = storeToRefs(store);

// --- 1. 配置与布局优化 ---
const ENTITY_TYPES = [
  'Farmer',           
  'Contaminant',      
  'Product',          
  'InspectionRecord', 
  'Market',           
  'Unknown'           
];

const TYPE_COLORS: Record<string, string> = {
  'InspectionRecord': '#e15759', 
  'Product': '#f28e2c',          
  'Market': '#4e79a7',           
  'Farmer': '#59a14f',           
  'Contaminant': '#76b7b2',      
  'Unknown': '#bab0ac'
};

const typeAngleScale = d3.scalePoint()
  .domain(ENTITY_TYPES)
  .range([0, 2 * Math.PI]); 

const chartContainer = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);

let simulation: d3.Simulation<any, any> | null = null;
let resizeObserver: ResizeObserver | null = null;

// --- 2. 数据准备 ---
const graphData = computed(() => {
  const nodesMap = new Map<string, any>();
  const linksArr: any[] = [];

  // 节点解析器 (统一逻辑)
  const parse = (str: string) => {
    if (!str) return { type: 'Unknown', rawId: '?' };
    const cleanStr = str.replace(/['"]/g, '').trim();
    // 匹配 Type_ID 或 Type[ID]
    const match = cleanStr.match(/^([a-zA-Z]+)[_\[](\d+)\]?$/);
    if (match) {
      return { type: match[1], rawId: match[2], fullName: cleanStr };
    }
    // 兜底
    const parts = cleanStr.split('_');
    if (parts.length > 1) {
      return { type: parts[0], rawId: parts[1], fullName: cleanStr };
    }
    return { type: 'Unknown', rawId: cleanStr, fullName: cleanStr };
  };

  // [新增] 辅助函数：根据 ID 字符串查找中文名
  // 我们利用 explanation 里的 label 信息来填充
  // 注意：这个逻辑依赖于当前 explanation 中是否包含该节点的信息
  const getLabelFromChain = (idStr: string, chain: any[]) => {
    // 遍历链条，看能不能找到这个 ID 对应的 label
    for (const link of chain) {
      if (link.from === idStr && link.from_label) return link.from_label;
      if (link.to === idStr && link.to_label) return link.to_label;
    }
    return null;
  };

  // 模式 A: 实体视图 (Pivot Filter)
  if (pivotFilter.value) {
    const centerEntity = pivotFilter.value;
    // 尝试在所有 explanations 里找这个实体的名字 (稍微有点慢，但数据量不大)
    let centerName = centerEntity;
    // ... 这里省略全量搜索，直接用 ID 显示，或者如果你有全局字典更好
    
    nodesMap.set(centerEntity, {
      id: centerEntity, ...parse(centerEntity), isCenter: true, val: 40, displayName: centerName
    });

    const expMap = explanations.value || {};
    Object.entries(expMap).forEach(([sId, pathLinks]) => {
      let isRelated = false;
      const chain = pathLinks as any[];
      
      for (const link of chain) {
        if (link.from === centerEntity || link.to === centerEntity) {
          isRelated = true; break;
        }
      }
      
      if (isRelated) {
        const sampleName = `InspectionRecord_${sId}`;
        if (!nodesMap.has(sampleName)) {
            // 尝试从 chain 里获取样本的 label
            const label = getLabelFromChain(sampleName, chain) || sampleName;
            nodesMap.set(sampleName, { 
                id: sampleName, 
                ...parse(sampleName), 
                val: 10,
                displayName: label // [新增]
            });
        }
        linksArr.push({ source: centerEntity, target: sampleName });
      }
    });
  } 
  // 模式 B: 样本视图 (Selected Sample)
  else if (selectedSampleId.value) {
    const id = selectedSampleId.value;
    const expMap = explanations.value || {};
    const chain = expMap[id]; 

    if (chain && chain.length > 0) {
        // 中心节点 (样本)
        const centerId = `InspectionRecord_${id}`;
        // 尝试获取样本中文名
        const centerLabel = getLabelFromChain(centerId, chain) || `Sample #${id}`;
        
        nodesMap.set(centerId, { 
            id: centerId, 
            ...parse(centerId), 
            isCenter: true, 
            val: 30,
            displayName: centerLabel // [新增]
        });

        chain.forEach((link: any) => {
            let u = link.from;
            let v = link.to;
            
            // 确保节点存在，并注入 displayName
            if (!nodesMap.has(u)) {
                nodesMap.set(u, { 
                    id: u, 
                    ...parse(u), 
                    val: 1,
                    displayName: link.from_label || u // [新增] 优先用中文名
                });
            } else {
                nodesMap.get(u).val++;
            }
            
            if (!nodesMap.has(v)) {
                nodesMap.set(v, { 
                    id: v, 
                    ...parse(v), 
                    val: 1,
                    displayName: link.to_label || v // [新增] 优先用中文名
                });
            } else {
                nodesMap.get(v).val++;
            }

            const exists = linksArr.some(l => 
                (l.source === u && l.target === v) || (l.source === v && l.target === u)
            );
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

// --- 3. D3 绘图逻辑 ---
const drawTopology = () => {
  if (!chartContainer.value) return;
  if (simulation) simulation.stop();
  const container = d3.select(chartContainer.value);
  container.selectAll("*").remove();

  const rawData = graphData.value;
  
  if (rawData.nodes.length === 0) {
    renderEmptyState(container, chartContainer.value.clientWidth, chartContainer.value.clientHeight || 300);
    return;
  }

  const nodes = JSON.parse(JSON.stringify(rawData.nodes));
  let links = JSON.parse(JSON.stringify(rawData.links));
  const currentMode = rawData.mode;

  const nodeIds = new Set(nodes.map((n: any) => n.id));
  links = links.filter((l: any) => nodeIds.has(l.source) && nodeIds.has(l.target));

  const width = chartContainer.value.clientWidth;
  const height = chartContainer.value.clientHeight || 300;
  const maxRadius = Math.min(width, height) / 2;

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .style("font-family", "'Times New Roman', serif")
    .style("background-color", "#fff");

  // 力导向模拟
  const maxVal = d3.max(nodes, (d: any) => d.val) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxVal]).range([12, 30]); 

  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d: any) => d.id).distance(80))
    .force("charge", d3.forceManyBody().strength(-200)) 
    .force("center", d3.forceCenter(0, 0))
    .force("collide", d3.forceCollide().radius((d: any) => rScale(d.val) + 5).iterations(3));

  // 径向布局约束
  const angleOffset = -Math.PI / 2;
  if (currentMode === 'SAMPLE') {
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

  // 绘制
  const contentLayer = svg.append("g").attr("class", "content-layer");

  // 连线
  const linkSelection = contentLayer.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", "#bbb") 
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
    .on("click", (e, d: any) => {
        hideTooltip();
        if (currentMode === 'SAMPLE') {
            if (!d.isCenter) store.setPivotFilter(d.id);
        } else {
            if (d.type === 'InspectionRecord') {
                // 这里解析 ID 需要小心，因为 rawId 是数字字符串
                const rawIdStr = d.id.split('_')[1];
                store.selectSample(parseInt(rawIdStr));
                store.clearPivotFilter();
            } else if (d.isCenter) {
                store.clearPivotFilter();
            }
        }
    });

  // 节点圆圈
  nodeSelection.append("circle")
    .attr("r", (d: any) => d.isCenter ? 28 : rScale(d.val))
    .attr("fill", (d: any) => d.isCenter ? "#333" : (TYPE_COLORS[d.type] || '#ccc'))
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  // 虚线外圈
  nodeSelection.append("circle")
    .attr("r", (d: any) => (d.isCenter ? 28 : rScale(d.val)) + 4)
    .attr("fill", "none")
    .attr("stroke", "#333")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "3,2")
    .attr("opacity", (d: any) => {
        if (pivotFilter.value && pivotFilter.value === d.id) return 1;
        return 0;
    });

  // 节点文字 (依然显示简短 ID 或 ROOT)
  nodeSelection.append("text")
    .text((d: any) => {
        if (d.isCenter) return currentMode === 'ENTITY' ? 'TARGET' : 'ROOT';
        return d.rawId;
    })
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "10px")
    .style("font-family", "Arial")
    .style("fill", "#fff")
    .style("pointer-events", "none");

  // 方位标签
  if (currentMode === 'SAMPLE') {
    const labelLayer = svg.append("g").attr("class", "labels").lower();
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

  // 动画 Tick
  simulation.on("tick", () => {
    linkSelection
      .attr("x1", (d: any) => d.source.x)
      .attr("y1", (d: any) => d.source.y)
      .attr("x2", (d: any) => d.target.x)
      .attr("y2", (d: any) => d.target.y);
    nodeSelection.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
  });
  
  // 交互事件 (Tooltip)
  nodeSelection.on("mouseover", function(event, d: any) {
      d3.select(this).select("circle").attr("stroke", "#333");
      showTooltip(event, d);
  }).on("mouseout", function() {
      d3.select(this).select("circle").attr("stroke", "#fff");
      hideTooltip();
  });
};

// 拖拽
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

// Tooltip [关键修改：显示 displayName]
const showTooltip = (event: MouseEvent, d: any) => {
  if (!tooltipRef.value) return;
  tooltipRef.value.style.opacity = '1';
  tooltipRef.value.innerHTML = `
    <div style="font-weight:bold;color:${TYPE_COLORS[d.type]}">${d.type}</div>
    <div style="font-size:12px;color:#333;margin-top:2px">${d.displayName || d.fullName}</div>
    <div style="font-size:10px;color:#999;font-family:monospace">ID: ${d.rawId}</div>
  `;
  tooltipRef.value.style.left = `${event.clientX + 10}px`;
  tooltipRef.value.style.top = `${event.clientY + 10}px`;
};
const hideTooltip = () => {
  if (tooltipRef.value) tooltipRef.value.style.opacity = '0';
};

const renderEmptyState = (container: any, width: number, height: number) => {
  const svg = container.append("svg").attr("width", width).attr("height", height);
  svg.append("text").attr("x", width/2).attr("y", height/2).text("Select a Sample").attr("text-anchor", "middle").style("fill", "#ccc");
};

watch([selectedSampleId, pivotFilter, explanations], () => nextTick(drawTopology));

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
        {{ pivotFilter ? 'Pivot View' : 'Causal Topology' }}
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