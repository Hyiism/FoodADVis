<script setup lang="ts">
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
</style>