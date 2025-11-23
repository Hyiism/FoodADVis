<script setup lang="ts">
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { GraphChart } from 'echarts/charts'; // 还是用图关系图
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components';
import VChart, { THEME_KEY } from 'vue-echarts';
import { computed, provide } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';

// 1. 注册 ECharts 组件
use([
  CanvasRenderer,
  GraphChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent
]);

provide(THEME_KEY, 'light');

// 2. 连接 Store
const store = useExplorerStore();
// 我们需要“选中的 ID”和它的“上下文”
const { selectedSampleId, selectedSampleContext } = storeToRefs(store);

// 3. 颜色映射 (和 MetaPathView 保持一致)
const TYPE_COLORS: Record<string, string> = {
  'InspectionRecord': '#c23531',
  'Product': '#e6a23c',
  'Market': '#409eff',
  'Farmer': '#67c23a',
  'Contaminant': '#909399',
  'Unknown': '#000'
};

// 4. [核心] 计算 ECharts Graph 的 Option
const chartOption = computed(() => {
  // 必须选中了一个样本，并且它的上下文 *已加载*
  if (!selectedSampleId.value || !selectedSampleContext.value) {
    return null; // 如果为 null, 模板会显示“空状态”
  }

  const context = selectedSampleContext.value;
  const nodes: any[] = [];
  const edges: any[] = [];

  // 1. 添加“中心”节点 (我们选中的样本)
  const centerNodeId = `InspectionRecord[${selectedSampleId.value}]`;
  nodes.push({
    id: centerNodeId,
    name: centerNodeId,
    value: `样本 ID: ${selectedSampleId.value}`,
    symbolSize: 40, // 中心节点最大
    category: 'InspectionRecord',
    label: { show: true, formatter: `样本\n[${selectedSampleId.value}]` },
    // 固定在中心
    x: 0,
    y: 0,
    fixed: true,
  });
  
  // 2. 遍历上下文，添加“邻居”节点和“边”
  // (Object.entries 会遍历 context 里的 'products', 'markets' ...)
  for (const [type, idList] of Object.entries(context)) {
    
    // (把 'products' 转换成 'Product')
    const nodeType = type.charAt(0).toUpperCase() + type.slice(1, -1);
    
    (idList as (string | number)[]).forEach((id: string | number) => {
      const neighborNodeId = `${nodeType}[${id}]`;
      
      // 添加邻居节点
      nodes.push({
        id: neighborNodeId,
        name: neighborNodeId,
        value: `ID: ${id}`,
        symbolSize: 20,
        category: nodeType,
        label: { show: true, formatter: `${nodeType}\n[${id}]` },
        draggable: true,
      });
      
      // 添加从邻居指向中心的边
      edges.push({
        source: neighborNodeId,
        target: centerNodeId,
        lineStyle: {
          width: 2
        }
      });
    });
  }

  // 3. 生成图例
  const categories = Array.from(new Set(nodes.map(n => n.category))).map(name => ({
    name: name,
    itemStyle: { color: TYPE_COLORS[name] || '#000' }
  }));

  return {
    title: {
      text: '样本上下文 (1跳邻居)',
      left: 'center',
      top: 10,
      textStyle: { fontSize: 14 }
    },
    tooltip: {
      formatter: '{b}' // 只显示 name (e.g., "Product[5040]")
    },
    legend: {
      data: categories.map(c => c.name),
      bottom: 10,
      itemWidth: 15,
      itemHeight: 10,
      textStyle: { fontSize: 10 }
    },
    animationDurationUpdate: 1000,
    series: [
      {
        type: 'graph',
        layout: 'force', // 力引导布局
        force: {
          repulsion: 200, // 排斥力
          edgeLength: 100 // 边长
        },
        roam: true, // 允许缩放和平移
        label: {
          show: true,
          position: 'bottom',
          fontSize: 10,
          color: '#333'
        },
        data: nodes,
        links: edges,
        categories: categories,
        emphasis: {
          focus: 'adjacency'
        }
      }
    ]
  };
});
</script>

<template>
  <div class="panel-container">
    <v-chart
      v-if="chartOption"
      class="chart"
      :option="chartOption"
      autoresize
    />
    
    <div v-else class="empty-state">
      <span class="icon">👆</span>
      <p>请在上方散点图中点击一个样本</p>
      <p>以查看其相关上下文</p>
    </div>
  </div>
</template>

<style scoped>
/* (样式和 MetaPathView 的基本一致) */
.panel-container {
  padding: 0;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  background-color: #ffffff;
  border-top: 1px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
  position: relative;
}

.chart {
  height: 100%;
  width: 100%;
}

.empty-state {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #909399;
  text-align: center;
}

.empty-state .icon {
  font-size: 24px;
  margin-bottom: 10px;
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
  40% {transform: translateY(-10px);}
  60% {transform: translateY(-5px);}
}
</style>