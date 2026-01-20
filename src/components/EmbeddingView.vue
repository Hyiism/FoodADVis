<script setup lang="ts">
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { ScatterChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  VisualMapComponent // 1. 导入 visualMap 用于颜色映射
} from 'echarts/components';
import VChart, { THEME_KEY } from 'vue-echarts';
import { computed, provide } from 'vue';

// 2. 导入 Pinia Store
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';

// 3. 注册 ECharts 组件
use([
  CanvasRenderer,
  ScatterChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  VisualMapComponent // 注册 visualMap
]);

// (可选) 提供 ECharts 主题
provide(THEME_KEY, 'light');

// --- 4. 连接到 Store ---
const store = useExplorerStore();
// [修改点] 我们需要 filteredSamples (画图) 和 selectedSampleId (突出显示)
const { filteredSamples, selectedSampleId } = storeToRefs(store);

// --- 5. 计算 ECharts Option ---
// 这个 "计算属性" 会在 filteredSamples 或 selectedSampleId 变化时
// 自动重新计算，从而更新图表
const chartOption = computed(() => ({
  
  // 隐藏标题
  title: {
    show: false 
  },

  // 提示框
  tooltip: {
    trigger: 'item',
    formatter: (params: any) => {
      // params.data 就是我们下面 map 里的数组
      const data = params.data;
      return `
        <b>样本 ID: ${data[3]}</b><br/>
        风险等级: ${data[4]}<br/>
        异常分数: ${data[2].toFixed(4)}<br/>
      `;
    }
  },

  // [修改点] 调整 grid，给顶部的图例留一点点空间
  grid: {
    left: '0%',
    right: '0%',
    bottom: '0%',
    top: '40px', // 👈 为顶部的图例留出 40px 的空间
    containLabel: false
  },

  // 隐藏 X 轴
  xAxis: {
    type: 'value',
    show: false,
    splitLine: { show: false }
  },

  // 隐藏 Y 轴
  yAxis: {
    type: 'value',
    show: false,
    splitLine: { show: false }
  },

  // [修改点] 调整 visualMap (图例)
  visualMap: {
    type: 'piecewise',
    orient: 'horizontal', // 👈 1. 改为“水平”布局
    right: 10,           // 👈 2. 放在“右侧 10px”
    top: 10,             // 👈 3. 放在“顶部 10px”
    itemWidth: 15,       // (可选) 调整色块大小
    itemHeight: 10,      // (可选) 调整色块大小
    textStyle: {
      fontSize: 12
    },
    pieces: [
      { value: '高风险', label: '高风险', color: '#c23531' },
      { value: '中风险', label: '中风险', color: '#f1c40f' },
      { value: '低风险', label: '低风险', color: '#3498db' }
    ],
    dimension: 4, // 检查 data[4] (riskLevel)
    inRange: {
      color: ['#c23531', '#f1c40f', '#3498db']
    },
    outOfRange: {
      color: '#999'
    }
  },

  // --- 6. 数据系列 (样式修复) ---
  series: [
    {
      name: 'Samples',
      type: 'scatter',
      
      // [样式修复 1] 动态调整点的大小
      symbolSize: (params: any) => {
        // 在 ECharts 5+ 中，params 是[x, y, score, id, riskLevel]
        // ECharts 4- 中，params 可能是 { data: [...] }
        // 我们假设是 ECharts 5+ 的 data 数组
        const sampleId = params[3]; // 在 data 数组中，id 在索引 3
        
        // 健壮性检查 (以防 params 不是数组)
        if (typeof params === 'object' && params.data) {
           const sampleIdFromObj = params.data[3];
           return sampleIdFromObj === selectedSampleId.value ? 8 : 3;
        }

        // 默认按数组索引
        return sampleId === selectedSampleId.value ? 8 : 3;
      },
      
      // [样式修复 2] 添加边框和透明度
      itemStyle: {
        borderColor: '#555', // 深灰色边框
        borderWidth: 0.5,     // 0.5 像素的边框宽度
        opacity: 0.8          // 略微透明，以便观察重叠
      },

      // [样式修复 3] 选中时高亮 (与 symbolSize 配合)
      emphasis: {
        focus: 'self',
        itemStyle: {
          borderColor: '#000',
          borderWidth: 1.5,
          opacity: 1
        }
      },
      
      // [数据] 将 store.filteredSamples 映射到 ECharts
      data: filteredSamples.value.map(sample => ([
        sample.x,        // 索引 0: x
        sample.y,        // 1: y
        sample.score,    // 2: score
        sample.id,       // 3: id
        sample.riskLevel // 4: riskLevel
      ]))
    }
  ]
}));

// --- 7. 点击事件 ---
function handleClick(params: any) {
  // >>> 新增调试日志 <<<
  console.log('👆 EmbeddingView: 捕获点击事件', params);

  // 之前的逻辑
  // 注意：要确保 params.data 存在且索引正确
  if (params && params.data) {
      // 假设 ID 在索引 3 (根据你之前的 chartOption 配置: [x, y, score, id, riskLevel])
      const sampleId = params.data[3]; 
      console.log('📍 解析出 SampleID:', sampleId);
      
      store.selectSample(sampleId);
  } else {
      console.warn('⚠️ 点击无效: params.data 不存在');
  }
}
</script>

<template>
  <div class="panel-container">
    <v-chart
      class="chart"
      :option="chartOption"
      autoresize
      @click="handleClick"
    />
  </div>
</template>

<style scoped>
.panel-container {
  /* 占满整个格子，不留白边 */
  padding: 0; 
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  background-color: #ffffff;
  border-right: 1px solid #e0e0e0;
}
.chart {
  height: 100%;
  width: 100%;
}
</style>