<script setup lang="ts">
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { GraphChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  ToolboxComponent
} from 'echarts/components';
import VChart, { THEME_KEY } from 'vue-echarts';
import { ref, onMounted, computed, provide } from 'vue';
import { Search, Refresh } from '@element-plus/icons-vue';

use([CanvasRenderer, GraphChart, TitleComponent, TooltipComponent, LegendComponent, ToolboxComponent]);
provide(THEME_KEY, 'light');

const chartInstance = ref<any>(null);
const loading = ref(true);
const searchQuery = ref('');
const graphData = ref<any>({ nodes: [], links: [], categories: [] });

// 颜色映射 (保持系统一致性)
const CATEGORY_COLOR_MAP: Record<string, string> = {
  '检测样本': '#ef4444', // 红
  '农贸市场': '#409eff', // 蓝
  '养殖户': '#67c23a',   // 绿
  '水产品': '#e6a23c',   // 橙
  '污染物': '#909399'    // 灰
};

const chartOption = computed(() => {
  return {
    backgroundColor: '#ffffff',
    title: {
      text: '全域风险关联图谱 (Risk Relation Network)',
      subtext: '基于 UMGAD 模型的风险团伙挖掘',
      top: 20,
      left: 20,
      textStyle: { fontSize: 16, fontWeight: 'bold', color: '#333' }
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.95)',
      textStyle: { color: '#333' },
      formatter: (params: any) => {
        if (params.dataType === 'edge') {
          return `${params.data.source} <span style="color:#ccc">--[${params.data.value}]--></span> ${params.data.target}`;
        }
        const d = params.data;
        return `
          <div style="font-weight:bold;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:4px">${d.name}</div>
          <div>ID: <span style="font-family:monospace">${d.id}</span></div>
          <div>类型: ${d.category}</div>
          ${d.value ? `<div>检测值: <b>${parseFloat(d.value).toFixed(4)}</b></div>` : ''}
        `;
      }
    },
    legend: {
      data: graphData.value.categories.map((a: any) => a.name),
      bottom: 20,
      left: 'center',
      itemGap: 20,
      textStyle: { fontSize: 12 },
      selectedMode: true // 允许点击图例隐藏特定类型
    },
    // [核心] 力导向图配置
    series: [
      {
        name: 'Risk Graph',
        type: 'graph',
        layout: 'force',
        data: graphData.value.nodes,
        links: graphData.value.links,
        categories: graphData.value.categories,
        
        // 交互设置
        roam: true,        // 允许缩放平移
        draggable: true,   // 允许拖拽节点 (探索的关键!)
        zoom: 0.6,         // 初始缩放
        
        // 节点样式
        label: {
          show: true,
          position: 'right',
          formatter: '{b}', // 显示名字
          fontSize: 10,
          color: '#333'
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 1,
          shadowBlur: 5,
          shadowColor: 'rgba(0,0,0,0.1)'
        },
        
        // 连线样式
        lineStyle: {
          color: 'source',
          curveness: 0.1,
          opacity: 0.4,
          width: 1
        },
        
        // 力学模拟参数 (调教手感)
        force: {
          repulsion: 300,     // 斥力：节点之间推开的距离
          gravity: 0.05,      // 重力：往中心拉的力
          edgeLength: [50, 150], // 连线长度范围
          layoutAnimation: true, // 开启物理引擎动画
          friction: 0.6       // 摩擦力：防止动个不停
        },
        
        // [核心功能] 邻接高亮
        emphasis: {
          focus: 'adjacency', // 悬停时，只显示邻居，其他变暗
          lineStyle: { width: 3, opacity: 1 },
          label: { show: true, fontWeight: 'bold', fontSize: 12 }
        },
        blur: {
          itemStyle: { opacity: 0.1 },
          lineStyle: { opacity: 0.05 }
        }
      }
    ]
  };
});

// 数据加载
const loadData = async () => {
  loading.value = true;
  try {
    // 加载 Python 后端生成的全量风险网络
    const res = await fetch('/api_data_risk_network.json');
    const data = await res.json();
    
    // 应用自定义颜色
    const categoriesWithColor = data.categories.map((c: any) => ({
      name: c.name,
      itemStyle: { color: CATEGORY_COLOR_MAP[c.name] || '#ccc' }
    }));

    graphData.value = {
      nodes: data.nodes,
      links: data.links,
      categories: categoriesWithColor
    };
  } catch (e) {
    console.error("图谱加载失败:", e);
  } finally {
    loading.value = false;
  }
};

// 搜索定位功能
const handleSearch = () => {
  if (!searchQuery.value || !chartInstance.value) return;
  
  // 1. 找到节点
  const targetNode = graphData.value.nodes.find((n: any) => 
    n.name.includes(searchQuery.value) || n.id.includes(searchQuery.value)
  );
  
  if (targetNode) {
    // 2. 触发 ECharts 高亮
    chartInstance.value.dispatchAction({
      type: 'highlight',
      seriesIndex: 0,
      name: targetNode.name
    });
    
    // 3. 简单的定位提示
    alert(`已定位节点: ${targetNode.name} (ID: ${targetNode.id})\n请在图中寻找高亮的大点。`);
  } else {
    alert('未找到匹配的节点');
  }
};

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="explorer-wrapper">
    <div class="toolbar">
      <div class="search-box">
        <el-input 
          v-model="searchQuery" 
          placeholder="搜索 养殖户/市场/产品..." 
          :prefix-icon="Search"
          @keyup.enter="handleSearch"
          clearable
          size="small"
        />
      </div>
      <div class="tips">
        <small>🖱️ 滚轮缩放 · 左键拖拽 · 点击高亮</small>
      </div>
    </div>

    <div class="chart-area" v-loading="loading">
      <v-chart 
        ref="chartInstance"
        class="chart" 
        :option="chartOption" 
        autoresize 
      />
    </div>
  </div>
</template>

<style scoped>
.explorer-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  position: relative;
}

.toolbar {
  height: 50px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f0f0f0;
  z-index: 10;
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(4px);
}

.search-box {
  width: 240px;
}

.tips {
  color: #999;
}

.chart-area {
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.chart {
  width: 100%;
  height: 100%;
}
</style>