<!-- <script setup lang="ts">
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
</style> -->



<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import { ElCollapse, ElCollapseItem, ElTag, ElEmpty } from 'element-plus';

const store = useExplorerStore();
const { selectedSampleId, currentExplanation } = storeToRefs(store);

// 1. 节点解析器 (仅用于解析类型 Type，用于决定颜色)
const parseNode = (nodeStr: string) => {
  if (!nodeStr) return { type: 'Unknown', id: '?' };
  const cleanStr = String(nodeStr).replace(/['"]/g, '').trim();
  const match = cleanStr.match(/^([a-zA-Z]+)[_\[](\d+)\]?$/);
  if (match) return { type: match[1], id: match[2] };
  const parts = cleanStr.split('_');
  if (parts.length >= 2) return { type: parts[0], id: parts[1] };
  return { type: 'Unknown', id: cleanStr };
};

const TYPE_COLORS: Record<string, string> = {
  'InspectionRecord': '#f56c6c',
  'Product': '#e6a23c',
  'Market': '#409eff',
  'Farmer': '#67c23a',
  'Contaminant': '#909399',
  'Unknown': '#333'
};

// 2. 路径处理逻辑 (保持之前的高级去重版)
const groupedPaths = computed(() => {
  const rawEdges = currentExplanation.value;
  const groups: Record<string, any[]> = {};

  if (!rawEdges || rawEdges.length === 0) return {};

  const adj = new Map<string, any[]>();
  const nodes = new Set<string>();
  const uniqueEdges = new Set<string>();

  rawEdges.forEach(edge => {
    let from = edge.from;
    let to = edge.to;
    let relation = edge.relation;
    // 保留原始 Label 数据 (关键!)
    let fromLabel = edge.from_label; 
    let toLabel = edge.to_label;

    // 强制流向修正
    if (from.startsWith('InspectionRecord') && !to.startsWith('InspectionRecord')) {
      [from, to] = [to, from];
      [fromLabel, toLabel] = [toLabel, fromLabel]; // Label 也要换
      relation = `(rev) ${relation}`;
    }
    if (from === to) return;

    const edgeSig = `${from}|${to}`;
    if (uniqueEdges.has(edgeSig)) return;
    uniqueEdges.add(edgeSig);

    if (!adj.has(from)) adj.set(from, []);
    // 将 label 信息存入邻接表
    adj.get(from)!.push({ 
      to, 
      relation, 
      weight: edge.weight,
      to_label: toLabel // 存入 to_label
    });
    
    // 还需要一种方式获取起点的 label，我们用一个 Map 存一下
    // (稍微有点 tricky，因为 DFS 时只拿到了 from 的 ID)
    // 这里简单处理：在 DFS 结果里补全
    
    nodes.add(from);
    nodes.add(to);
  });

  // 辅助 Map：ID -> Label
  const labelMap = new Map<string, string>();
  rawEdges.forEach(e => {
    if (e.from_label) labelMap.set(e.from, e.from_label);
    if (e.to_label) labelMap.set(e.to, e.to_label);
  });

  // DFS
  const rawPaths: any[] = [];
  const MAX_DEPTH = 6;

  const dfs = (curr: string, path: any[], visited: Set<string>) => {
    if (path.length >= MAX_DEPTH) return;
    if (curr.startsWith('InspectionRecord')) {
      if (path.length > 0) rawPaths.push([...path]);
      return;
    }
    if (visited.has(curr)) return;
    visited.add(curr);

    const neighbors = adj.get(curr);
    if (neighbors) {
      neighbors.forEach(next => {
        if (!visited.has(next.to)) {
          // 在这里构建路径节点对象
          path.push({ 
            from: curr, 
            to: next.to, 
            relation: next.relation, 
            weight: next.weight,
            // [关键] 把名字带上
            from_label: labelMap.get(curr) || curr, 
            to_label: next.to_label || next.to
          });
          dfs(next.to, path, new Set(visited));
          path.pop();
        }
      });
    }
  };

  nodes.forEach(node => {
    if (!node.startsWith('InspectionRecord')) {
      dfs(node, [], new Set());
    }
  });

  // 排序与去重
  rawPaths.sort((a, b) => b.length - a.length);
  const finalPaths: any[] = [];
  const keptPathSignatures: string[] = [];

  rawPaths.forEach(path => {
    const nodeChain = path.map((e: any) => e.from).concat(path[path.length - 1].to).join('->');
    const isSubset = keptPathSignatures.some(longChain => longChain.includes(nodeChain));
    if (!isSubset) {
      finalPaths.push(path);
      keptPathSignatures.push(nodeChain);
    }
  });

  // 分组
  finalPaths.forEach(chain => {
    const types = [];
    types.push(parseNode(chain[0].from).type);
    chain.forEach((link: any) => types.push(parseNode(link.to).type));
    const key = types.join(' → ');
    if (!groups[key]) groups[key] = [];
    groups[key].push(chain);
  });

  return groups;
});

const activeNames = ref<string[]>([]);
watch(groupedPaths, (newVal) => {
  activeNames.value = Object.keys(newVal);
}, { deep: true });
</script>

<template>
  <div class="path-flow-wrapper">
    <div class="header-bar">
      <h4>Risk Path Analysis</h4>
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
              <el-tag size="small" type="info" effect="plain" round class="count-tag">{{ paths.length }}</el-tag>
            </div>
          </template>

          <div class="path-list">
            <div v-for="(chain, idx) in paths" :key="idx" class="path-row-container">
              <div class="path-row">
                
                <div :class="['node-card', parseNode(chain[0].from).type]">
                  <div class="node-type">{{ parseNode(chain[0].from).type }}</div>
                  <div class="node-id" :title="chain[0].from_label">
                    {{ chain[0].from_label }}
                  </div>
                </div>

                <template v-for="(link, i) in chain" :key="i">
                  <div class="connector">
                    <div class="relation-label">{{ link.relation }}</div>
                    <div class="arrow-line"></div>
                    <div class="weight-label" v-if="link.weight">{{ link.weight.toFixed(2) }}</div>
                  </div>
                  
                  <div :class="['node-card', parseNode(link.to).type]">
                    <div class="node-type">{{ parseNode(link.to).type }}</div>
                    <div class="node-id" :title="link.to_label">
                      {{ link.to_label }}
                    </div>
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
          <p>Please select a sample.</p>
      </div>
      <div v-else>
          <el-empty description="No paths found" :image-size="60"></el-empty>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 样式保持不变，直接复用之前的即可 */
.path-flow-wrapper {
  background-color: #ffffff;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Helvetica Neue', Arial, sans-serif;
}

.header-bar {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  background: #fff;
}
.header-bar h4 { 
  font-family: 'Times New Roman', serif; 
  font-size: 14px; 
  color: #1f2937;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0; 
}

.content-area {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

:deep(.el-collapse) { border: none; }
:deep(.el-collapse-item) { 
  margin-bottom: 12px; 
  border: 1px solid #e5e7eb; 
  border-radius: 4px; 
  overflow: hidden;
  background: #fff;
}
:deep(.el-collapse-item__header) {
  background-color: #f9fafb;
  padding: 0 12px;
  height: 36px;
  line-height: 36px;
  border-bottom: 1px solid #e5e7eb;
}
:deep(.el-collapse-item__content) { padding: 0; }
:deep(.el-collapse-item__arrow) { margin: 0 8px 0 0; }

.group-title {
  display: flex;
  align-items: center;
  width: 100%;
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
}
.template-text { flex: 1; font-family: monospace; }
.count-tag { transform: scale(0.9); }

.path-list { background: #fff; }
.path-row-container {
  padding: 12px;
  border-bottom: 1px dashed #f3f4f6;
  overflow-x: auto; 
}
.path-row-container:last-child { border-bottom: none; }

.path-row {
  display: flex;
  align-items: center;
  min-width: max-content; 
}

.node-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 90px;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid; 
  background-color: #fff;
  transition: all 0.2s;
}
.node-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}

.node-type {
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
  margin-bottom: 4px;
  opacity: 0.6;
}
.node-id {
  font-size: 11px;
  font-weight: 600;
  color: #111;
  text-align: center;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 颜色定义 */
.node-card.InspectionRecord { background: #fef2f2; border-color: #fee2e2; color: #ef4444; }
.node-card.Product { background: #fff7ed; border-color: #ffedd5; color: #f97316; }
.node-card.Market { background: #eff6ff; border-color: #dbeafe; color: #3b82f6; }
.node-card.Farmer { background: #f0fdf4; border-color: #dcfce7; color: #22c55e; }
.node-card.Contaminant { background: #f3f4f6; border-color: #e5e7eb; color: #6b7280; }

.connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 8px;
  min-width: 40px;
}
.relation-label {
  font-size: 9px;
  color: #9ca3af;
  font-style: italic;
  margin-bottom: 2px;
}
.arrow-line {
  width: 100%;
  height: 1px;
  background: #d1d5db;
  position: relative;
}
.arrow-line::after {
  content: '';
  position: absolute;
  right: 0;
  top: -3px;
  border-top: 3px solid transparent;
  border-bottom: 3px solid transparent;
  border-left: 5px solid #d1d5db;
}
.weight-label {
  font-size: 8px;
  color: #ccc;
  margin-top: 2px;
  font-family: monospace;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #9ca3af;
  font-size: 13px;
  text-align: center;
  padding: 20px;
}
</style>