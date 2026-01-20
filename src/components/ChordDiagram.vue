<!-- <script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick, onUnmounted } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';
import { ElScrollbar, ElTag, ElProgress } from 'element-plus';
import { ArrowRight, Connection, Shop, User, Goods, Warning, CircleCheckFilled, DataAnalysis } from '@element-plus/icons-vue';

const store = useExplorerStore();
// 引入 context 以获取真实的节点统计数据 (Degree)
const { topRankedAnomalies, explanations, selectedSampleId, context, samples } = storeToRefs(store);

// --- 1. 核心配置 ---
const CATEGORY_CONFIG: Record<string, any> = {
  'Farmer': { color: '#67c23a', label: '养殖户 (Producer)', icon: User },
  'Market': { color: '#409eff', label: '市场 (Market)', icon: Shop },
  'Product': { color: '#e6a23c', label: '产品 (Product)', icon: Goods },
  'Contaminant': { color: '#f56c6c', label: '污染物 (Risk)', icon: Warning },
  'Sample': { color: '#606266', label: '样本', icon: Connection }
};

const chartContainer = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

// --- 2. 核心算法: 严格对齐的 DFS 路径计算 (保持不变) ---
const calculateTruePaths = (rawEdges: any[]) => {
    const counts = { Farmer: 0, Market: 0, Product: 0, Contaminant: 0 };
    if (!rawEdges || rawEdges.length === 0) return counts;

    const adj = new Map<string, any[]>();
    const allNodes = new Set<string>();
    
    rawEdges.forEach((edge: any) => {
        let from = edge.from;
        let to = edge.to;
        if (from.startsWith('InspectionRecord') && !to.startsWith('InspectionRecord')) {
            [from, to] = [to, from];
        }
        if (from === to) return;

        if (!adj.has(from)) adj.set(from, []);
        adj.get(from)!.push({ to, weight: edge.weight || 0 });
        allNodes.add(from);
        allNodes.add(to);
    });

    for (const [key, neighbors] of adj.entries()) {
        neighbors.sort((a: any, b: any) => b.weight - a.weight);
        adj.set(key, neighbors.slice(0, 1)); 
    }

    const getNodeType = (nodeStr: string) => {
        const clean = nodeStr.replace(/['"]/g, '').trim();
        const parts = clean.split('_');
        return parts.length > 1 ? parts[0] : 'Unknown';
    };

    const seenPaths = new Set<string>();

    const dfs = (curr: string, path: string[]) => {
        if (path.length >= 4) return;
        if (curr.startsWith('InspectionRecord')) {
            if (path.length > 0) {
                const startNode = path[0];
                const startType = getNodeType(startNode);
                const signature = path.join('->') + '->' + curr;
                if (!seenPaths.has(signature)) {
                    seenPaths.add(signature);
                    if (startType === 'Farmer') counts.Farmer++;
                    else if (startType === 'Market') counts.Market++;
                    else if (startType === 'Product') counts.Product++;
                    else if (startType === 'Contaminant') counts.Contaminant++;
                }
            }
            return;
        }
        const neighbors = adj.get(curr);
        if (neighbors) {
            neighbors.forEach((next: any) => {
                if (!path.includes(next.to)) dfs(next.to, [...path, curr]);
            });
        }
    };

    allNodes.forEach(node => {
        if (!node.startsWith('InspectionRecord')) dfs(node, []);
    });

    return counts;
};

// --- 3. 数据构建 ---
const processedData = computed(() => {
  const activeSamples = topRankedAnomalies.value.slice(0, 15);
  const categories = ['Farmer', 'Market', 'Product', 'Contaminant'];
  const allNames = [...categories, ...activeSamples.map(s => `Sample #${s.id}`)];
  const nameIndex = new Map(allNames.map((n, i) => [n, i]));
  
  const size = allNames.length;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(0));
  const listItems: any[] = [];
  let totalRiskPaths = 0; 

  activeSamples.forEach(sample => {
      const sName = `Sample #${sample.id}`;
      const sIdx = nameIndex.get(sName);
      if (sIdx === undefined) return;

      const rawEdges = explanations.value[sample.id] || [];
      const counts = calculateTruePaths(rawEdges);

      if (counts.Farmer > 0) matrix[nameIndex.get('Farmer')!][sIdx] = counts.Farmer;
      if (counts.Market > 0) matrix[nameIndex.get('Market')!][sIdx] = counts.Market;
      if (counts.Product > 0) matrix[nameIndex.get('Product')!][sIdx] = counts.Product;
      if (counts.Contaminant > 0) matrix[nameIndex.get('Contaminant')!][sIdx] = counts.Contaminant;

      const validTotal = counts.Farmer + counts.Market + counts.Product + counts.Contaminant;
      totalRiskPaths += validTotal;

      const maxRiskEntry = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

      listItems.push({
          id: sample.id,
          name: sName,
          totalPaths: validTotal, 
          mainRisk: validTotal > 0 ? maxRiskEntry[0] : 'Low Risk',
          detailCounts: counts
      });
  });

  return { 
      matrix, 
      names: allNames, 
      categories, 
      listItems,
      hasRisk: totalRiskPaths > 0 // 是否有风险路径
  };
});

// --- 4. 获取当前选中样本的真实统计数据 (用于安全视图) ---
const currentSafeStats = computed(() => {
    if (!selectedSampleId.value) return null;
    const idStr = String(selectedSampleId.value);
    const ctx = context.value?.[idStr] || {};
    const meta = samples.value?.find(s => String(s.id) === idStr);

    return {
        // 1. 真实的模型预测置信度
        score: meta ? ((1 - meta.score) * 100).toFixed(2) : '99.99',
        // 2. 真实的图谱统计 (Degree)
        farmerVol: ctx.stats?.farmer_vol || 0,
        marketVol: ctx.stats?.market_vol || 0,
        // 3. 实体名称
        farmerName: ctx.farmers?.[0] || 'Unknown',
        marketName: ctx.markets?.[0] || 'Unknown'
    };
});

// --- 5. D3 绘图：弦图 (Risk Mode) ---
const drawChord = (containerEl: HTMLElement, width: number, height: number) => {
  const { matrix, names, categories } = processedData.value;
  if (names.length <= 4) return;

  const outerRadius = Math.min(width, height) * 0.5 - 20;
  const innerRadius = outerRadius - 25;

  const svg = d3.select(containerEl).append("svg")
      .attr("width", width).attr("height", height)
      .attr("viewBox", [-width / 2, -height / 2, width, height])
      .style("background", "#fff");

  const chord = d3.chord().padAngle(0.04).sortSubgroups(d3.descending);
  const chords = chord(matrix);
  const arc = d3.arc<d3.ChordGroup>().innerRadius(innerRadius).outerRadius(outerRadius);
  const ribbon = d3.ribbon<d3.Chord>().radius(innerRadius);

  svg.append("g").attr("fill-opacity", 0.6)
    .selectAll("path").data(chords).join("path")
    .attr("d", ribbon)
    .attr("fill", d => CATEGORY_CONFIG[names[d.source.index]].color)
    .style("mix-blend-mode", "multiply")
    .attr("class", d => `ribbon ribbon-target-${names[d.target.index].replace('Sample #', '')}`);

  const group = svg.append("g").selectAll("g").data(chords.groups).join("g");
  
  group.append("path")
      .attr("fill", d => {
          const name = names[d.index];
          if (name.includes(String(selectedSampleId.value))) return "#b71c1c";
          return categories.includes(name) ? CATEGORY_CONFIG[name].color : CATEGORY_CONFIG.Sample.color;
      })
      .attr("d", arc)
      .style("cursor", "pointer")
      .on("click", (e, d) => {
          const name = names[d.index];
          if (!categories.includes(name)) {
              store.selectSample(parseInt(name.replace('Sample #', '')));
          }
      })
      .on("mouseover", function(e, d) {
          const name = names[d.index];
          if (!categories.includes(name)) {
             const id = name.replace('Sample #', '');
             svg.selectAll(".ribbon").style("opacity", 0.1);
             svg.selectAll(`.ribbon-target-${id}`).style("opacity", 1);
             d3.select(this).transition().attr("transform", "scale(1.05)");
          }
      })
      .on("mouseout", function() {
          svg.selectAll(".ribbon").style("opacity", 0.6);
          d3.select(this).transition().attr("transform", "scale(1)");
      });

  group.append("text")
      .each(d => { (d as any).angle = (d.startAngle + d.endAngle) / 2; })
      .attr("dy", ".35em")
      .attr("transform", (d: any) => `
        rotate(${d.angle * 180 / Math.PI - 90})
        translate(${outerRadius + 5}) ${d.angle > Math.PI ? "rotate(180)" : ""}
      `)
      .attr("text-anchor", (d: any) => d.angle > Math.PI ? "end" : null)
      .text(d => {
          const name = names[d.index];
          if (categories.includes(name)) return ''; 
          if (name.includes(String(selectedSampleId.value)) || (d.endAngle - d.startAngle > 0.1)) {
              return name.replace('Sample #', '#');
          }
          return '';
      })
      .style("font-size", "10px").style("fill", "#666").style("pointer-events", "none");
};

// --- 6. 统一渲染入口 ---
const render = () => {
    if (!chartContainer.value) return;
    d3.select(chartContainer.value).selectAll("*").remove();
    
    // 如果有风险数据，画弦图；否则不画 D3，留给 Template 显示安全面板
    if (processedData.value.hasRisk) {
        const width = chartContainer.value.clientWidth;
        const height = chartContainer.value.clientHeight || 400;
        drawChord(chartContainer.value, width, height);
    }
};

watch([topRankedAnomalies, selectedSampleId], () => nextTick(render), { deep: true });
onMounted(() => {
    if (chartContainer.value) {
        resizeObserver = new ResizeObserver(() => requestAnimationFrame(render));
        resizeObserver.observe(chartContainer.value);
    }
    nextTick(render);
});
onUnmounted(() => resizeObserver?.disconnect());
</script>

<template>
  <div class="layout-container">
    
    <div class="col-chart">
      
      <template v-if="processedData.hasRisk">
        <div class="panel-header">RISK ATTRIBUTION MATRIX</div>
        <div class="legend-row">
          <div v-for="(conf, key) in CATEGORY_CONFIG" :key="key" v-if="key !== 'Sample'" class="legend-item">
            <span class="dot" :style="{background: conf.color}"></span> {{ conf.label }}
          </div>
        </div>
        <div ref="chartContainer" class="chart-box"></div>
      </template>

      <template v-else>
        <div class="panel-header safe-header">
           <el-icon color="#67c23a"><CircleCheckFilled /></el-icon> SAFETY DIAGNOSTICS
        </div>
        <div class="safe-panel" v-if="currentSafeStats">
            <div class="score-circle">
               <el-progress 
                 type="dashboard" 
                 :percentage="Number(currentSafeStats.score)" 
                 :color="[
                    { color: '#f56c6c', percentage: 20 },
                    { color: '#e6a23c', percentage: 50 },
                    { color: '#67c23a', percentage: 100 }
                 ]"
                 :width="140"
               >
                 <template #default="{ percentage }">
                   <span class="score-num">{{ percentage }}%</span>
                   <span class="score-label">Safety Confidence</span>
                 </template>
               </el-progress>
            </div>

            <div class="stats-grid">
               <div class="stat-box">
                  <div class="stat-icon"><el-icon><User /></el-icon></div>
                  <div class="stat-info">
                     <div class="stat-val">{{ currentSafeStats.farmerVol }}</div>
                     <div class="stat-label">Production Records</div>
                     <div class="stat-sub">Linked to {{ currentSafeStats.farmerName }}</div>
                  </div>
               </div>
               <div class="stat-box">
                  <div class="stat-icon"><el-icon><Shop /></el-icon></div>
                  <div class="stat-info">
                     <div class="stat-val">{{ currentSafeStats.marketVol }}</div>
                     <div class="stat-label">Market Connections</div>
                     <div class="stat-sub">Linked to {{ currentSafeStats.marketName }}</div>
                  </div>
               </div>
            </div>

            <div class="safe-footer">
               <el-tag type="success" effect="dark">GNN Verified</el-tag>
               <span class="footer-text">No risk paths detected in heterogeneous graph topology.</span>
            </div>
        </div>
        <el-empty v-else description="No Data Selected" />
      </template>

    </div>

    <div class="col-list">
      <div class="panel-header">SAMPLES LIST</div>
      <el-scrollbar>
        <div class="list-wrapper">
          <div 
            v-for="item in processedData.listItems" 
            :key="item.id"
            class="list-item"
            :class="{ active: selectedSampleId === item.id }"
            @click="store.selectSample(item.id)"
          >
            <div class="risk-bar" :style="{ background: item.totalPaths > 0 ? CATEGORY_CONFIG[item.mainRisk]?.color : '#67c23a' }"></div>
            
            <div class="item-body">
              <div class="item-top">
                  <span class="item-id">Sample #{{ item.id }}</span>
                  <el-tag v-if="item.totalPaths > 0" size="small" effect="plain" class="mini-tag">{{ item.mainRisk }}</el-tag>
                  <el-tag v-else size="small" type="success" effect="light" class="mini-tag">Safe</el-tag>
              </div>
              
              <div class="item-stats">
                 <span v-if="item.totalPaths > 0" class="count-text">{{ item.totalPaths }} paths</span>
                 <span v-else class="count-text text-green">No Risk Found</span>
              </div>

              <div class="mini-progress" v-if="item.totalPaths > 0">
                  <div class="mp-seg" v-if="item.detailCounts.Farmer > 0" :style="{ flex: item.detailCounts.Farmer, background: CATEGORY_CONFIG.Farmer.color }"></div>
                  <div class="mp-seg" v-if="item.detailCounts.Product > 0" :style="{ flex: item.detailCounts.Product, background: CATEGORY_CONFIG.Product.color }"></div>
                  <div class="mp-seg" v-if="item.detailCounts.Market > 0" :style="{ flex: item.detailCounts.Market, background: CATEGORY_CONFIG.Market.color }"></div>
                  <div class="mp-seg" v-if="item.detailCounts.Contaminant > 0" :style="{ flex: item.detailCounts.Contaminant, background: CATEGORY_CONFIG.Contaminant.color }"></div>
              </div>
            </div>
            
            <el-icon v-if="selectedSampleId === item.id" class="arrow-active"><ArrowRight /></el-icon>
          </div>
        </div>
      </el-scrollbar>
    </div>

  </div>
</template>

<style scoped>
.layout-container {
  width: 100%; height: 100%; display: flex; 
  background: #fff; border: 1px solid #dcdfe6; box-sizing: border-box;
}

.panel-header {
  padding: 10px 12px; font-size: 11px; font-weight: 800; color: #909399;
  border-bottom: 1px solid #eee; background: #fafafa;
}

/* 左侧容器 */
.col-chart { flex: 1; display: flex; flex-direction: column; border-right: 1px solid #eee; min-width: 0; position: relative; }
.legend-row { display: flex; justify-content: center; gap: 12px; padding: 8px; flex-wrap: wrap; border-bottom: 1px dashed #f5f5f5; }
.legend-item { font-size: 10px; color: #666; display: flex; align-items: center; gap: 4px; }
.dot { width: 6px; height: 6px; border-radius: 50%; }
.chart-box { flex: 1; overflow: hidden; }

/* 安全面板样式 (Safe Mode) */
.safe-header { background: #f0f9eb; color: #67c23a; border-bottom: 1px solid #e1f3d8; display: flex; align-items: center; gap: 6px; }
.safe-panel { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; gap: 20px; }

.score-circle { transform: scale(1.1); }
.score-num { display: block; font-size: 24px; font-weight: 800; color: #303133; }
.score-label { font-size: 10px; color: #909399; text-transform: uppercase; }

.stats-grid { display: flex; gap: 16px; width: 100%; max-width: 360px; }
.stat-box { 
    flex: 1; display: flex; gap: 10px; padding: 12px; 
    background: #fcfcfc; border: 1px solid #eee; border-radius: 8px; 
    align-items: center; transition: all 0.2s;
}
.stat-box:hover { border-color: #dcdfe6; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.stat-icon { 
    width: 32px; height: 32px; background: #f0f2f5; border-radius: 6px; 
    display: flex; align-items: center; justify-content: center; color: #606266;
}
.stat-info { flex: 1; overflow: hidden; }
.stat-val { font-size: 16px; font-weight: 800; color: #303133; line-height: 1.2; }
.stat-label { font-size: 10px; font-weight: 700; color: #909399; margin-bottom: 2px; }
.stat-sub { font-size: 9px; color: #c0c4cc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.safe-footer { text-align: center; margin-top: 10px; }
.footer-text { display: block; font-size: 10px; color: #909399; margin-top: 6px; }

/* 右侧列表 */
.col-list { width: 260px; display: flex; flex-direction: column; background: #fff; }
.list-wrapper { padding: 0; }
.list-item { 
  display: flex; align-items: stretch; height: 64px; cursor: pointer; 
  border-bottom: 1px solid #f5f5f5; transition: all 0.2s; padding-right: 10px;
}
.list-item:hover { background: #f0f7ff; }
.list-item.active { background: #ecf5ff; }

.risk-bar { width: 4px; margin-right: 10px; transition: background 0.3s; }

.item-body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
.item-top { display: flex; justify-content: space-between; align-items: center; }
.item-id { font-size: 13px; font-weight: bold; color: #333; }
.mini-tag { font-size: 9px; height: 18px; line-height: 16px; border: none; }

.item-stats { font-size: 10px; color: #999; display: flex; justify-content: space-between; }
.text-green { color: #67c23a; font-weight: bold; }

.mini-progress { display: flex; height: 4px; width: 100%; background: #f0f0f0; border-radius: 2px; overflow: hidden; }
.mp-seg { height: 100%; }

.arrow-active { color: #409eff; font-weight: bold; }
</style> -->

// --1222 修改
<!-- <template>
  <div class="chart-container" ref="chartRef"></div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, computed, nextTick, onUnmounted } from 'vue';
import * as d3 from 'd3';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';

const store = useExplorerStore();
const { topRankedAnomalies, explanations, selectedSampleId } = storeToRefs(store);

const chartRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

// --- 配置 ---
const CONFIG = {
  colors: {
    'Farmer': '#67c23a',
    'Market': '#409eff',
    'Product': '#e6a23c',
    'Contaminant': '#f56c6c',
    'Sample': '#909399' // 样本默认颜色
  },
  labels: {
    'Farmer': '养殖户',
    'Market': '市场',
    'Product': '产品',
    'Contaminant': '污染物'
  }
};

// --- 1. 数据处理核心算法 ---
// 将数据转换为 邻接矩阵 (Adjacency Matrix)
const processedData = computed(() => {
  const samples = topRankedAnomalies.value.slice(0, 20); // 取前20个
  const categories = ['Farmer', 'Market', 'Product', 'Contaminant'];
  
  // 节点总列表：先放分类，再放样本 (这样分类会在一边，样本在另一边)
  // 为了让 D3 画出左右分立的效果，我们需要精心的排序
  const nodes = [...categories, ...samples.map(s => `Sample #${s.id}`)];
  const nCats = categories.length;
  const nSamples = samples.length;
  const size = nodes.length;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(0));

  // 填充矩阵
  samples.forEach((sample, i) => {
    const sIndex = nCats + i; // 样本在矩阵中的索引
    const rawEdges = explanations.value[sample.id] || [];
    
    // 简化的路径计数 (复用您之前的逻辑思路)
    const counts = { Farmer: 0, Market: 0, Product: 0, Contaminant: 0 };
    rawEdges.forEach((edge: any) => {
        // 这里简单模拟权重，您应该替换为您真实的 calculateTruePaths 逻辑
        const type = edge.from.split('_')[0]; 
        if (counts[type] !== undefined) counts[type] += (edge.weight || 1);
    });

    // 填充 Sample -> Category 的流向
    // 注意：弦图矩阵 matrix[i][j] 代表 i 流向 j
    matrix[sIndex][0] = counts.Farmer;
    matrix[sIndex][1] = counts.Market;
    matrix[sIndex][2] = counts.Product;
    matrix[sIndex][3] = counts.Contaminant;
    
    // 为了让弦图对称（虽然是单向流，但为了填满圆），通常双向都填，
    // 但为了用 ribbon 显示单向，我们只填一边，D3 会自动处理。
    // 这里我们构建一个“有向”弦图。
    matrix[0][sIndex] = counts.Farmer;
    matrix[1][sIndex] = counts.Market;
    matrix[2][sIndex] = counts.Product;
    matrix[3][sIndex] = counts.Contaminant;
  });

  return { matrix, nodes, nCats };
});

// --- 2. 绘图逻辑 ---
const drawChart = () => {
  if (!chartRef.value) return;
  const width = chartRef.value.clientWidth;
  const height = chartRef.value.clientHeight || 500;
  
  d3.select(chartRef.value).selectAll("*").remove();

  const outerRadius = Math.min(width, height) * 0.5 - 60; // 留足边缘给文字
  const innerRadius = outerRadius - 15;

  const svg = d3.select(chartRef.value).append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .style("font-family", "Arial, sans-serif");

  const { matrix, nodes, nCats } = processedData.value;

  // 核心技巧：自定义 group 排序
  // 我们希望分类在一起，样本在一起。数据本身已经是这样排的了。
  // padAngle 设大一点，让块之间有缝隙
  const chord = d3.chord()
    .padAngle(0.02) 
    .sortSubgroups(d3.descending);

  const chords = chord(matrix);

  // --- A. 绘制弧形 (Arc) ---
  const arc = d3.arc<d3.ChordGroup>()
    .innerRadius(innerRadius)
    .outerRadius(outerRadius);

  const group = svg.append("g")
    .selectAll("g")
    .data(chords.groups)
    .join("g");

  // 弧形路径
  group.append("path")
    .attr("fill", d => {
      const name = nodes[d.index];
      // 如果是分类，用分类色；如果是样本，用灰色或高亮色
      if (d.index < nCats) return CONFIG.colors[name] || '#ccc';
      // 样本颜色：如果选中则变红
      const isSelected = name.includes(String(selectedSampleId.value || ''));
      return isSelected ? '#b71c1c' : '#909399';
    })
    .attr("stroke", "#fff")
    .attr("d", arc)
    .style("cursor", "pointer")
    .on("click", (e, d) => {
        const name = nodes[d.index];
        // 点击样本弧形，触发选中
        if (d.index >= nCats) {
            const id = parseInt(name.replace('Sample #', ''));
            store.selectSample(id);
        }
    })
    .on("mouseover", function(e, d) {
       d3.select(this).attr("transform", "scale(1.05)");
       fade(0.1)(e, d);
    })
    .on("mouseout", function(e, d) {
       d3.select(this).attr("transform", "scale(1)");
       fade(1)(e, d);
    });

  // --- B. 绘制文字标签 (Labels) ---
  group.append("text")
    .each(d => { (d as any).angle = (d.startAngle + d.endAngle) / 2; })
    .attr("dy", ".35em")
    .attr("transform", (d: any) => `
      rotate(${d.angle * 180 / Math.PI - 90})
      translate(${outerRadius + 10})
      ${d.angle > Math.PI ? "rotate(180)" : ""}
    `)
    .attr("text-anchor", (d: any) => d.angle > Math.PI ? "end" : "start")
    .text(d => {
       const name = nodes[d.index];
       if (d.index < nCats) return CONFIG.labels[name] || name; // 分类名
       // 样本名只显示 ID，且太小的弧形不显示文字以防重叠
       if (d.endAngle - d.startAngle < 0.05) return ""; 
       return name.replace('Sample ', '#');
    })
    .style("font-size", "10px")
    .style("fill", "#666")
    .style("font-weight", d => d.index < nCats ? "bold" : "normal");

  // --- C. 绘制连线 (Ribbons) ---
  const ribbon = d3.ribbon<d3.Chord>()
    .radius(innerRadius);

  // 这里的技巧是：让颜色跟随“分类”端 (Target)
  // 因为我们的矩阵构建方式，source 是样本，target 是分类
  svg.append("g")
    .attr("fill-opacity", 0.6)
    .selectAll("path")
    .data(chords)
    .join("path")
    .attr("d", ribbon)
    .attr("class", "ribbon")
    // 颜色逻辑：连线颜色跟随分类
    .attr("fill", d => {
        // 找到 source 或 target 中哪个是分类索引 (< nCats)
        const catIndex = d.source.index < nCats ? d.source.index : d.target.index;
        return CONFIG.colors[nodes[catIndex]];
    })
    .style("mix-blend-mode", "multiply")
    .style("transition", "opacity 0.3s");

  // --- 交互效果：淡入淡出 ---
  function fade(opacity: number) {
    return (e: any, d: any) => {
      svg.selectAll(".ribbon")
        .filter((r: any) => r.source.index !== d.index && r.target.index !== d.index)
        .transition()
        .style("opacity", opacity);
    };
  }
  
  // 监听选中 ID 变化，自动高亮连线
  if (selectedSampleId.value) {
      const idStr = `Sample #${selectedSampleId.value}`;
      const idx = nodes.indexOf(idStr);
      if (idx !== -1) {
          // 模拟 hover 效果
          svg.selectAll(".ribbon")
             .filter((r: any) => r.source.index !== idx && r.target.index !== idx)
             .style("opacity", 0.1);
      }
  }
};

// --- 生命周期 ---
onMounted(() => {
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => requestAnimationFrame(drawChart));
    resizeObserver.observe(chartRef.value);
  }
  drawChart();
});

onUnmounted(() => resizeObserver?.disconnect());

watch([topRankedAnomalies, selectedSampleId], drawChart);
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background-color: white; /* 已添加此行将背景变白 */
}
</style> -->



<template>
  <div class="chart-container" ref="chartRef">
    <div v-if="!hasData" class="no-data-tip">暂无数据或正在加载...</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, computed, onUnmounted, nextTick } from 'vue';
import * as d3 from 'd3';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';

const store = useExplorerStore();
const { topRankedAnomalies, explanations, selectedSampleId } = storeToRefs(store);

const chartRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

// --- 配置 ---
const CONFIG: Record<string, any> = {
  colors: {
    'Farmer': '#f56c6c',    // 红色 (高危)
    'Product': '#e6a23c',   // 橙色
    'Market': '#409eff',    // 蓝色
    'Contaminant': '#909399', // 灰色
    'Sample': '#909399'     // 样本默认颜色
  },
  labels: {
    'Farmer': '养殖户',
    'Market': '市场',
    'Product': '产品',
    'Contaminant': '污染物'
  }
};

const hasData = computed(() => topRankedAnomalies.value.length > 0);

// --- 1. 数据处理核心算法 ---
// 将数据转换为 邻接矩阵 (Adjacency Matrix)
const processedData = computed(() => {
  const samples = topRankedAnomalies.value.slice(0, 20); // 取前20个
  
  // 必须和 CONFIG.colors 的 key 对应
  const categories = ['Farmer', 'Market', 'Product', 'Contaminant'];
  
  const nodes = [...categories, ...samples.map(s => `Sample #${s.id}`)];
  const nCats = categories.length;
  const size = nodes.length;
  
  // 初始化全 0 矩阵
  const matrix = Array.from({ length: size }, () => new Array(size).fill(0));

  if (samples.length === 0) return { matrix, nodes, nCats };

  // 填充矩阵
  samples.forEach((sample, i) => {
    const sIndex = nCats + i; // 样本在矩阵中的索引
    
    // [关键修改] 适配新数据结构
    // 旧结构: explanation 是数组
    // 新结构: explanation 是对象 { stats: [...], paths: [...] }
    const explanation = explanations.value[String(sample.id)];
    
    // 防御性编程：如果没有解释数据，跳过
    if (!explanation) return;

    // 尝试从 stats 中直接读取归因分数
    let stats = [];
    if (explanation.stats) {
        // 新结构
        stats = explanation.stats;
    } else if (Array.isArray(explanation)) {
        // 旧结构 (万一后端回退了也能用) - 这里就不写复杂逻辑了，简单跳过或用旧逻辑
        // 为简单起见，假设已经是最新的 stats 结构
        return; 
    }

    // 将 stats 里的 percent 或 score 填入矩阵
    stats.forEach((stat: any) => {
        // stat 结构: { key: 'Farmer', score: 12.5, percent: 85.0, ... }
        const catIdx = categories.indexOf(stat.key);
        if (catIdx !== -1) {
            // 使用原始 score 作为权重，更能反映真实连接强度
            // 如果觉得连线太细，可以用 stat.percent
            const weight = stat.score || 0; 
            
            // 双向填充 (为了让弦图看起来是对称连接的)
            matrix[sIndex][catIdx] = weight;
            matrix[catIdx][sIndex] = weight;
        }
    });
  });

  return { matrix, nodes, nCats };
});

// --- 2. 绘图逻辑 ---
const drawChart = () => {
  if (!chartRef.value) return;
  const width = chartRef.value.clientWidth;
  const height = chartRef.value.clientHeight || 500;
  
  d3.select(chartRef.value).selectAll("*").remove();
  
  // 如果没有数据，不画
  const { matrix, nodes, nCats } = processedData.value;
  // 检查矩阵是否全为 0 (没数据时 sum 为 0)
  const totalWeight = d3.sum(matrix.flat());
  if (totalWeight === 0) return;

  const outerRadius = Math.min(width, height) * 0.5 - 60; 
  const innerRadius = outerRadius - 15;

  const svg = d3.select(chartRef.value).append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .style("font-family", "Helvetica, Arial, sans-serif");

  const chord = d3.chord()
    .padAngle(0.02) 
    .sortSubgroups(d3.descending);

  const chords = chord(matrix);

  // --- A. 绘制弧形 (Arc) ---
  const arc = d3.arc<d3.ChordGroup>()
    .innerRadius(innerRadius)
    .outerRadius(outerRadius);

  const group = svg.append("g")
    .selectAll("g")
    .data(chords.groups)
    .join("g");

  group.append("path")
    .attr("fill", d => {
      const name = nodes[d.index];
      // 分类节点颜色
      if (d.index < nCats) return CONFIG.colors[name] || '#ccc';
      
      // 样本节点颜色
      const isSelected = name.includes(String(selectedSampleId.value || ''));
      return isSelected ? '#b71c1c' : '#909399';
    })
    .attr("stroke", "#fff")
    .attr("d", arc)
    .style("cursor", "pointer")
    .on("click", (e, d) => {
        const name = nodes[d.index];
        if (d.index >= nCats) {
            const id = parseInt(name.replace('Sample #', ''));
            store.selectSample(id);
        }
    })
    .on("mouseover", function(e, d) {
       d3.select(this).attr("transform", "scale(1.05)");
       fade(0.1)(e, d);
    })
    .on("mouseout", function(e, d) {
       d3.select(this).attr("transform", "scale(1)");
       fade(1)(e, d);
    });

  // --- B. 绘制文字标签 (Labels) ---
  group.append("text")
    .each(d => { (d as any).angle = (d.startAngle + d.endAngle) / 2; })
    .attr("dy", ".35em")
    .attr("transform", (d: any) => `
      rotate(${d.angle * 180 / Math.PI - 90})
      translate(${outerRadius + 10})
      ${d.angle > Math.PI ? "rotate(180)" : ""}
    `)
    .attr("text-anchor", (d: any) => d.angle > Math.PI ? "end" : "start")
    .text(d => {
       const name = nodes[d.index];
       if (d.index < nCats) return CONFIG.labels[name] || name; 
       
       // 样本只显示 ID，如果弧度太小就不显示，防止重叠
       if (d.endAngle - d.startAngle < 0.04) return ""; 
       return name.replace('Sample ', '#');
    })
    .style("font-size", "10px")
    .style("fill", "#606266")
    .style("font-weight", d => d.index < nCats ? "bold" : "normal");

  // --- C. 绘制连线 (Ribbons) ---
  const ribbon = d3.ribbon<d3.Chord>()
    .radius(innerRadius);

  svg.append("g")
    .attr("fill-opacity", 0.6)
    .selectAll("path")
    .data(chords)
    .join("path")
    .attr("d", ribbon)
    .attr("class", "ribbon")
    // 颜色逻辑：连线颜色跟随"分类"节点
    .attr("fill", d => {
        const catIndex = d.source.index < nCats ? d.source.index : d.target.index;
        const catName = nodes[catIndex];
        return CONFIG.colors[catName] || '#999';
    })
    .style("mix-blend-mode", "multiply")
    .style("transition", "opacity 0.3s");

  // --- 交互效果 ---
  function fade(opacity: number) {
    return (e: any, d: any) => {
      svg.selectAll(".ribbon")
        .filter((r: any) => r.source.index !== d.index && r.target.index !== d.index)
        .transition()
        .style("opacity", opacity);
    };
  }
  
  // 初始化高亮选中状态
  if (selectedSampleId.value) {
      const idStr = `Sample #${selectedSampleId.value}`;
      const idx = nodes.indexOf(idStr);
      if (idx !== -1) {
          svg.selectAll(".ribbon")
             .filter((r: any) => r.source.index !== idx && r.target.index !== idx)
             .style("opacity", 0.1);
      }
  }
};

// --- 生命周期 ---
onMounted(() => {
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
        // 使用 requestAnimationFrame 防抖
        requestAnimationFrame(() => drawChart());
    });
    resizeObserver.observe(chartRef.value);
  }
  // 确保数据加载后再画
  nextTick(() => drawChart());
});

onUnmounted(() => resizeObserver?.disconnect());

// 深度监听数据变化，一旦 explanations 加载完成自动重画
watch(
    [() => topRankedAnomalies.value, () => explanations.value, () => selectedSampleId.value], 
    () => { nextTick(drawChart); },
    { deep: true }
);
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background-color: white; 
  border-radius: 8px; /* 可选：圆角让它看起来更像卡片 */
}

.no-data-tip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #909399;
    font-size: 14px;
}
</style>