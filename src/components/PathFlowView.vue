<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore'; 
import { storeToRefs } from 'pinia';
import { 
  ElCollapse, ElCollapseItem, ElTag, ElEmpty, ElTooltip, 
  ElDialog, ElButton, ElIcon 
} from 'element-plus';
import { FullScreen, Close } from '@element-plus/icons-vue';

const store = useExplorerStore();
const { selectedSampleId, currentExplanation } = storeToRefs(store);

// --- 状态控制 ---
const dialogVisible = ref(false); // 控制浮动弹窗的显示

// --- 1. 工具函数 ---

// 解析节点字符串 "Type_ID" -> { type, id }
const parseNode = (nodeStr: string) => {
  if (!nodeStr) return { type: 'Unknown', id: '?' };
  const cleanStr = String(nodeStr).replace(/['"]/g, '').trim();
  const parts = cleanStr.split('_');
  if (parts.length >= 2) {
    const id = parts.pop(); 
    const type = parts.join('_'); 
    return { type, id };
  }
  return { type: 'Unknown', id: cleanStr };
};

// 节点颜色映射 (保持一致)
const TYPE_COLORS: Record<string, string> = {
  'InspectionRecord': '#f56c6c',
  'Product': '#e6a23c',
  'Market': '#409eff',
  'Farmer': '#67c23a',
  'Contaminant': '#909399',
  'Unknown': '#333'
};

// --- 2. 核心逻辑: 路径生成与剪枝 (保持不变) ---
const groupedPaths = computed(() => {
  const rawEdges = currentExplanation.value;
  const groups: Record<string, any[]> = {};

  if (!rawEdges || rawEdges.length === 0) return {};

  const adj = new Map<string, any[]>();
  const nodes = new Set<string>();

  rawEdges.forEach(edge => {
    let from = edge.from;
    let to = edge.to;
    let relation = edge.relation;
    let fromLabel = edge.from_label; 
    let toLabel = edge.to_label;
    let weight = edge.weight || 0;

    if (from.startsWith('InspectionRecord') && !to.startsWith('InspectionRecord')) {
      [from, to] = [to, from];
      [fromLabel, toLabel] = [toLabel, fromLabel];
      relation = `(rev) ${relation}`;
    }
    
    if (from === to) return;

    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push({ 
      to, relation, weight, to_label: toLabel, from_label: fromLabel
    });
    
    nodes.add(from);
    nodes.add(to);
  });

  for (const [key, neighbors] of adj.entries()) {
    neighbors.sort((a, b) => b.weight - a.weight);
    adj.set(key, neighbors.slice(0, 1)); 
  }

  const rawPaths: any[] = [];
  const MAX_DEPTH = 4;

  const dfs = (curr: string, path: any[], visited: Set<string>) => {
    if (path.length >= MAX_DEPTH) return;
    
    if (curr.startsWith('InspectionRecord')) {
        const currId = parseNode(curr).id;
        if (selectedSampleId.value && String(currId) !== String(selectedSampleId.value)) {
            return; 
        }
        if (path.length > 0) rawPaths.push([...path]);
        return;
    }
    
    if (visited.has(curr)) return;
    visited.add(curr);

    const neighbors = adj.get(curr);
    if (neighbors) {
      neighbors.forEach(next => {
        if (!visited.has(next.to)) {
          path.push({ 
            from: curr, to: next.to, relation: next.relation, weight: next.weight,
            from_label: next.from_label, to_label: next.to_label
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

  const seenPaths = new Set<string>();
  rawPaths.forEach(chain => {
    if (chain.length === 0) return;
    const signature = chain.map((e:any) => `${e.from}->${e.to}`).join('|');
    if (seenPaths.has(signature)) return;
    seenPaths.add(signature);

    const startNode = chain[0].from;
    const startType = parseNode(startNode).type;
    
    let groupKey = '其他因素';
    if (startType === 'Contaminant') groupKey = '污染物直接关联 (Direct Contaminant)';
    else if (startType === 'Farmer') groupKey = '养殖户溯源 (Farmer Source)';
    else if (startType === 'Market') groupKey = '市场环境因素 (Market Context)';
    else if (startType === 'Product') groupKey = '产品易感性 (Product Risk)';

    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(chain);
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
      <h4>风险归因链路 (Risk Path Analysis)</h4>
      <el-tooltip content="全屏浮动查看" placement="top">
        <el-button link @click="dialogVisible = true" class="float-btn">
          <el-icon :size="16"><FullScreen /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
    
    <div v-if="selectedSampleId && Object.keys(groupedPaths).length > 0" class="content-area">
      <el-collapse v-model="activeNames">
        <template v-for="(paths, groupKey) in groupedPaths" :key="groupKey">
            <el-collapse-item :name="groupKey">
                <template #title>
                    <div class="group-title">
                    <span class="template-text">{{ groupKey }}</span>
                    <el-tag size="small" type="info" effect="plain" round class="count-tag">{{ paths.length }} 条证据</el-tag>
                    </div>
                </template>
                <div class="path-list">
                    <div v-for="(chain, idx) in paths" :key="idx" class="path-row-container">
                        <div class="path-row">
                             <div :class="['node-card', parseNode(chain[0].from).type]">
                                <div class="node-type">{{ parseNode(chain[0].from).type }}</div>
                                <el-tooltip :content="chain[0].from_label" placement="top" :show-after="500">
                                    <div class="node-id">{{ chain[0].from_label }}</div>
                                </el-tooltip>
                             </div>
                             <template v-for="(link, i) in chain" :key="i">
                                <div class="connector">
                                    <div class="relation-label">{{ link.relation }}</div>
                                    <div class="arrow-line" :style="{ height: Math.max(2, link.weight * 5) + 'px' }"></div>
                                    <div class="weight-label">{{ (link.weight * 100).toFixed(0) }}%</div>
                                </div>
                                <div :class="['node-card', parseNode(link.to).type]">
                                    <div class="node-type">{{ parseNode(link.to).type }}</div>
                                    <el-tooltip :content="link.to_label" placement="top" :show-after="500">
                                        <div class="node-id">{{ link.to_label }}</div>
                                    </el-tooltip>
                                </div>
                             </template>
                        </div>
                    </div>
                </div>
            </el-collapse-item>
        </template>
      </el-collapse>
    </div>

    <div v-else class="empty-state">
      <div v-if="!selectedSampleId"><p>请在左侧选择一个样本进行分析</p></div>
      <div v-else><el-empty description="暂无高风险路径" :image-size="60"></el-empty></div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      title="风险归因链路 (详细视图)"
      width="85%"
      top="5vh"
      append-to-body
      class="path-float-dialog"
    >
      <div class="dialog-scroll-wrapper">
         <div v-if="selectedSampleId && Object.keys(groupedPaths).length > 0">
             <el-collapse v-model="activeNames">
                <el-collapse-item v-for="(paths, groupKey) in groupedPaths" :key="groupKey" :name="groupKey">
                    <template #title>
                        <div class="group-title">
                        <span class="template-text">{{ groupKey }}</span>
                        <el-tag size="small" type="success" effect="plain" round class="count-tag">{{ paths.length }} 条证据</el-tag>
                        </div>
                    </template>
                    <div class="path-list is-dialog">
                        <div v-for="(chain, idx) in paths" :key="idx" class="path-row-container">
                            <div class="path-row">
                                <div :class="['node-card', parseNode(chain[0].from).type]">
                                    <div class="node-type">{{ parseNode(chain[0].from).type }}</div>
                                    <el-tooltip :content="chain[0].from_label" placement="top">
                                        <div class="node-id">{{ chain[0].from_label }}</div>
                                    </el-tooltip>
                                </div>
                                <template v-for="(link, i) in chain" :key="i">
                                    <div class="connector is-large">
                                        <div class="relation-label">{{ link.relation }}</div>
                                        <div class="arrow-line" :style="{ height: Math.max(3, link.weight * 6) + 'px' }"></div>
                                        <div class="weight-label">{{ (link.weight * 100).toFixed(0) }}%</div>
                                    </div>
                                    <div :class="['node-card', parseNode(link.to).type]">
                                        <div class="node-type">{{ parseNode(link.to).type }}</div>
                                        <el-tooltip :content="link.to_label" placement="top">
                                            <div class="node-id">{{ link.to_label }}</div>
                                        </el-tooltip>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>
                </el-collapse-item>
            </el-collapse>
         </div>
         <el-empty v-else description="暂无数据"></el-empty>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 基础容器 */
.path-flow-wrapper {
  background-color: #ffffff;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', Arial, sans-serif;
}

.header-bar {
  padding: 8px 16px;
  border-bottom: 1px solid #f0f0f0;
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-bar h4 { 
  font-size: 14px; color: #1f2937; font-weight: 600; margin: 0; 
}
.float-btn {
  color: #909399; transition: color 0.2s;
}
.float-btn:hover { color: #409eff; }

.content-area {
  padding: 12px;
  overflow-y: auto;
  flex: 1;
}

/* 弹窗特有样式 */
.dialog-scroll-wrapper {
  max-height: 70vh;
  overflow-y: auto;
  padding: 10px;
}
.path-list.is-dialog .node-card {
  min-width: 120px; /* 弹窗里卡片大一点 */
  padding: 12px 16px;
}
.path-list.is-dialog .connector.is-large {
  min-width: 80px; /* 弹窗里连线长一点 */
}

/* 通用样式 (保持原样) */
:deep(.el-collapse) { border: none; }
:deep(.el-collapse-item) { margin-bottom: 10px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
:deep(.el-collapse-item__header) { background-color: #f9fafb; padding: 0 12px; height: 40px; line-height: 40px; border-bottom: 1px solid #e5e7eb; }
:deep(.el-collapse-item__content) { padding: 0; }

.group-title { display: flex; align-items: center; width: 100%; font-size: 13px; font-weight: 600; color: #374151; }
.template-text { flex: 1; }
.count-tag { margin-left: 8px; }

.path-list { background: #fff; }
.path-row-container { padding: 16px 12px; border-bottom: 1px dashed #f3f4f6; overflow-x: auto; }
.path-row-container:last-child { border-bottom: none; }
.path-row { display: flex; align-items: center; min-width: max-content; }

.node-card { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 100px; max-width: 160px; padding: 8px 12px; border-radius: 6px; border: 1px solid; background-color: #fff; transition: all 0.2s; position: relative; }
.node-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); z-index: 10; }
.node-type { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; opacity: 0.7; letter-spacing: 0.5px; }
.node-id { font-size: 12px; font-weight: 600; color: #1f2937; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }

.node-card.InspectionRecord { background: #fef2f2; border-color: #fee2e2; color: #b91c1c; }
.node-card.Product { background: #fff7ed; border-color: #ffedd5; color: #c2410c; }
.node-card.Market { background: #eff6ff; border-color: #dbeafe; color: #1d4ed8; }
.node-card.Farmer { background: #f0fdf4; border-color: #dcfce7; color: #15803d; }
.node-card.Contaminant { background: #f3f4f6; border-color: #e5e7eb; color: #4b5563; }

.connector { display: flex; flex-direction: column; align-items: center; margin: 0 12px; min-width: 60px; position: relative; }
.relation-label { font-size: 10px; color: #9ca3af; margin-bottom: 2px; }
.arrow-line { width: 100%; background: #d1d5db; position: relative; transition: height 0.3s; }
.arrow-line::after { content: ''; position: absolute; right: -6px; top: 50%; transform: translateY(-50%); border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 6px solid #d1d5db; }
.weight-label { font-size: 10px; color: #6b7280; margin-top: 2px; font-weight: 500; }

.empty-state { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #9ca3af; font-size: 14px; }
</style>