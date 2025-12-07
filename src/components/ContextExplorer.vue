<script setup lang="ts">
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { GraphChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components';
import VChart, { THEME_KEY } from 'vue-echarts';
import { computed, provide } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';

// 1. Register ECharts components
use([
  CanvasRenderer,
  GraphChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent
]);

provide(THEME_KEY, 'light');

// 2. Connect Store
const store = useExplorerStore();
// Access necessary state and getters
// Note: currentContext is the getter we updated in the store previously
const { selectedSampleId, currentContext } = storeToRefs(store);

// Access the current analysis mode (risk vs safe)
const currentMode = computed(() => store.currentAnalysisMode);

// 3. Dynamic Color Mapping
// Returns different color palettes based on the analysis mode
const COLORS = computed(() => {
  const isSafe = currentMode.value === 'safe';
  return {
    center: isSafe ? '#67c23a' : '#c23531', // Green for safe, Red for risk
    edge: isSafe ? '#e1f3d8' : '#fde2e2',   // Light green edge vs Light red edge
    categories: {
      'InspectionRecord': isSafe ? '#67c23a' : '#c23531',
      'Product': '#e6a23c',
      'Market': '#409eff',
      // Highlight Farmers in safe mode as they are often key to quality
      'Farmer': isSafe ? '#95d475' : '#67c23a', 
      'Contaminant': '#909399',
      'Unknown': '#000'
    }
  };
});

// 4. Compute ECharts Option
const chartOption = computed(() => {
  // A. Check for missing selection
  if (!selectedSampleId.value) return null;
  
  // B. Check for valid context data
  const context = currentContext.value; 
  if (!context || Object.keys(context).length === 0) {
    return null; 
  }

  const nodes: any[] = [];
  const edges: any[] = [];
  const categoriesMap = new Set<string>();
  const isSafe = currentMode.value === 'safe';

  // 1. Add "Center" Node (Selected Sample)
  const centerNodeId = `InspectionRecord_${selectedSampleId.value}`;
  nodes.push({
    id: centerNodeId,
    name: centerNodeId,
    value: `Sample ID: ${selectedSampleId.value}`,
    symbolSize: 45,
    category: 0, // Reserve index 0 for InspectionRecord
    // Dynamic label and styling based on mode
    label: { 
        show: true, 
        formatter: isSafe ? `✅ Quality Sample\n[${selectedSampleId.value}]` : `⚠️ Anomaly Sample\n[${selectedSampleId.value}]`,
        fontSize: 11,
        fontWeight: 'bold'
    },
    itemStyle: { 
        color: COLORS.value.center,
        borderColor: '#fff',
        borderWidth: 2,
        shadowBlur: 10,
        shadowColor: COLORS.value.center
    },
    fixed: true,
    x: 300, 
    y: 300
  });
  categoriesMap.add('InspectionRecord');
  
  // 2. Iterate context to add Neighbors and Edges
  // Context structure: { products: [1, 2], markets: [3], ... }
  Object.entries(context).forEach(([key, idList]) => {
    // Simple plural to singular conversion: products -> Product
    let type = key.charAt(0).toUpperCase() + key.slice(1);
    if (type.endsWith('s')) type = type.slice(0, -1);
    
    // Ensure idList is an array
    if (Array.isArray(idList)) {
      idList.forEach((id: string | number) => {
        const neighborId = `${type}_${id}`;
        
        // Add Node if unique
        if (!nodes.find(n => n.id === neighborId)) {
          nodes.push({
            id: neighborId,
            name: neighborId,
            value: `ID: ${id}`,
            symbolSize: 25,
            // category index will be assigned later based on the map order
            category: 0, 
            itemStyle: { color: COLORS.value.categories[type] || '#ccc' },
            label: { show: true, position: 'bottom', formatter: '{b}', fontSize: 10 },
            draggable: true
          });
          categoriesMap.add(type);
        }
        
        // Add Edge
        edges.push({
          source: neighborId,
          target: centerNodeId,
          lineStyle: {
              width: 2,
              color: COLORS.value.edge // Dynamic edge color
          }
        });
      });
    }
  });

  // 3. Generate Categories Array for ECharts
  const categories = Array.from(categoriesMap).map(name => ({ name }));

  // Update node category indices to match the categories array
  nodes.forEach(n => {
    const catName = n.id.split('_')[0];
    const idx = Array.from(categoriesMap).indexOf(catName);
    if (idx !== -1) n.category = idx;
  });

  return {
    title: {
      text: isSafe ? '✨ Quality Traceability Graph' : '🚨 Risk Association Graph',
      subtext: isSafe ? '1-Hop Neighbors (Safe Context)' : '1-Hop Neighbors (Risk Context)',
      left: 'center',
      top: 10,
      textStyle: { fontSize: 14, color: '#333' }
    },
    tooltip: {},
    legend: {
      data: categories.map(c => c.name),
      bottom: 5,
      itemWidth: 15,
      itemHeight: 10,
      textStyle: { fontSize: 10 }
    },
    series: [
      {
        type: 'graph',
        layout: 'force',
        data: nodes,
        links: edges,
        categories: categories,
        roam: true,
        label: {
          show: true,
          position: 'right',
          formatter: '{b}'
        },
        force: {
          repulsion: 250,
          edgeLength: 90
        },
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
      <span class="icon">{{ selectedSampleId ? '🚫' : '🕸️' }}</span>
      <p v-if="!selectedSampleId">Select a sample to explore its network</p>
      <p v-else>No context data available for Sample {{ selectedSampleId }}</p>
    </div>
  </div>
</template>

<style scoped>
.panel-container {
  padding: 0;
  height: 100%;
  width: 100%;
  background-color: #ffffff;
  position: relative;
  overflow: hidden;
  border-left: 1px solid #f0f0f0; /* Subtle separator */
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
  font-size: 13px;
}

.empty-state .icon {
  font-size: 32px;
  margin-bottom: 12px;
  opacity: 0.6;
}
</style>