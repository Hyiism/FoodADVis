<script setup lang="ts">
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { GraphChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import VChart, { THEME_KEY } from 'vue-echarts';
import { computed, provide, ref, watch } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';

use([CanvasRenderer, GraphChart, TitleComponent, TooltipComponent, LegendComponent]);
provide(THEME_KEY, 'light');

const store = useExplorerStore();
// 1. [关键修改] 我们直接把整个 context 大字典取出来，不再依赖 getter
const { selectedSampleId, context: allContextData } = storeToRefs(store);

// 2. [关键修改] 组件内直接查找数据 (绕过 Store Getter)
const localContext = computed(() => {
  const id = selectedSampleId.value;
  const data = allContextData.value;
  
  // 安全检查
  if (!id || !data) return null;

  // 暴力匹配：不管 Key 是数字还是字符串，都试一遍
  // JS 对象属性中，data[123] 和 data["123"] 通常是等价的，但为了保险我们都写上
  const result = data[id] || data[String(id)];
  
  // 打印日志 (仅调试用)
  if (result) {
    // console.log(`✅ ContextExplorer: 成功找到 ID [${id}] 的数据`, result);
  } else {
    console.warn(`❌ ContextExplorer: ID [${id}] 在 context.json 中未找到!`);
    // 打印几个 Key 看看格式
    // console.log('Store Keys preview:', Object.keys(data).slice(0, 3));
  }
  
  return result || null;
});

// 3. 获取模式 (Safe/Risk) - 兼容 store 可能没更新的情况
const currentMode = computed(() => {
  // 如果 store 还没写 currentAnalysisMode，我们手动判断一下
  if (store.currentAnalysisMode) return store.currentAnalysisMode;
  
  // 手动补救逻辑
  const sample = store.samples?.find(s => s.id === selectedSampleId.value);
  if (sample && sample.riskLevel === '低风险') return 'safe';
  return 'risk';
});

// 4. 颜色配置
const COLORS = computed(() => {
  const isSafe = currentMode.value === 'safe';
  return {
    center: isSafe ? '#67c23a' : '#c23531', // 绿 vs 红
    edge: isSafe ? '#b3e19d' : '#fde2e2',
    categories: {
      'InspectionRecord': isSafe ? '#67c23a' : '#c23531',
      'Product': '#e6a23c', 'Market': '#409eff',
      'Farmer': isSafe ? '#529b2e' : '#67c23a', // 优质农户用深绿
      'Contaminant': '#909399', 'Unknown': '#333'
    }
  };
});

// 5. 图表配置
const chartOption = computed(() => {
  // 使用本地计算的 context
  const context = localContext.value;
  
  if (!selectedSampleId.value) return null;
  // 宽松检查：只要 context 不是 null 即可
  if (!context) return null;

  const nodes: any[] = [];
  const edges: any[] = [];
  const categoriesMap = new Set<string>();
  const isSafe = currentMode.value === 'safe';

  // --- 中心节点 ---
  const centerNodeId = `Root_${selectedSampleId.value}`;
  nodes.push({
    id: centerNodeId,
    name: centerNodeId,
    value: `Sample: ${selectedSampleId.value}`,
    symbolSize: 50,
    category: 0,
    label: { 
      show: true, 
      formatter: isSafe ? `✅ 优质\n${selectedSampleId.value}` : `⚠️ 异常\n${selectedSampleId.value}`,
      fontSize: 12, fontWeight: 'bold', color: '#333'
    },
    itemStyle: { 
      color: COLORS.value.center, 
      borderColor: '#fff', borderWidth: 2, 
      shadowBlur: 5, shadowColor: COLORS.value.center 
    },
    fixed: true, x: 300, y: 300
  });
  categoriesMap.add('InspectionRecord');

  // --- 邻居节点 ---
  // 遍历 products, markets, farmers 等
  Object.entries(context).forEach(([key, idList]) => {
    // 简单的单复数处理
    let type = key.charAt(0).toUpperCase() + key.slice(1);
    if (type.endsWith('s')) type = type.slice(0, -1);

    // 确保 idList 是数组，防止数据格式错误导致崩溃
    if (Array.isArray(idList)) {
      idList.forEach((id: string | number) => {
        const neighborId = `${type}_${id}`;
        
        // 节点去重
        if (!nodes.find(n => n.id === neighborId)) {
          nodes.push({
            id: neighborId, name: neighborId, value: `ID: ${id}`,
            symbolSize: 28, category: 0, 
            itemStyle: { color: COLORS.value.categories[type] || '#999' },
            label: { show: true, position: 'bottom', formatter: '{b}', fontSize: 10 },
            draggable: true
          });
          categoriesMap.add(type);
        }
        
        // 连线
        edges.push({
          source: neighborId, target: centerNodeId,
          lineStyle: { width: 3, color: COLORS.value.edge }
        });
      });
    }
  });

  // 生成图例分类
  const categories = Array.from(categoriesMap).map(name => ({ name }));
  nodes.forEach(n => {
    const typeName = n.id.split('_')[0];
    // 特殊处理中心节点
    if (n.id.startsWith('Root')) {
       n.category = Array.from(categoriesMap).indexOf('InspectionRecord');
    } else {
       const idx = Array.from(categoriesMap).indexOf(typeName);
       if (idx !== -1) n.category = idx;
    }
  });

  return {
    title: {
      text: isSafe ? '✨ 安全上下文溯源' : '🚨 风险上下文溯源',
      left: 'center', top: 5,
      textStyle: { fontSize: 14, color: '#333' }
    },
    tooltip: {},
    legend: {
      data: categories.map(c => c.name),
      bottom: 0, itemWidth: 15, itemHeight: 10, textStyle: {fontSize: 10}
    },
    animationDurationUpdate: 300,
    series: [{
      type: 'graph', layout: 'force',
      data: nodes, links: edges, categories: categories,
      roam: true,
      label: { show: true },
      force: { repulsion: 350, edgeLength: 100, gravity: 0.1 }
    }]
  };
});
</script>

<template>
  <div class="panel-container">
    <v-chart
      v-if="chartOption"
      class="chart"
      :option="chartOption"
      :key="`graph-${selectedSampleId}`"
      autoresize
    />
    
    <div v-else class="empty-state">
      <span class="icon">{{ selectedSampleId ? '🚫' : '👆' }}</span>
      <p v-if="!selectedSampleId">请选择一个样本</p>
      <div v-else>
        <p>ID: {{ selectedSampleId }} 无关联数据</p>
        <small style="color: #ccc">请检查 context.json 中是否包含 key: "{{ selectedSampleId }}"</small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-container { 
  padding: 0; height: 100%; width: 100%; 
  background-color: #ffffff; border-left: 1px solid #f0f0f0; 
  position: relative; 
}
.chart { height: 100%; width: 100%; }
.empty-state { 
  height: 100%; width: 100%; 
  display: flex; flex-direction: column; justify-content: center; 
  align-items: center; color: #909399; font-size: 13px; 
}
.icon { font-size: 32px; margin-bottom: 12px; opacity: 0.6; }
</style>