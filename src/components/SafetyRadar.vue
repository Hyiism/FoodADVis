<!-- 保留，稳定版======================================================== -->
<!-- <script setup lang="ts">
import { computed, ref } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import { ElProgress, ElDivider, ElTag, ElEmpty, ElIcon, ElButton } from 'element-plus';
import { User, Shop, Goods, Warning, CircleCheck, ArrowRight, Back, DataAnalysis } from '@element-plus/icons-vue';

const store = useExplorerStore();
const { selectedSampleId, samples, context } = storeToRefs(store);

// --- 视图状态管理 ---
// 'diagnosis': 单样本诊断
// 'overview': 全局榜单
// 'detail': 实体详情 (新增，替代 Drawer)
const currentView = ref<'diagnosis' | 'overview' | 'detail'>('diagnosis');

// 之前的 Tab 状态
const listTab = ref<'farmer' | 'market' | 'product'>('farmer');
const filterType = ref<'safe' | 'risk'>('safe');

// 选中的实体详情数据
const selectedEntityData = ref<any>(null);

// ==========================================
// 逻辑 A: 微观诊断 (Micro Diagnosis)
// ==========================================
const analysis = computed(() => {
  const idStr = String(selectedSampleId.value);
  const meta = samples.value?.find(s => String(s.id) === idStr);
  const ctx = context.value?.[idStr] || {};
  
  const farmerName = ctx.farmers?.[0] || 'Unknown Producer';
  const marketName = ctx.markets?.[0] || 'Unknown Market';
  const productName = ctx.products?.[0] || 'Aquatic Product';

  const farmerVol = ctx.stats?.farmer_vol || 1;
  const marketVol = ctx.stats?.market_vol || 1;

  return {
    id: idStr,
    probability: ((1 - (meta?.score || 0)) * 100).toFixed(4),
    farmer: { name: farmerName, vol: farmerVol, desc: farmerVol > 1000 ? 'High Frequency' : 'Low Frequency' },
    market: { name: marketName, vol: marketVol, desc: marketVol > 5000 ? 'Major Hub' : 'Local Hub' },
    product: { name: productName, desc: 'Baseline Risk Class' } // 补全产品描述
  };
});

// ==========================================
// 逻辑 B: 宏观情报 (Global Intelligence)
// ==========================================
const globalEntities = computed(() => {
  const stats = { farmers: new Map(), markets: new Map(), products: new Map() };
  const getOrCreate = (map: Map<any, any>, key: string) => {
    if (!map.has(key)) map.set(key, { name: key, safeCount: 0, riskCount: 0 });
    return map.get(key);
  };

  if (!samples.value || !context.value) return { safe: [], risk: [] };

  samples.value.forEach(s => {
    const ctx = context.value![String(s.id)];
    if (!ctx) return;
    const isRisky = s.riskLevel === '高风险' || s.riskLevel === '中风险';
    const tally = (map: Map<any, any>, name: string) => {
      const entry = getOrCreate(map, name);
      if (isRisky) entry.riskCount++; else entry.safeCount++;
    };
    if (ctx.farmers?.[0]) tally(stats.farmers, ctx.farmers[0]);
    if (ctx.markets?.[0]) tally(stats.markets, ctx.markets[0]);
    if (ctx.products?.[0]) tally(stats.products, ctx.products[0]);
  });

  let targetMap = listTab.value === 'farmer' ? stats.farmers : (listTab.value === 'market' ? stats.markets : stats.products);
  const allItems = Array.from(targetMap.values());

  const safeList = allItems.filter(i => i.riskCount === 0 && i.safeCount > 0).sort((a, b) => b.safeCount - a.safeCount).slice(0, 50);
  const riskList = allItems.filter(i => i.riskCount > 0).sort((a, b) => b.riskCount - a.riskCount).slice(0, 50);

  return { safe: safeList, risk: riskList };
});

const currentDisplayList = computed(() => filterType.value === 'safe' ? globalEntities.value.safe : globalEntities.value.risk);
const maxBarValue = computed(() => {
  const list = currentDisplayList.value;
  return list.length > 0 ? (filterType.value === 'safe' ? list[0].safeCount : list[0].riskCount) : 1;
});

// ==========================================
// 逻辑 C: 实体下钻 (Drill-Down Logic)
// ==========================================
const goToDetail = (item: any) => {
  const entityName = item.name;
  const entityType = listTab.value;
  
  // 1. 找出关联样本
  const relatedSamples: any[] = [];
  samples.value.forEach(s => {
    const ctx = context.value![String(s.id)];
    if (!ctx) return;
    let match = false;
    if (entityType === 'farmer' && ctx.farmers?.includes(entityName)) match = true;
    if (entityType === 'market' && ctx.markets?.includes(entityName)) match = true;
    if (entityType === 'product' && ctx.products?.includes(entityName)) match = true;
    if (match) relatedSamples.push({ sample: s, ctx });
  });

  // 2. 真实计算风险指纹 (Risk Fingerprint)
  const riskFingerprintMap = new Map<string, number>();
  relatedSamples.forEach(entry => {
    if (entry.sample.riskLevel !== '低风险') {
       entry.ctx.contaminants?.forEach((c: string) => riskFingerprintMap.set(c, (riskFingerprintMap.get(c) || 0) + 1));
    }
  });
  
  const riskyCount = relatedSamples.filter(r => r.sample.riskLevel !== '低风险').length;
  // 转为条形图数据 (用条形图比雷达图更清晰)
  let riskStats = Array.from(riskFingerprintMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({
      name: name.replace('Contaminant_', '').replace('Contam_', ''), // 简化名称
      count,
      percent: riskyCount > 0 ? (count / riskyCount) * 100 : 0
    }));
  
  // 如果是白名单实体 (无风险记录)，显示"无异常"
  if (riskStats.length === 0) {
      riskStats = []; 
  }

  // 3. 真实计算交易网络
  const networkMap = new Map<string, number>();
  const targetKey = entityType === 'farmer' ? 'markets' : 'farmers'; // 简单处理：只看上下游
  relatedSamples.forEach(entry => {
    entry.ctx[targetKey]?.forEach((t: string) => networkMap.set(t, (networkMap.get(t) || 0) + 1));
  });

  const relations = Array.from(networkMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10) // 只看 Top 10 伙伴
    .map(([target, count]) => ({ target, count }));

  selectedEntityData.value = {
    name: entityName,
    type: entityType,
    totalCount: relatedSamples.length,
    riskCount: riskyCount,
    riskStats, // 传递给条形图
    relations
  };

  currentView.value = 'detail'; // 切换视图
};

const goBack = () => {
  currentView.value = 'overview';
};

const tabOptions = [
  { label: 'Producers', value: 'farmer', icon: User },
  { label: 'Markets', value: 'market', icon: Shop },
  { label: 'Products', value: 'product', icon: Goods },
];
</script>

<template>
  <div class="panel-container">
    
    <div class="view-switch" v-if="currentView !== 'detail'">
      <div class="switch-btn" :class="{ active: currentView === 'diagnosis' }" @click="currentView = 'diagnosis'">
        DIAGNOSIS
      </div>
      <div class="switch-btn" :class="{ active: currentView === 'overview' }" @click="currentView = 'overview'">
        GLOBAL INTELLIGENCE
      </div>
    </div>

    <div v-if="currentView === 'diagnosis'" class="content-scroll">
      <div class="panel-header">
        <div class="header-main">
          <div class="title">INFERENCE DIAGNOSTICS</div>
          <div class="sample-id">ID: {{ analysis.id }}</div>
        </div>
        <div class="header-status"><span class="status-badge">NEGATIVE</span></div>
      </div>

      <div class="prob-section">
        <div class="prob-label"><span>Safety Confidence $P(y=0)$</span><span class="prob-val">{{ analysis.probability }}%</span></div>
        <el-progress :percentage="Number(analysis.probability)" :show-text="false" :stroke-width="6" color="#13ce66" />
      </div>

      <el-divider border-style="dashed" content-position="center" class="section-div">GRAPH STATISTICS</el-divider>

      <div class="profile-card">
        <div class="profile-header">
          <span class="role-label">PRODUCER NODE</span>
          <span class="entity-name" :title="analysis.farmer.name">{{ analysis.farmer.name }}</span>
        </div>
        <div class="stat-grid">
            <div class="stat-item"><div class="stat-val">{{ analysis.farmer.vol }}</div><div class="stat-key">Graph Degree</div></div>
            <div class="stat-item"><div class="stat-val" style="font-size:11px">{{ analysis.farmer.desc }}</div><div class="stat-key">Centrality</div></div>
        </div>
      </div>

      <div class="profile-card">
        <div class="profile-header">
          <span class="role-label">MARKET NODE</span>
          <span class="entity-name" :title="analysis.market.name">{{ analysis.market.name }}</span>
        </div>
        <div class="stat-grid">
            <div class="stat-item"><div class="stat-val">{{ analysis.market.vol }}</div><div class="stat-key">Graph Degree</div></div>
            <div class="stat-item"><div class="stat-val" style="font-size:11px">{{ analysis.market.desc }}</div><div class="stat-key">Hub Scale</div></div>
        </div>
      </div>

      <div class="profile-card">
        <div class="profile-header">
          <span class="role-label">PRODUCT CLASS</span>
          <span class="entity-name">{{ analysis.product.name }}</span>
        </div>
        <div class="stat-grid">
             <div class="stat-item"><div class="stat-val">Baseline</div><div class="stat-key">Risk Class</div></div>
             <div class="stat-item"><div class="stat-val" style="font-size:11px">{{ analysis.product.desc }}</div><div class="stat-key">Description</div></div>
        </div>
      </div>
    </div>

    <div v-else-if="currentView === 'overview'" class="content-scroll">
      <div class="whitelist-controls">
        <div v-for="opt in tabOptions" :key="opt.value" 
            class="tab-btn" :class="{ active: listTab === opt.value }"
            @click="listTab = opt.value">
          <component :is="opt.icon" class="tab-icon"/> {{ opt.label }}
        </div>
      </div>

      <div class="risk-toggle-wrapper">
        <div class="risk-btn safe" :class="{ active: filterType === 'safe' }" @click="filterType = 'safe'">
            <el-icon><CircleCheck /></el-icon> Compliant
        </div>
        <div class="risk-btn risk" :class="{ active: filterType === 'risk' }" @click="filterType = 'risk'">
            <el-icon><Warning /></el-icon> Flagged
        </div>
      </div>

      <div class="list-header">
        <span class="lh-name">ENTITY NAME</span>
        <span class="lh-val">{{ filterType === 'safe' ? 'SAFE VOLUME' : 'RISK EVENTS' }}</span>
      </div>

      <div class="entity-list">
        <div v-for="(item, idx) in currentDisplayList" :key="idx" 
             class="list-row clickable" @click="goToDetail(item)">
          <div class="row-rank">{{ idx + 1 }}</div>
          <div class="row-content">
            <div class="row-top">
                <div class="row-name" :title="item.name">{{ item.name }}</div>
                <div class="row-right">
                    <div class="row-count mono" :class="{ 'text-red': filterType === 'risk' }">
                        {{ filterType === 'safe' ? item.safeCount : item.riskCount }}
                        <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                    </div>
                </div>
            </div>
            <div class="row-bar-bg">
                <div class="row-bar-fill" 
                     :class="{ 'bg-green': filterType === 'safe', 'bg-red': filterType === 'risk' }"
                     :style="{ width: ((filterType === 'safe' ? item.safeCount : item.riskCount) / maxBarValue * 100) + '%' }">
                </div>
            </div>
          </div>
        </div>
        <el-empty v-if="currentDisplayList.length === 0" :image-size="60" description="No data found" />
      </div>
    </div>

    <div v-else-if="currentView === 'detail'" class="content-scroll detail-view">
        
        <div class="detail-nav">
            <el-button link @click="goBack" class="back-btn">
                <el-icon><Back /></el-icon> Back to List
            </el-button>
        </div>

        <div class="detail-header-card">
            <div class="dh-title">{{ selectedEntityData.name }}</div>
            <div class="dh-badges">
                <el-tag size="small" :type="filterType === 'safe' ? 'success' : 'danger'" effect="dark">
                    {{ filterType === 'safe' ? 'VERIFIED SAFE' : 'RISK ENTITY' }}
                </el-tag>
                <span class="dh-count">Total Samples: {{ selectedEntityData.totalCount }}</span>
            </div>
        </div>

        <el-divider class="section-div">ANALYSIS REPORT</el-divider>

        <div class="detail-section">
            <div class="ds-title">
                <el-icon><DataAnalysis /></el-icon> RISK FINGERPRINT
            </div>
            
            <div v-if="selectedEntityData.riskStats.length > 0" class="risk-bars">
                <div v-for="stat in selectedEntityData.riskStats" :key="stat.name" class="rb-row">
                    <div class="rb-info">
                        <span class="rb-name">{{ stat.name }}</span>
                        <span class="rb-val">{{ stat.count }} events</span>
                    </div>
                    <div class="rb-bg">
                        <div class="rb-fill" :style="{ width: stat.percent + '%' }"></div>
                    </div>
                </div>
            </div>
            <div v-else class="empty-state-box">
                <el-icon class="success-icon"><CircleCheck /></el-icon>
                <span>No historical risk events detected.</span>
            </div>
        </div>

        <div class="detail-section">
            <div class="ds-title">
                <el-icon><Shop /></el-icon> TRADING NETWORK
            </div>
            <div class="network-list">
                <div v-for="(rel, i) in selectedEntityData.relations" :key="i" class="net-row">
                    <div class="net-name" :title="rel.target">{{ rel.target }}</div>
                    <div class="net-val">{{ rel.count }}</div>
                </div>
                <el-empty v-if="selectedEntityData.relations.length === 0" :image-size="40" description="No data" />
            </div>
        </div>

    </div>

  </div>
</template>

<style scoped>
/* 基础容器 */
.panel-container { height: 100%; display: flex; flex-direction: column; background: #fff; border: 1px solid #dcdfe6; font-family: 'Roboto', 'Helvetica Neue', Arial, sans-serif; color: #303133; box-sizing: border-box; overflow: hidden; }

/* 视图切换 */
.view-switch { display: flex; border-bottom: 1px solid #eee; background: #fcfcfc; flex-shrink: 0; }
.switch-btn { flex: 1; text-align: center; padding: 10px 0; font-size: 11px; font-weight: 700; color: #909399; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
.switch-btn:hover { background: #f5f7fa; color: #606266; }
.switch-btn.active { color: #13ce66; border-bottom-color: #13ce66; background: #fff; }

.content-scroll { flex: 1; overflow-y: auto; padding: 16px; }

/* 诊断视图样式 (复用) */
.panel-header { display: flex; justify-content: space-between; margin-bottom: 16px; }
.title { font-size: 11px; font-weight: 800; color: #909399; }
.sample-id { font-family: Consolas, monospace; font-size: 13px; font-weight: 700; }
.status-badge { border: 1px solid #13ce66; color: #13ce66; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(19, 206, 102, 0.05); }
.prob-section { margin-bottom: 10px; }
.prob-label { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
.prob-val { font-weight: 700; color: #13ce66; font-family: Consolas; }
.section-div { margin: 16px 0; }
:deep(.el-divider__text) { font-size: 10px; color: #c0c4cc; letter-spacing: 1px; }

.profile-card { background: #f8f9fa; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
.profile-header { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid #ebeef5; padding-bottom: 4px; }
.role-label { font-size: 9px; font-weight: 700; color: #909399; }
.entity-name { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
.stat-grid { display: flex; justify-content: space-between; }
.stat-item { flex: 1; }
.stat-val { font-size: 13px; font-weight: 700; font-family: Consolas; }
.stat-key { font-size: 9px; color: #909399; }

/* 榜单样式 */
.whitelist-controls { display: flex; gap: 8px; margin-bottom: 12px; background: #f0f2f5; padding: 4px; border-radius: 6px; }
.tab-btn { flex: 1; text-align: center; padding: 6px; font-size: 10px; font-weight: 600; color: #606266; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; gap: 4px; }
.tab-btn.active { background: #fff; color: #333; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.tab-icon { width: 12px; height: 12px; }

.risk-toggle-wrapper { display: flex; gap: 10px; margin-bottom: 16px; }
.risk-btn { flex: 1; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; font-size: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; opacity: 0.6; transition: all 0.2s; }
.risk-btn.safe.active { background: #f0f9eb; border-color: #67c23a; color: #67c23a; opacity: 1; }
.risk-btn.risk.active { background: #fef0f0; border-color: #f56c6c; color: #f56c6c; opacity: 1; }

.list-header { display: flex; justify-content: space-between; font-size: 9px; font-weight: 700; color: #909399; padding: 0 4px 6px 24px; border-bottom: 1px solid #eee; }
.entity-list { display: flex; flex-direction: column; gap: 8px; }
.list-row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px dashed #f5f5f5; cursor: pointer; transition: background 0.2s; }
.list-row:hover { background: #f5f7fa; }
.row-rank { width: 20px; font-size: 10px; color: #c0c4cc; font-weight: 700; }
.row-content { flex: 1; }
.row-top { display: flex; justify-content: space-between; margin-bottom: 4px; }
.row-name { font-size: 11px; font-weight: 600; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }
.row-right { display: flex; align-items: center; gap: 6px; }
.row-count { font-size: 11px; font-weight: 700; color: #13ce66; }
.row-count.text-red { color: #f56c6c; }
.arrow-icon { font-size: 10px; color: #c0c4cc; }
.row-bar-bg { height: 4px; background: #f0f0f0; border-radius: 2px; width: 100%; }
.row-bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
.bg-green { background: #13ce66; }
.bg-red { background: #f56c6c; }

/* 🌟 Detail View Styles (in-panel) */
.detail-view { background: #fff; }
.detail-nav { margin-bottom: 10px; }
.back-btn { font-size: 12px; color: #606266; }
.detail-header-card { margin-bottom: 16px; }
.dh-title { font-size: 16px; font-weight: 800; color: #333; margin-bottom: 8px; line-height: 1.3; }
.dh-badges { display: flex; align-items: center; gap: 10px; }
.dh-count { font-size: 11px; color: #999; }

.detail-section { margin-bottom: 24px; }
.ds-title { font-size: 11px; font-weight: 700; color: #909399; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }

/* Risk Fingerprint Bars */
.risk-bars { display: flex; flex-direction: column; gap: 8px; }
.rb-row { font-size: 11px; }
.rb-info { display: flex; justify-content: space-between; margin-bottom: 4px; }
.rb-name { font-weight: 600; color: #555; }
.rb-val { color: #999; font-size: 10px; }
.rb-bg { height: 6px; background: #f0f0f0; border-radius: 3px; }
.rb-fill { height: 100%; background: #f56c6c; border-radius: 3px; }

.empty-state-box { background: #f0f9eb; border: 1px solid #e1f3d8; color: #67c23a; padding: 15px; border-radius: 6px; display: flex; align-items: center; gap: 10px; font-size: 12px; }
.success-icon { font-size: 16px; }

/* Network List */
.network-list { display: flex; flex-direction: column; gap: 6px; }
.net-row { display: flex; justify-content: space-between; padding: 8px; background: #f8f9fa; border-radius: 4px; font-size: 11px; }
.net-name { font-weight: 500; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.net-val { font-weight: 700; color: #666; }

.mono { font-family: 'Consolas', monospace; }
</style> -->



<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import { ElProgress, ElDivider, ElTag, ElEmpty, ElIcon, ElButton } from 'element-plus';
import { User, Shop, Goods, Warning, CircleCheck, ArrowRight, Back, DataAnalysis } from '@element-plus/icons-vue';

const store = useExplorerStore();
const { selectedSampleId, samples, context, currentAnalysisMode } = storeToRefs(store);

// --- 视图状态管理 ---
const currentView = ref<'diagnosis' | 'overview' | 'detail'>('overview');
const listTab = ref<'farmer' | 'market' | 'product'>('farmer');
const filterType = ref<'safe' | 'risk'>('safe');
const selectedEntityData = ref<any>(null);

// 监听模式切换
watch(currentAnalysisMode, (newMode) => {
  if (newMode === 'safe') {
    filterType.value = 'safe';
  } else {
    filterType.value = 'risk';
  }
}, { immediate: true });

// 监听样本选中
watch(selectedSampleId, (newId) => {
  if (newId) {
    currentView.value = 'diagnosis';
  } else {
    currentView.value = 'overview';
  }
}, { immediate: true });

// ==========================================
// 逻辑 A: 微观诊断 (保持不变，用于单样本显示)
// ==========================================
const analysis = computed(() => {
  if (!selectedSampleId.value) {
    return {
      id: '---', probability: '0',
      farmer: { name: '-', vol: 0, desc: '-' },
      market: { name: '-', vol: 0, desc: '-' },
      product: { name: '-', desc: '-' }
    };
  }

  const idStr = String(selectedSampleId.value);
  const meta = samples.value?.find(s => String(s.id) === idStr);
  const ctx = context.value?.[idStr] || {};
  
  // 这里取 [0] 是为了显示主节点，没问题
  const farmerName = ctx.farmers?.[0] || 'Unknown Producer';
  const marketName = ctx.markets?.[0] || 'Unknown Market';
  const productName = ctx.products?.[0] || 'Aquatic Product';

  const farmerVol = ctx.stats?.farmer_vol || 1;
  const marketVol = ctx.stats?.market_vol || 1;

  return {
    id: idStr,
    probability: ((1 - (meta?.score || 0)) * 100).toFixed(4),
    farmer: { name: farmerName, vol: farmerVol, desc: farmerVol > 1000 ? 'High Frequency' : 'Low Frequency' },
    market: { name: marketName, vol: marketVol, desc: marketVol > 5000 ? 'Major Hub' : 'Local Hub' },
    product: { name: productName, desc: 'Baseline Risk Class' }
  };
});

// ==========================================
// 逻辑 B: 宏观情报 (核心修复：全量遍历统计)
// ==========================================
const globalEntities = computed(() => {
  const stats = { farmers: new Map(), markets: new Map(), products: new Map() };
  
  // 辅助函数：获取或初始化统计对象
  const getOrCreate = (map: Map<any, any>, key: string) => {
    if (!map.has(key)) map.set(key, { name: key, safeCount: 0, riskCount: 0 });
    return map.get(key);
  };

  if (!samples.value || !context.value) return { safe: [], risk: [] };

  samples.value.forEach(s => {
    const ctx = context.value![String(s.id)];
    if (!ctx) return;
    
    const isRisky = s.riskLevel === '高风险' || s.riskLevel === '中风险';
    
    // 计数函数
    const tally = (map: Map<any, any>, name: string) => {
      if (!name) return;
      const entry = getOrCreate(map, name);
      if (isRisky) entry.riskCount++; else entry.safeCount++;
    };
    
    // [核心修复] 以前只统计 [0]，现在遍历整个数组
    // 这样如果一个样本经过3个市场，这3个市场的统计数都会增加，数据就对得上了
    ctx.farmers?.forEach(f => tally(stats.farmers, String(f)));
    ctx.markets?.forEach(m => tally(stats.markets, String(m)));
    ctx.products?.forEach(p => tally(stats.products, String(p)));
  });

  // 决定当前 Tab 显示哪类数据
  let targetMap = listTab.value === 'farmer' ? stats.farmers : (listTab.value === 'market' ? stats.markets : stats.products);
  const allItems = Array.from(targetMap.values());

  // 排序与切片
  const safeList = allItems
    .filter(i => i.safeCount > 0) // 这里放宽条件，只要有安全记录就显示，按安全量排序
    .sort((a, b) => b.safeCount - a.safeCount)
    .slice(0, 50);
    
  const riskList = allItems
    .filter(i => i.riskCount > 0)
    .sort((a, b) => b.riskCount - a.riskCount)
    .slice(0, 50);

  return { safe: safeList, risk: riskList };
});

const currentDisplayList = computed(() => filterType.value === 'safe' ? globalEntities.value.safe : globalEntities.value.risk);

const maxBarValue = computed(() => {
  const list = currentDisplayList.value;
  // 避免除以 0
  if (list.length === 0) return 100;
  return filterType.value === 'safe' ? list[0].safeCount : list[0].riskCount;
});

// ==========================================
// 逻辑 C: 实体下钻 (保持逻辑一致性)
// ==========================================
const goToDetail = (item: any) => {
  const entityName = item.name;
  const entityType = listTab.value;
  
  const relatedSamples: any[] = [];
  
  samples.value.forEach(s => {
    const ctx = context.value![String(s.id)];
    if (!ctx) return;
    let match = false;
    
    // 这里使用的是 includes，逻辑是正确的
    // 配合上面修复的 globalEntities，现在 List 和 Detail 的数量应该一致了
    if (entityType === 'farmer' && ctx.farmers?.map(String).includes(entityName)) match = true;
    if (entityType === 'market' && ctx.markets?.map(String).includes(entityName)) match = true;
    if (entityType === 'product' && ctx.products?.map(String).includes(entityName)) match = true;
    
    if (match) relatedSamples.push({ sample: s, ctx });
  });

  // 1. 风险指纹
  const riskFingerprintMap = new Map<string, number>();
  let riskyCount = 0;
  
  relatedSamples.forEach(entry => {
    if (entry.sample.riskLevel !== '低风险') {
       riskyCount++;
       entry.ctx.contaminants?.forEach((c: string) => riskFingerprintMap.set(c, (riskFingerprintMap.get(c) || 0) + 1));
    }
  });
  
  let riskStats = Array.from(riskFingerprintMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({
      name: name.replace('Contaminant_', '').replace('Contam_', ''),
      count,
      percent: riskyCount > 0 ? (count / riskyCount) * 100 : 0
    }));
  
  // 2. 交易网络
  const networkMap = new Map<string, number>();
  // 简单的上下游逻辑：如果是养殖户，看他卖给哪些市场；如果是市场，看他从哪些养殖户进货
  const targetKey = entityType === 'farmer' ? 'markets' : 'farmers'; 
  
  relatedSamples.forEach(entry => {
    entry.ctx[targetKey]?.forEach((t: string) => networkMap.set(t, (networkMap.get(t) || 0) + 1));
  });

  const relations = Array.from(networkMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([target, count]) => ({ target, count }));

  selectedEntityData.value = {
    name: entityName,
    type: entityType,
    totalCount: relatedSamples.length, // 总关联数
    riskCount: riskyCount,             // 其中风险数
    riskStats,
    relations
  };

  currentView.value = 'detail';
};

const goBack = () => { currentView.value = 'overview'; };

const tabOptions = [
  { label: 'Producers', value: 'farmer', icon: User },
  { label: 'Markets', value: 'market', icon: Shop },
  { label: 'Products', value: 'product', icon: Goods },
];
</script>

<template>
  <div class="panel-container">
    
    <div class="view-switch" v-if="currentView !== 'detail'">
      <div class="switch-btn" 
           :class="{ active: currentView === 'diagnosis', disabled: !selectedSampleId }" 
           @click="selectedSampleId && (currentView = 'diagnosis')">
        DIAGNOSIS（微观诊断）
      </div>
      <div class="switch-btn" :class="{ active: currentView === 'overview' }" @click="currentView = 'overview'">
        GLOBAL INTELLIGENCE（宏观情报）
      </div>
    </div>

    <div v-if="currentView === 'diagnosis'" class="content-scroll">
      <div class="panel-header">
        <div class="header-main">
          <div class="title">INFERENCE DIAGNOSTICS</div>
          <div class="sample-id">ID: {{ analysis.id }}</div>
        </div>
        <div class="header-status"><span class="status-badge">NEGATIVE</span></div>
      </div>

      <div class="prob-section">
        <div class="prob-label"><span>Safety Confidence</span><span class="prob-val">{{ analysis.probability }}%</span></div>
        <el-progress :percentage="Number(analysis.probability)" :show-text="false" :stroke-width="6" color="#13ce66" />
      </div>

      <el-divider border-style="dashed" content-position="center" class="section-div">GRAPH STATISTICS</el-divider>

      <div class="profile-card">
        <div class="profile-header">
          <span class="role-label">PRODUCER NODE</span>
          <span class="entity-name" :title="analysis.farmer.name">{{ analysis.farmer.name }}</span>
        </div>
        <div class="stat-grid">
            <div class="stat-item"><div class="stat-val">{{ analysis.farmer.vol }}</div><div class="stat-key">Graph Degree（度）</div></div>
            <div class="stat-item"><div class="stat-val" style="font-size:11px">{{ analysis.farmer.desc }}</div><div class="stat-key"></div></div>
        </div>
      </div>

      <div class="profile-card">
        <div class="profile-header">
          <span class="role-label">MARKET NODE</span>
          <span class="entity-name" :title="analysis.market.name">{{ analysis.market.name }}</span>
        </div>
        <div class="stat-grid">
            <div class="stat-item"><div class="stat-val">{{ analysis.market.vol }}</div><div class="stat-key">Graph Degree（度）</div></div>
            <div class="stat-item"><div class="stat-val" style="font-size:11px">{{ analysis.market.desc }}</div><div class="stat-key"></div></div>
        </div>
      </div>

      <div class="profile-card">
        <div class="profile-header">
          <span class="role-label">PRODUCT CLASS</span>
          <span class="entity-name">{{ analysis.product.name }}</span>
        </div>
        <div class="stat-grid">
             <div class="stat-item"><div class="stat-val">Baseline</div><div class="stat-key">Risk Class</div></div>
             <div class="stat-item"><div class="stat-val" style="font-size:11px">{{ analysis.product.desc }}</div><div class="stat-key"></div></div>
        </div>
      </div>
    </div>

    <div v-else-if="currentView === 'overview'" class="content-scroll">
      <div class="whitelist-controls">
        <div v-for="opt in tabOptions" :key="opt.value" 
            class="tab-btn" :class="{ active: listTab === opt.value }"
            @click="listTab = opt.value">
          <component :is="opt.icon" class="tab-icon"/> {{ opt.label }}
        </div>
      </div>

      <div class="risk-toggle-wrapper">
        <div class="risk-btn safe" :class="{ active: filterType === 'safe' }" @click="filterType = 'safe'">
            <el-icon><CircleCheck /></el-icon> Compliant（合规）
        </div>
        <div class="risk-btn risk" :class="{ active: filterType === 'risk' }" @click="filterType = 'risk'">
            <el-icon><Warning /></el-icon> Flagged（有风险）
        </div>
      </div>

      <div class="list-header">
        <span class="lh-name">ENTITY NAME</span>
        <span class="lh-val">{{ filterType === 'safe' ? 'SAFE VOLUME' : 'RISK EVENTS' }}</span>
      </div>

      <div class="entity-list">
        <div v-for="(item, idx) in currentDisplayList" :key="idx" 
             class="list-row clickable" @click="goToDetail(item)">
          <div class="row-rank">{{ idx + 1 }}</div>
          <div class="row-content">
            <div class="row-top">
                <div class="row-name" :title="item.name">{{ item.name }}</div>
                <div class="row-right">
                    <div class="row-count mono" :class="{ 'text-red': filterType === 'risk' }">
                        {{ filterType === 'safe' ? item.safeCount : item.riskCount }}
                        <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                    </div>
                </div>
            </div>
            <div class="row-bar-bg">
                <div class="row-bar-fill" 
                     :class="{ 'bg-green': filterType === 'safe', 'bg-red': filterType === 'risk' }"
                     :style="{ width: ((filterType === 'safe' ? item.safeCount : item.riskCount) / maxBarValue * 100) + '%' }">
                </div>
            </div>
          </div>
        </div>
        <el-empty v-if="currentDisplayList.length === 0" :image-size="60" description="No data found" />
      </div>
    </div>

    <div v-else-if="currentView === 'detail'" class="content-scroll detail-view">
        
        <div class="detail-nav">
            <el-button link @click="goBack" class="back-btn">
                <el-icon><Back /></el-icon> Back to List
            </el-button>
        </div>

        <div class="detail-header-card">
            <div class="dh-title">{{ selectedEntityData.name }}</div>
            <div class="dh-badges">
                <el-tag size="small" :type="filterType === 'safe' ? 'success' : 'danger'" effect="dark">
                    {{ filterType === 'safe' ? 'VERIFIED SAFE' : 'RISK ENTITY' }}
                </el-tag>
                <span class="dh-count">Total Samples: {{ selectedEntityData.totalCount }}</span>
            </div>
        </div>

        <el-divider class="section-div">ANALYSIS REPORT</el-divider>

        <div class="detail-section">
            <div class="ds-title">
                <el-icon><DataAnalysis /></el-icon> RISK FINGERPRINT
            </div>
            
            <div v-if="selectedEntityData.riskStats.length > 0" class="risk-bars">
                <div v-for="stat in selectedEntityData.riskStats" :key="stat.name" class="rb-row">
                    <div class="rb-info">
                        <span class="rb-name">{{ stat.name }}</span>
                        <span class="rb-val">{{ stat.count }} events</span>
                    </div>
                    <div class="rb-bg">
                        <div class="rb-fill" :style="{ width: stat.percent + '%' }"></div>
                    </div>
                </div>
            </div>
            <div v-else class="empty-state-box">
                <el-icon class="success-icon"><CircleCheck /></el-icon>
                <span>No historical risk events detected.</span>
            </div>
        </div>

        <div class="detail-section">
            <div class="ds-title">
                <el-icon><Shop /></el-icon> TRADING NETWORK
            </div>
            <div class="network-list">
                <div v-for="(rel, i) in selectedEntityData.relations" :key="i" class="net-row">
                    <div class="net-name" :title="rel.target">{{ rel.target }}</div>
                    <div class="net-val">{{ rel.count }}</div>
                </div>
                <el-empty v-if="selectedEntityData.relations.length === 0" :image-size="40" description="No data" />
            </div>
        </div>

    </div>

  </div>
</template>

<style scoped>
/* 基础容器 */
.panel-container { height: 100%; display: flex; flex-direction: column; background: #fff; border: 1px solid #dcdfe6; font-family: 'Roboto', 'Helvetica Neue', Arial, sans-serif; color: #303133; box-sizing: border-box; overflow: hidden; }

/* 视图切换 */
.view-switch { display: flex; border-bottom: 1px solid #eee; background: #fcfcfc; flex-shrink: 0; }
.switch-btn { flex: 1; text-align: center; padding: 10px 0; font-size: 11px; font-weight: 700; color: #909399; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
.switch-btn:hover { background: #f5f7fa; color: #606266; }
.switch-btn.active { color: #13ce66; border-bottom-color: #13ce66; background: #fff; }

/* [新增] 禁用状态样式 */
.switch-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: #f9f9f9;
}
.switch-btn.disabled:hover {
  background: #f9f9f9;
  color: #909399;
}

.content-scroll { flex: 1; overflow-y: auto; padding: 16px; }

/* 诊断视图样式 (复用) */
.panel-header { display: flex; justify-content: space-between; margin-bottom: 16px; }
.title { font-size: 11px; font-weight: 800; color: #909399; }
.sample-id { font-family: Consolas, monospace; font-size: 13px; font-weight: 700; }
.status-badge { border: 1px solid #13ce66; color: #13ce66; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(19, 206, 102, 0.05); }
.prob-section { margin-bottom: 10px; }
.prob-label { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
.prob-val { font-weight: 700; color: #13ce66; font-family: Consolas; }
.section-div { margin: 16px 0; }
:deep(.el-divider__text) { font-size: 10px; color: #c0c4cc; letter-spacing: 1px; }

.profile-card { background: #f8f9fa; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
.profile-header { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid #ebeef5; padding-bottom: 4px; }
.role-label { font-size: 9px; font-weight: 700; color: #909399; }
.entity-name { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
.stat-grid { display: flex; justify-content: space-between; }
.stat-item { flex: 1; }
.stat-val { font-size: 13px; font-weight: 700; font-family: Consolas; }
.stat-key { font-size: 9px; color: #909399; }

/* 榜单样式 */
.whitelist-controls { display: flex; gap: 8px; margin-bottom: 12px; background: #f0f2f5; padding: 4px; border-radius: 6px; }
.tab-btn { flex: 1; text-align: center; padding: 6px; font-size: 10px; font-weight: 600; color: #606266; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; gap: 4px; }
.tab-btn.active { background: #fff; color: #333; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.tab-icon { width: 12px; height: 12px; }

.risk-toggle-wrapper { display: flex; gap: 10px; margin-bottom: 16px; }
.risk-btn { flex: 1; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; font-size: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; opacity: 0.6; transition: all 0.2s; }
.risk-btn.safe.active { background: #f0f9eb; border-color: #67c23a; color: #67c23a; opacity: 1; }
.risk-btn.risk.active { background: #fef0f0; border-color: #f56c6c; color: #f56c6c; opacity: 1; }

.list-header { display: flex; justify-content: space-between; font-size: 9px; font-weight: 700; color: #909399; padding: 0 4px 6px 24px; border-bottom: 1px solid #eee; }
.entity-list { display: flex; flex-direction: column; gap: 8px; }
.list-row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px dashed #f5f5f5; cursor: pointer; transition: background 0.2s; }
.list-row:hover { background: #f5f7fa; }
.row-rank { width: 20px; font-size: 10px; color: #c0c4cc; font-weight: 700; }
.row-content { flex: 1; }
.row-top { display: flex; justify-content: space-between; margin-bottom: 4px; }
.row-name { font-size: 11px; font-weight: 600; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }
.row-right { display: flex; align-items: center; gap: 6px; }
.row-count { font-size: 11px; font-weight: 700; color: #13ce66; }
.row-count.text-red { color: #f56c6c; }
.arrow-icon { font-size: 10px; color: #c0c4cc; }
.row-bar-bg { height: 4px; background: #f0f0f0; border-radius: 2px; width: 100%; }
.row-bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
.bg-green { background: #13ce66; }
.bg-red { background: #f56c6c; }

/* 🌟 Detail View Styles (in-panel) */
.detail-view { background: #fff; }
.detail-nav { margin-bottom: 10px; }
.back-btn { font-size: 12px; color: #606266; }
.detail-header-card { margin-bottom: 16px; }
.dh-title { font-size: 16px; font-weight: 800; color: #333; margin-bottom: 8px; line-height: 1.3; }
.dh-badges { display: flex; align-items: center; gap: 10px; }
.dh-count { font-size: 11px; color: #999; }

.detail-section { margin-bottom: 24px; }
.ds-title { font-size: 11px; font-weight: 700; color: #909399; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }

/* Risk Fingerprint Bars */
.risk-bars { display: flex; flex-direction: column; gap: 8px; }
.rb-row { font-size: 11px; }
.rb-info { display: flex; justify-content: space-between; margin-bottom: 4px; }
.rb-name { font-weight: 600; color: #555; }
.rb-val { color: #999; font-size: 10px; }
.rb-bg { height: 6px; background: #f0f0f0; border-radius: 3px; }
.rb-fill { height: 100%; background: #f56c6c; border-radius: 3px; }

.empty-state-box { background: #f0f9eb; border: 1px solid #e1f3d8; color: #67c23a; padding: 15px; border-radius: 6px; display: flex; align-items: center; gap: 10px; font-size: 12px; }
.success-icon { font-size: 16px; }

/* Network List */
.network-list { display: flex; flex-direction: column; gap: 6px; }
.net-row { display: flex; justify-content: space-between; padding: 8px; background: #f8f9fa; border-radius: 4px; font-size: 11px; }
.net-name { font-weight: 500; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.net-val { font-weight: 700; color: #666; }

.mono { font-family: 'Consolas', monospace; }
</style>