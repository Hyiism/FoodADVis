<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import { ElCollapse, ElCollapseItem } from 'element-plus';

const store = useExplorerStore();
const { selectedSampleId, selectedSampleMetaPath } = storeToRefs(store);

// --- 辅助逻辑 ---
const parseNode = (nodeStr: string): { type: string, id: string } => {
  const match = nodeStr.match(/^(\w+)\[(\d+)\]$/);
  if (match) return { type: match[1], id: match[2] };
  return { type: 'Unknown', id: nodeStr };
};

// 颜色配置 (保持与弦图一致)
const TYPE_COLORS: Record<string, string> = {
  'InspectionRecord': '#f56c6c', // 红
  'Product': '#e6a23c',          // 橙
  'Market': '#409eff',           // 蓝
  'Farmer': '#67c23a',           // 绿
  'Contaminant': '#909399',      // 灰
  'Unknown': '#333'
};

// --- 数据分组逻辑 (保留好用的分组功能) ---
const groupedPaths = computed(() => {
  const groups: Record<string, any[]> = {};
  const paths = selectedSampleMetaPath.value || [];

  paths.forEach(chain => {
    const types = [];
    types.push(parseNode(chain[0].from).type);
    chain.forEach(link => types.push(parseNode(link.to).type));
    const key = types.join(' → ');
    if (!groups[key]) groups[key] = [];
    groups[key].push(chain);
  });
  return groups;
});

// 默认展开所有面板
const activeNames = ref<string[]>([]);
watch(groupedPaths, (newVal) => {
  activeNames.value = Object.keys(newVal);
}, { deep: true });

</script>

<template>
  <div class="path-flow-wrapper">
    <div class="header-bar">
      <h4>Sample <strong>{{ selectedSampleId || '...' }}</strong> Analysis</h4>
    </div>
    
    <div v-if="selectedSampleId && Object.keys(groupedPaths).length > 0" class="content-area">
      <el-collapse v-model="activeNames">
        <el-collapse-item 
          v-for="(paths, templateKey) in groupedPaths" 
          :key="templateKey" 
          :name="templateKey"
        >
          <template #title>
            <div class="group-title">
              <span class="template-text">{{ templateKey }}</span>
              <span class="count-badge">{{ paths.length }}</span>
            </div>
          </template>

          <div class="path-list">
            <div v-for="(chain, idx) in paths" :key="idx" class="path-row-container">
              <div class="path-row">
                <div :class="['node-card', parseNode(chain[0].from).type]">
                  <div class="node-type">{{ parseNode(chain[0].from).type }}</div>
                  <div class="node-id">{{ parseNode(chain[0].from).id }}</div>
                </div>

                <template v-for="(link, i) in chain" :key="i">
                  <div class="connector">
                    <div class="relation-label">{{ link.relation }}</div>
                    <div class="arrow-line"></div>
                  </div>
                  <div :class="['node-card', parseNode(link.to).type]">
                    <div class="node-type">{{ parseNode(link.to).type }}</div>
                    <div class="node-id">{{ parseNode(link.to).id }}</div>
                  </div>
                </template>
              </div>
            </div>
          </div>

        </el-collapse-item>
      </el-collapse>
    </div>

    <div v-else class="empty-state">
      <div v-if="!selectedSampleId">
          <p>Select a node from the Chord Diagram</p>
      </div>
      <div v-else>
          <p>No paths found.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.path-flow-wrapper {
  background-color: #ffffff;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header-bar {
  padding: 15px 20px;
  border-bottom: 1px solid #eee;
  background: #fff;
}
.header-bar h4 { 
  font-family: 'Times New Roman', serif; 
  font-size: 14px; 
  color: #333;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0; 
}

.content-area {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

/* --- 折叠面板样式重置 --- */
:deep(.el-collapse) { border: none; }
:deep(.el-collapse-item) { 
  margin-bottom: 15px; 
  border: 1px solid #ebeef5; 
  border-radius: 4px; 
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}
:deep(.el-collapse-item__header) {
  background-color: #fafafa;
  padding: 0 15px;
  height: 40px;
  line-height: 40px;
  border-bottom: 1px solid #ebeef5;
}
:deep(.el-collapse-item__content) {
  padding: 0; /* 去除默认内边距，由子元素控制 */
}

.group-title {
  display: flex;
  align-items: center;
  width: 100%;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  font-weight: 600;
  color: #555;
}
.count-badge {
  margin-left: auto;
  background: #eee;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  color: #666;
}

/* --- 路径行样式 --- */
.path-list {
  background: #fff;
}
.path-row-container {
  padding: 15px;
  border-bottom: 1px dashed #f0f0f0;
  overflow-x: auto; /* 允许横向滚动 */
}
.path-row-container:last-child { border-bottom: none; }

.path-row {
  display: flex;
  align-items: center;
  min-width: max-content; /* 宽度自适应内容 */
}

/* --- 节点卡片 (经典样式) --- */
.node-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 90px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid; /* 边框色由类型决定 */
  background-color: #fff;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  transition: transform 0.2s;
}
.node-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.05);
}

.node-type {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}
.node-id {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

/* 具体的颜色定义 (Pastel 风格) */
.node-card.InspectionRecord { background: #fef0f0; border-color: #fbc4c4; color: #f56c6c; }
.node-card.Product { background: #fdf6ec; border-color: #f5dab1; color: #e6a23c; }
.node-card.Market { background: #ecf5ff; border-color: #b3d8ff; color: #409eff; }
.node-card.Farmer { background: #f0f9eb; border-color: #c2e7b0; color: #67c23a; }
.node-card.Contaminant { background: #f4f4f5; border-color: #d3d4d6; color: #909399; }

/* --- 连接箭头 --- */
.connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 10px;
  min-width: 60px;
}
.relation-label {
  font-size: 10px;
  color: #999;
  font-style: italic;
  margin-bottom: 2px;
}
.arrow-line {
  width: 100%;
  height: 1px;
  background: #ddd;
  position: relative;
}
.arrow-line::after {
  content: '';
  position: absolute;
  right: 0;
  top: -3px;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-left: 6px solid #ddd;
}

.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #aaa;
  font-size: 13px;
}
</style>