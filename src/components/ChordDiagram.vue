<!-- <script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick, onUnmounted } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';
import type { MetaPathChain } from '@/stores/types';

const store = useExplorerStore();
const { 
  selectedSampleId, 
  topRankedAnomalies, allExplanations
} = storeToRefs(store);

// --- 辅助函数 ---
const parseNode = (nodeStr: string): { type: string, id: string } => {
  const match = nodeStr.match(/^(\w+)\[(\d+)\]$/);
  if (match) return { type: match[1], id: match[2] };
  return { type: 'Unknown', id: nodeStr };
};

const getPathTypeTemplate = (chain: MetaPathChain): string => {
  if (!chain || chain.length === 0) return 'Null';
  const types = new Set<string>();
  types.add(parseNode(chain[0].from).type);
  chain.forEach(link => { types.add(parseNode(link.to).type); });
  return Array.from(types).join('→');
};

// --- 数据准备 ---
const chartContainer = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

const chordData = computed(() => {
  const columns = topRankedAnomalies.value; 
  const explanations = allExplanations.value;
  const links: { source: string, target: string, value: number }[] = [];

  columns.forEach(sample => {
    const sName = `ID[${sample.id}]`;
    const exps = explanations[sample.id] || [];
    exps.forEach(chain => {
      const pName = getPathTypeTemplate(chain);
      links.push({ source: sName, target: pName, value: 1 });
    });
  });
  return links;
});

// --- D3 绘图 ---
const drawChord = () => {
  if (!chartContainer.value) return;
  const data = chordData.value;
  if (data.length === 0) return;

  const width = chartContainer.value.clientWidth;
  const height = chartContainer.value.clientHeight || 600;
  
  // [核心修改] 控制图表大小
  const size = Math.min(width, height);
  // 增加 margin 值：值越大，图越小 (之前是 40，现在改为 100)
  const margin = 80; 
  
  const outerRadius = size * 0.5 - margin;
  const innerRadius = outerRadius - 18; 

  const container = d3.select(chartContainer.value);
  container.selectAll("*").remove();

  const svg = container.append("svg")
    .attr("width", size)
    .attr("height", size)
    .attr("viewBox", [-size / 2, -size / 2, size, size])
    .attr("style", "max-width: 100%; height: auto; background-color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif;");

  // 矩阵构建
  const names = d3.sort(d3.union(data.map(d => d.source), data.map(d => d.target)));
  const index = new Map(names.map((name, i) => [name, i]));
  const matrix = Array.from(index, () => new Array(names.length).fill(0));
  
  for (const {source, target, value} of data) {
      if (index.has(source) && index.has(target)) {
          matrix[index.get(source)!][index.get(target)!] += value;
      }
  }

  const chord = d3.chordDirected()
      .padAngle(0.02)
      .sortSubgroups(d3.descending)
      .sortChords(d3.descending);

  const chords = chord(matrix);

  const arc = d3.arc<d3.ChordGroup>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius);

  const ribbon = d3.ribbonArrow<d3.Chord>()
      .radius(innerRadius - 3) 
      .padAngle(1 / innerRadius)
      .headRadius(15); // 箭头稍微调小一点，适应整体变小

  const colorScale = d3.scaleOrdinal(names, d3.schemeTableau10);

  const group = svg.append("g")
    .selectAll("g")
    .data(chords.groups)
    .join("g");

  group.append("path")
      .attr("fill", d => {
          const name = names[d.index];
          if (name === `ID[${selectedSampleId.value}]`) return "#b71c1c"; 
          return colorScale(names[d.index]);
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("d", arc)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
          const name = names[d.index];
          const match = name.match(/^ID\[(\d+)\]$/);
          if (match) store.selectSample(parseInt(match[1], 10));
      })
      .on("mouseover", (event, d) => fade(0.1, d.index, svg))
      .on("mouseout", () => fade(1, -1, svg));

  group.append("text")
      .each(d => { (d as any).angle = (d.startAngle + d.endAngle) / 2; })
      .attr("dy", "0.35em")
      .attr("transform", (d: any) => `
        rotate(${(d.angle * 180 / Math.PI - 90)})
        translate(${outerRadius + 10}) 
        ${d.angle > Math.PI ? "rotate(180)" : ""}
      `)
      .attr("text-anchor", (d: any) => d.angle > Math.PI ? "end" : null)
      .text(d => {
         const name = names[d.index];
         return name.length > 22 ? name.substring(0, 20) + "." : name;
      })
      .style("font-size", "10px")
      .style("fill", "#444")
      .style("font-weight", "600")
      .style("pointer-events", "none");

  svg.append("g")
      .attr("fill-opacity", 0.75)
    .selectAll("path")
    .data(chords)
    .join("path")
      .attr("class", "ribbon")
      .style("mix-blend-mode", "multiply") 
      .attr("fill", d => colorScale(names[d.target.index])) 
      .attr("d", ribbon)
      .style("stroke", "none") 
      .on("mouseover", function(event, d) {
          d3.select(this).attr("fill-opacity", 1).style("mix-blend-mode", "normal");
          showTooltip(event, names[d.source.index], names[d.target.index]);
      })
      .on("mouseout", function() {
          d3.select(this).attr("fill-opacity", 0.75).style("mix-blend-mode", "multiply");
          hideTooltip();
      });

  function fade(opacity: number, activeIndex: number, svgContext: any) {
      svgContext.selectAll(".ribbon")
          .filter((d: any) => d.source.index !== activeIndex && d.target.index !== activeIndex)
          .transition()
          .duration(300)
          .style("opacity", opacity);
  }
};

// --- Tooltip ---
const showTooltip = (event: MouseEvent, source: string, target: string) => {
  if (!tooltipRef.value) return;
  tooltipRef.value.style.opacity = '1';
  tooltipRef.value.innerHTML = `
    <div style="color:#bbb;font-size:10px;margin-bottom:2px">SOURCE</div>
    <div style="font-weight:bold">${source}</div>
    <div style="margin:4px 0;border-top:1px solid #555"></div>
    <div style="color:#bbb;font-size:10px;margin-bottom:2px">TARGET</div>
    <div style="font-weight:bold">${target}</div>
  `;
  tooltipRef.value.style.left = `${event.clientX + 20}px`;
  tooltipRef.value.style.top = `${event.clientY + 20}px`;
};
const hideTooltip = () => {
  if (tooltipRef.value) tooltipRef.value.style.opacity = '0';
};

watch(chordData, () => nextTick(drawChord), { deep: true });
watch(selectedSampleId, () => nextTick(drawChord));

onMounted(() => {
    if (chartContainer.value) {
        resizeObserver = new ResizeObserver(() => requestAnimationFrame(drawChord));
        resizeObserver.observe(chartContainer.value);
    }
    nextTick(drawChord);
});

onUnmounted(() => {
    if (resizeObserver) resizeObserver.disconnect();
});
</script>

<template>
  <div class="chord-wrapper">
    <div class="chart-title">Path Connectivity Chord</div>
    <div ref="chartContainer" class="chart-container"></div>
    <div ref="tooltipRef" class="chord-tooltip"></div>
  </div>
</template>

<style scoped>
.chord-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #ffffff;
  position: relative;
  overflow: hidden;
}

.chart-title {
    font-family: 'Times New Roman', serif;
    font-size: 14px; 
    font-weight: bold;
    margin-top: 15px;
    margin-bottom: 5px;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 2px;
    border-bottom: 1px solid #333;
    padding-bottom: 4px;
}

.chart-container {
  flex: 1;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 0;
}

.chord-tooltip {
  position: fixed;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 10px 14px;
  border-radius: 2px;
  font-family: 'Helvetica Neue', sans-serif; 
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.1s;
  z-index: 9999;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
</style> -->


<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick, onUnmounted } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';

interface ExplanationLink {
  from: string;
  to: string;
  relation: string;
  weight: number;
}

const store = useExplorerStore();
const { selectedSampleId, topRankedAnomalies, explanations } = storeToRefs(store);

// --- 1. 颜色配置 (统一风格) ---
const CATEGORY_COLORS: Record<string, string> = {
  'InspectionRecord': '#f56c6c',
  'Product': '#e6a23c',
  'Market': '#409eff',
  'Farmer': '#67c23a',
  'Contaminant': '#909399',
  'Unknown': '#ccc'
};

// --- 2. 节点解析 ---
const parseNode = (nodeStr: string): { type: string, id: string } => {
  if (!nodeStr) return { type: 'Unknown', id: '?' };
  const cleanStr = nodeStr.replace(/['"]/g, '').trim();
  const match = cleanStr.match(/^([a-zA-Z]+)[_\[](\d+)\]?$/);
  if (match) return { type: match[1], id: match[2] };
  const parts = cleanStr.split('_');
  if (parts.length > 1) return { type: parts[0], id: parts[1] };
  return { type: 'Unknown', id: nodeStr };
};

// --- 3. [核心逻辑] 提取根源类型 ---
// 从复杂的解释图中，只提取"入度为0"的节点类型（即风险源头）
const getRootTypes = (edges: ExplanationLink[]): string[] => {
  if (!edges || edges.length === 0) return [];

  const incoming = new Set<string>();
  const allNodes = new Set<string>();

  edges.forEach(edge => {
    let from = edge.from;
    let to = edge.to;
    // 强制流向修正 (Entity -> Sample)
    if (from.startsWith('InspectionRecord') && !to.startsWith('InspectionRecord')) {
      [from, to] = [to, from];
    }
    // 忽略自环
    if (from === to) return;

    allNodes.add(from);
    allNodes.add(to);
    incoming.add(to); // 记录谁是终点
  });

  // 寻找起点 (Root): 从未作为终点出现的节点
  const roots = Array.from(allNodes).filter(n => !incoming.has(n));
  
  // 兜底: 如果没有纯粹起点，取所有非Sample节点
  const finalRoots = roots.length > 0 ? roots : Array.from(allNodes).filter(n => !n.startsWith('InspectionRecord'));

  // 提取类型并去重
  const types = new Set<string>();
  finalRoots.forEach(nodeStr => {
    const type = parseNode(nodeStr).type;
    // 过滤掉 InspectionRecord 本身（防止显示 Sample -> Sample）
    if (type !== 'InspectionRecord') {
      types.add(type);
    }
  });

  return Array.from(types);
};

// --- 数据准备 ---
const chartContainer = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

const chordData = computed(() => {
  const columns = topRankedAnomalies.value; 
  const explanationMap = explanations.value;
  const links: { source: string, target: string, value: number }[] = [];

  columns.forEach(sample => {
    const sName = `ID[${sample.id}]`;
    const chain = explanationMap[sample.id];
    
    if (chain && chain.length > 0) {
      // [抽象化] 只获取根源类型，不显示具体路径
      const rootTypes = getRootTypes(chain);
      
      rootTypes.forEach(type => {
        // Sample -> RootType (例如: ID[123] -> Farmer)
        links.push({ source: sName, target: type, value: 1 });
      });
    }
  });
  
  return links;
});

// --- D3 绘图 ---
const drawChord = () => {
  if (!chartContainer.value) return;
  const data = chordData.value;
  
  const container = d3.select(chartContainer.value);
  container.selectAll("*").remove();

  if (data.length === 0) {
    container.append("div")
      .style("display", "flex")
      .style("height", "100%")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("color", "#999")
      .style("font-size", "12px")
      .text("Waiting for data...");
    return;
  }

  const width = chartContainer.value.clientWidth;
  const height = chartContainer.value.clientHeight || 600;
  
  const size = Math.min(width, height);
  const margin = 60; // 边距可以小一点了，因为标签变短了
  
  const outerRadius = size * 0.5 - margin;
  const innerRadius = outerRadius - 18; 

  const svg = container.append("svg")
    .attr("width", size)
    .attr("height", size)
    .attr("viewBox", [-size / 2, -size / 2, size, size])
    .attr("style", "max-width: 100%; height: auto; background-color: #ffffff; font-family: 'Helvetica Neue', Arial, sans-serif;");

  // 排序：把 Category 排在一起，把 Sample 排在一起
  const categoryNames = Object.keys(CATEGORY_COLORS).filter(k => k !== 'InspectionRecord' && k !== 'Unknown');
  const sampleNames = Array.from(new Set(data.map(d => d.source))).sort();
  
  // 自定义排序顺序：先放 Categories，再放 Samples
  const names = [...categoryNames, ...sampleNames];
  
  // 过滤掉数据中没出现的 Category
  const activeNames = names.filter(n => data.some(d => d.source === n || d.target === n));

  const index = new Map(activeNames.map((name, i) => [name, i]));
  const matrix = Array.from(index, () => new Array(activeNames.length).fill(0));
  
  for (const {source, target, value} of data) {
      if (index.has(source) && index.has(target)) {
          // Source (Sample) -> Target (Category)
          // 矩阵是对称的，或者流向
          matrix[index.get(source)!][index.get(target)!] += value;
          // matrix[index.get(target)!][index.get(source)!] += value; // 如果需要双向宽带
      }
  }

  const chord = d3.chordDirected()
      .padAngle(0.02)
      .sortSubgroups(d3.descending)
      .sortChords(d3.descending);

  const chords = chord(matrix);

  const arc = d3.arc<d3.ChordGroup>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius);

  const ribbon = d3.ribbonArrow<d3.Chord>()
      .radius(innerRadius - 3) 
      .padAngle(1 / innerRadius)
      .headRadius(10); 

  const group = svg.append("g")
    .selectAll("g")
    .data(chords.groups)
    .join("g");

  // 绘制圆环
  group.append("path")
      .attr("fill", d => {
          const name = activeNames[d.index];
          // 如果是选中的样本，高亮
          if (selectedSampleId.value && name === `ID[${selectedSampleId.value}]`) return "#b71c1c"; 
          // 如果是 ID，默认灰色/淡蓝
          if (name.startsWith('ID[')) return "#e0e0e0";
          // 如果是分类，使用固定颜色
          return CATEGORY_COLORS[name] || "#ccc";
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("d", arc)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
          const name = activeNames[d.index];
          const match = name.match(/^ID\[(\d+)\]$/);
          if (match) store.selectSample(parseInt(match[1], 10));
      })
      .on("mouseover", (event, d) => fade(0.1, d.index, svg))
      .on("mouseout", () => fade(1, -1, svg));

  // 绘制标签
  group.append("text")
      .each(d => { (d as any).angle = (d.startAngle + d.endAngle) / 2; })
      .attr("dy", "0.35em")
      .attr("transform", (d: any) => `
        rotate(${(d.angle * 180 / Math.PI - 90)})
        translate(${outerRadius + 10}) 
        ${d.angle > Math.PI ? "rotate(180)" : ""}
      `)
      .attr("text-anchor", (d: any) => d.angle > Math.PI ? "end" : null)
      .text(d => {
         const name = activeNames[d.index];
         // 简化 Sample ID 显示
         if (name.startsWith('ID[')) return name.replace('ID', '');
         return name; // Category 全名显示
      })
      .style("font-size", d => {
         const name = activeNames[d.index];
         return name.startsWith('ID[') ? "9px" : "11px"; // 分类字体稍微大一点
      })
      .style("fill", d => {
         const name = activeNames[d.index];
         return name.startsWith('ID[') ? "#999" : "#333";
      })
      .style("font-weight", d => {
         const name = activeNames[d.index];
         return name.startsWith('ID[') ? "400" : "700";
      })
      .style("pointer-events", "none");

  // 绘制连线 (Ribbons)
  svg.append("g")
      .attr("fill-opacity", 0.75)
    .selectAll("path")
    .data(chords)
    .join("path")
      .attr("class", "ribbon")
      .style("mix-blend-mode", "multiply") 
      // 颜色跟随目标 (Category)，这样可以看出是哪类的风险
      .attr("fill", d => CATEGORY_COLORS[activeNames[d.target.index]] || "#ccc") 
      .attr("d", ribbon)
      .style("stroke", "none") 
      .on("mouseover", function(event, d) {
          d3.select(this).attr("fill-opacity", 1).style("mix-blend-mode", "normal");
          showTooltip(event, activeNames[d.source.index], activeNames[d.target.index]);
      })
      .on("mouseout", function() {
          d3.select(this).attr("fill-opacity", 0.75).style("mix-blend-mode", "multiply");
          hideTooltip();
      });

  function fade(opacity: number, activeIndex: number, svgContext: any) {
      svgContext.selectAll(".ribbon")
          .filter((d: any) => d.source.index !== activeIndex && d.target.index !== activeIndex)
          .transition()
          .duration(300)
          .style("opacity", opacity);
  }
};

const showTooltip = (event: MouseEvent, source: string, target: string) => {
  if (!tooltipRef.value) return;
  tooltipRef.value.style.opacity = '1';
  tooltipRef.value.innerHTML = `
    <div style="color:#bbb;font-size:10px;margin-bottom:2px">SAMPLE</div>
    <div style="font-weight:bold">${source}</div>
    <div style="margin:4px 0;border-top:1px solid #555"></div>
    <div style="color:#bbb;font-size:10px;margin-bottom:2px">ROOT CAUSE</div>
    <div style="font-weight:bold; color:${CATEGORY_COLORS[target]}">${target}</div>
  `;
  tooltipRef.value.style.left = `${event.clientX + 20}px`;
  tooltipRef.value.style.top = `${event.clientY + 20}px`;
};
const hideTooltip = () => {
  if (tooltipRef.value) tooltipRef.value.style.opacity = '0';
};

watch(chordData, () => nextTick(drawChord), { deep: true });
watch(selectedSampleId, () => nextTick(drawChord));

onMounted(() => {
    if (chartContainer.value) {
        resizeObserver = new ResizeObserver(() => requestAnimationFrame(drawChord));
        resizeObserver.observe(chartContainer.value);
    }
    nextTick(drawChord);
});

onUnmounted(() => {
    if (resizeObserver) resizeObserver.disconnect();
});
</script>

<template>
  <div class="chord-wrapper">
    <div class="chart-title">Risk Source Attribution</div>
    <div ref="chartContainer" class="chart-container"></div>
    <div ref="tooltipRef" class="chord-tooltip"></div>
  </div>
</template>

<style scoped>
.chord-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #ffffff;
  position: relative;
  overflow: hidden;
}

.chart-title {
    font-family: 'Times New Roman', serif;
    font-size: 14px; 
    font-weight: bold;
    margin-top: 15px;
    margin-bottom: 5px;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 2px;
    border-bottom: 1px solid #333;
    padding-bottom: 4px;
}

.chart-container {
  flex: 1;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 0;
}

.chord-tooltip {
  position: fixed;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 10px 14px;
  border-radius: 2px;
  font-family: 'Helvetica Neue', sans-serif; 
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.1s;
  z-index: 9999;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
</style>