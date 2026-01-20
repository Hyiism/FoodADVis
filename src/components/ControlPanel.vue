<!-- <script setup lang="ts">
import { computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import { RefreshLeft, Filter, Search, Close } from '@element-plus/icons-vue';

// 1. Initialize Store
const store = useExplorerStore();
const { filterOptions, selectedSampleId, pivotFilter } = storeToRefs(store);

// 2. Computed Properties for Dynamic Lists
// Determines whether to show the "Risk" list or the "Safe" list based on the store's current mode
const currentDisplayList = computed(() => store.currentDisplayList);
const currentMode = computed(() => store.currentAnalysisMode);

// 3. Action Handlers
function applyFilters() { store.applyFilters(); }
function resetFilters() { store.resetFilters(); }
function onSampleSelect(newId: string | number | null) { store.selectSample(newId); }
function clearPivot() { store.clearPivotFilter(); }

// Static Options
const riskLevelOptions = ['高风险', '中风险', '低风险'];
</script>

<template>
  <div class="control-panel">
    <div class="panel-header">
      <h3>Sample Explorer</h3>
      <span class="subtitle">Inspection Record Analysis</span>
    </div>
    
    <div class="section-main">
      <div class="label-row">
        <span class="section-label">
          {{ currentMode === 'risk' ? 'Top 20 Anomalies' : 'Top 20 Safe Samples' }}
        </span>
        
        <el-tag 
          size="small" 
          :color="currentMode === 'risk' ? '#1f2937' : '#10b981'" 
          effect="dark" 
          style="border:none"
        >
          {{ currentDisplayList.length }} Detected
        </el-tag>
      </div>
      
      <el-select
        :model-value="selectedSampleId"
        @change="onSampleSelect"
        :placeholder="currentMode === 'risk' ? 'Select a high-risk sample...' : 'Select a safe sample...'"
        class="main-selector"
        clearable
        filterable
      >
        <template #prefix><el-icon class="search-icon"><Search /></el-icon></template>
        
        <el-option
          v-for="sample in currentDisplayList"
          :key="sample.id"
          :label="`ID: ${sample.id} (${sample.riskLevel})`" 
          :value="sample.id"
        >
          <div style="display: flex; justify-content: space-between; width: 100%">
            <span style="font-weight: 600; color: #333">ID: {{ sample.id }}</span>
            <span style="color: #8492a6; font-size: 12px; font-family: monospace;">
              Score: {{ sample.score.toFixed(3) }}
            </span>
          </div>
        </el-option>
      </el-select>

      <div class="helper-text">
        <span v-if="currentMode === 'risk'">Select from the highest risk samples to visualize their context path.</span>
        <span v-else style="color: #059669;">Select from the safest samples to analyze normal operational patterns.</span>
      </div>
    </div>

    <div class="divider"></div>

    <div v-if="pivotFilter" class="pivot-section">
      <div class="pivot-label">Active Context Filter</div>
      <div class="pivot-card">
        <div class="pivot-content">
          <span class="pivot-prefix">Focusing on Entity:</span>
          <span class="pivot-value">{{ pivotFilter }}</span>
        </div>
        <el-icon class="pivot-close-icon" @click="clearPivot"><Close /></el-icon>
      </div>
    </div>

    <div class="filter-form">
      <div class="form-title"><el-icon><Filter /></el-icon> Custom Filters</div>
      
      <div class="form-group">
        <label>Risk Level</label>
        <el-select
          v-model="filterOptions.riskLevels"
          multiple
          collapse-tags
          placeholder="All Levels"
          style="width: 100%"
        >
          <el-option v-for="item in riskLevelOptions" :key="item" :label="item" :value="item" />
        </el-select>
      </div>

      <div class="form-group">
        <label>Score Range ({{ filterOptions.scoreThreshold[0] }} - {{ filterOptions.scoreThreshold[1] }})</label>
        <el-slider
          v-model="filterOptions.scoreThreshold"
          range
          :step="0.01"
          :max="1"
          :min="0"
          size="small"
          class="custom-slider"
        />
        <div class="range-display">
          <span>Min: 0.0</span>
          <span>Max: 1.0</span>
        </div>
      </div>
      
      <div class="action-row">
        <el-button class="btn-apply" type="primary" color="#1f2937" @click="applyFilters">Apply Filters</el-button>
        <el-button class="btn-reset" :icon="RefreshLeft" circle @click="resetFilters" title="Reset View"></el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- Layout & Typography --- */
.control-panel {
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #333;
  border-right: 1px solid #f0f0f0; /* Subtle border for separation */
}

/* Header */
.panel-header {
  margin-bottom: 24px;
}
.panel-header h3 {
  margin: 0;
  font-family: 'Times New Roman', serif; /* Academic feel */
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  letter-spacing: 0.5px;
}
.subtitle {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  display: block;
  margin-top: 4px;
}

/* --- Main Selection Section --- */
.section-main {
  margin-bottom: 20px;
}
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.section-label {
  font-size: 13px;
  font-weight: 700;
  color: #374151;
}
.helper-text {
  font-size: 11px;
  color: #6b7280;
  margin-top: 8px;
  line-height: 1.4;
  font-style: italic;
}

/* Divider */
.divider {
  height: 1px;
  background-color: #f3f4f6;
  margin: 10px 0 24px 0;
}

/* --- Pivot Filter Card --- */
.pivot-section {
  margin-bottom: 24px;
}
.pivot-label {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.pivot-card {
  background-color: #f9fafb; /* Very light gray */
  border: 1px solid #e5e7eb;
  border-left: 3px solid #374151; /* Dark accent on left */
  border-radius: 4px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.pivot-content {
  font-size: 13px;
  color: #111;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}
.pivot-prefix { opacity: 0.6; margin-right: 4px; font-size: 12px;}
.pivot-value { font-weight: 600; font-family: monospace; color: #1f2937; }
.pivot-close-icon {
  cursor: pointer; color: #9ca3af; transition: all 0.2s; font-size: 14px;
}
.pivot-close-icon:hover { color: #ef4444; transform: scale(1.1); }

/* --- Form Area --- */
.filter-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-title {
  font-size: 12px;
  font-weight: 700;
  color: #4b5563;
  display: flex;
  align-items: center;
  gap: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.form-group label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
  font-weight: 500;
}
.range-display {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #9ca3af;
  margin-top: -2px;
  font-family: monospace;
}

/* Action Buttons */
.action-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.btn-apply {
  flex: 1;
  font-weight: 600;
  border: none;
  letter-spacing: 0.5px;
  transition: opacity 0.2s;
}
.btn-apply:hover { opacity: 0.9; }
.btn-reset {
  border-color: #e5e7eb;
  color: #6b7280;
}
.btn-reset:hover {
  color: #1f2937;
  border-color: #1f2937;
  background-color: transparent;
}

/* --- Element Plus Overrides (The "Clean" Look) --- */
:deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px #e5e7eb inset !important;
  background-color: #fff;
  border-radius: 4px;
  padding: 4px 11px;
}
:deep(.el-input__wrapper:hover), :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #1f2937 inset !important;
}
:deep(.el-select .el-input__inner) {
  font-weight: 500;
  color: #111;
  font-size: 13px;
}
:deep(.search-icon) { color: #9ca3af; }

/* Slider Styling */
:deep(.custom-slider .el-slider__bar) {
  background-color: #1f2937;
}
:deep(.custom-slider .el-slider__button) {
  border-color: #1f2937;
  width: 14px;
  height: 14px;
  background-color: #fff;
}
:deep(.custom-slider .el-slider__runway) {
  background-color: #f3f4f6;
}

/* Tag overrides for non-risk mode */
:deep(.el-tag--success) {
  --el-tag-bg-color: #10b981;
  --el-tag-border-color: #10b981;
  --el-tag-text-color: #fff;
}
</style> -->


<!-- <script setup lang="ts">
import { computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import { RefreshLeft, Filter, Search, Close, Warning, CircleCheck } from '@element-plus/icons-vue';

// 1. Initialize Store
const store = useExplorerStore();
const { filterOptions, selectedSampleId, pivotFilter, currentAnalysisMode } = storeToRefs(store);

// 2. Computed Properties
const currentDisplayList = computed(() => store.currentDisplayList);

// 创建一个可写的 Computed 属性，用于绑定 v-model
const modeModel = computed({
  get: () => currentAnalysisMode.value,
  set: (val) => {
    // 假设 store 中有一个 setAnalysisMode action，或者直接修改 state
    // 如果您的 store 没有 setAnalysisMode，请直接使用: store.currentAnalysisMode = val;
    if (store.setAnalysisMode) {
      store.setAnalysisMode(val);
    } else {
      currentAnalysisMode.value = val;
    }
    // 切换模式时建议重置一下筛选，防止状态混淆
    store.resetFilters();
  }
});

// 3. Action Handlers
function applyFilters() { store.applyFilters(); }
function resetFilters() { store.resetFilters(); }
function onSampleSelect(newId: string | number | null) { store.selectSample(newId); }
function clearPivot() { store.clearPivotFilter(); }

// Static Options
const riskLevelOptions = ['高风险', '中风险', '低风险'];
</script>

<template>
  <div class="control-panel">
    <div class="panel-header">
      <h3>Sample Explorer</h3>
      <span class="subtitle">Inspection Record Analysis</span>
    </div>

    <div class="mode-switcher">
      <el-radio-group v-model="modeModel" size="default" class="mode-radio">
        <el-radio-button label="risk">
          <div class="radio-content"><el-icon><Warning /></el-icon> Risk Analysis</div>
        </el-radio-button>
        <el-radio-button label="safe">
          <div class="radio-content"><el-icon><CircleCheck /></el-icon> Safety Check</div>
        </el-radio-button>
      </el-radio-group>
    </div>
    
    <div class="section-main">
      <div class="label-row">
        <span class="section-label">
          {{ modeModel === 'risk' ? 'Top Anomalies List' : 'Verified Safe Samples' }}
        </span>
        
        <el-tag 
          size="small" 
          :color="modeModel === 'risk' ? '#1f2937' : '#10b981'" 
          effect="dark" 
          style="border:none"
        >
          {{ currentDisplayList.length }} Detected
        </el-tag>
      </div>
      
      <el-select
        :model-value="selectedSampleId"
        @change="onSampleSelect"
        :placeholder="modeModel === 'risk' ? 'Select a high-risk sample...' : 'Select a safe sample...'"
        class="main-selector"
        clearable
        filterable
      >
        <template #prefix><el-icon class="search-icon"><Search /></el-icon></template>
        
        <el-option
          v-for="sample in currentDisplayList"
          :key="sample.id"
          :label="`ID: ${sample.id} (${sample.riskLevel})`" 
          :value="sample.id"
        >
          <div style="display: flex; justify-content: space-between; width: 100%">
            <span style="font-weight: 600; color: #333">ID: {{ sample.id }}</span>
            <span style="color: #8492a6; font-size: 12px; font-family: monospace;">
              Score: {{ sample.score.toFixed(3) }}
            </span>
          </div>
        </el-option>
      </el-select>

      <div class="helper-text">
        <span v-if="modeModel === 'risk'">Select from the highest risk samples to visualize their context path.</span>
        <span v-else style="color: #059669;">Select from the safest samples to analyze normal operational patterns.</span>
      </div>
    </div>

    <div class="divider"></div>

    <div v-if="pivotFilter" class="pivot-section">
      <div class="pivot-label">Active Context Filter</div>
      <div class="pivot-card">
        <div class="pivot-content">
          <span class="pivot-prefix">Focusing on Entity:</span>
          <span class="pivot-value">{{ pivotFilter }}</span>
        </div>
        <el-icon class="pivot-close-icon" @click="clearPivot"><Close /></el-icon>
      </div>
    </div>

    <div class="filter-form">
      <div class="form-title"><el-icon><Filter /></el-icon> Custom Filters</div>
      
      <div class="form-group">
        <label>Risk Level</label>
        <el-select
          v-model="filterOptions.riskLevels"
          multiple
          collapse-tags
          placeholder="All Levels"
          style="width: 100%"
        >
          <el-option v-for="item in riskLevelOptions" :key="item" :label="item" :value="item" />
        </el-select>
      </div>

      <div class="form-group">
        <label>Score Range ({{ filterOptions.scoreThreshold[0] }} - {{ filterOptions.scoreThreshold[1] }})</label>
        <el-slider
          v-model="filterOptions.scoreThreshold"
          range
          :step="0.01"
          :max="1"
          :min="0"
          size="small"
          class="custom-slider"
        />
        <div class="range-display">
          <span>Min: 0.0</span>
          <span>Max: 1.0</span>
        </div>
      </div>
      
      <div class="action-row">
        <el-button class="btn-apply" type="primary" color="#1f2937" @click="applyFilters">Apply Filters</el-button>
        <el-button class="btn-reset" :icon="RefreshLeft" circle @click="resetFilters" title="Reset View"></el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- Layout & Typography --- */
.control-panel {
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #333;
  border-right: 1px solid #f0f0f0;
}

/* Header */
.panel-header {
  margin-bottom: 20px;
}
.panel-header h3 {
  margin: 0;
  font-family: 'Times New Roman', serif;
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  letter-spacing: 0.5px;
}
.subtitle {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  display: block;
  margin-top: 4px;
}

/* --- Mode Switcher (NEW) --- */
.mode-switcher {
  margin-bottom: 24px;
  display: flex;
  justify-content: center;
}
.mode-radio {
  width: 100%;
}
:deep(.el-radio-group) {
  width: 100%;
  display: flex;
}
:deep(.el-radio-button) {
  flex: 1;
}
:deep(.el-radio-button__inner) {
  width: 100%;
  padding: 8px 15px;
  font-weight: 600;
  font-size: 12px;
}
.radio-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

/* 动态颜色覆盖：根据选中的值改变颜色 */
/* 当选中 Risk 时，使用深灰色 */
:deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--active-color, #1f2937); 
  border-color: var(--active-color, #1f2937);
  box-shadow: -1px 0 0 0 var(--active-color, #1f2937);
}

/* --- Main Selection Section --- */
.section-main {
  margin-bottom: 20px;
}
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.section-label {
  font-size: 13px;
  font-weight: 700;
  color: #374151;
}
.helper-text {
  font-size: 11px;
  color: #6b7280;
  margin-top: 8px;
  line-height: 1.4;
  font-style: italic;
}

/* Divider */
.divider {
  height: 1px;
  background-color: #f3f4f6;
  margin: 10px 0 24px 0;
}

/* --- Pivot Filter Card --- */
.pivot-section {
  margin-bottom: 24px;
}
.pivot-label {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.pivot-card {
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  border-left: 3px solid #374151;
  border-radius: 4px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.pivot-content {
  font-size: 13px;
  color: #111;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}
.pivot-prefix { opacity: 0.6; margin-right: 4px; font-size: 12px;}
.pivot-value { font-weight: 600; font-family: monospace; color: #1f2937; }
.pivot-close-icon {
  cursor: pointer; color: #9ca3af; transition: all 0.2s; font-size: 14px;
}
.pivot-close-icon:hover { color: #ef4444; transform: scale(1.1); }

/* --- Form Area --- */
.filter-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-title {
  font-size: 12px;
  font-weight: 700;
  color: #4b5563;
  display: flex;
  align-items: center;
  gap: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.form-group label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
  font-weight: 500;
}
.range-display {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #9ca3af;
  margin-top: -2px;
  font-family: monospace;
}

/* Action Buttons */
.action-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.btn-apply {
  flex: 1;
  font-weight: 600;
  border: none;
  letter-spacing: 0.5px;
  transition: opacity 0.2s;
}
.btn-apply:hover { opacity: 0.9; }
.btn-reset {
  border-color: #e5e7eb;
  color: #6b7280;
}
.btn-reset:hover {
  color: #1f2937;
  border-color: #1f2937;
  background-color: transparent;
}

/* --- Element Plus Overrides (The "Clean" Look) --- */
:deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px #e5e7eb inset !important;
  background-color: #fff;
  border-radius: 4px;
  padding: 4px 11px;
}
:deep(.el-input__wrapper:hover), :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #1f2937 inset !important;
}
:deep(.el-select .el-input__inner) {
  font-weight: 500;
  color: #111;
  font-size: 13px;
}
:deep(.search-icon) { color: #9ca3af; }

/* Slider Styling */
:deep(.custom-slider .el-slider__bar) {
  background-color: #1f2937;
}
:deep(.custom-slider .el-slider__button) {
  border-color: #1f2937;
  width: 14px;
  height: 14px;
  background-color: #fff;
}
:deep(.custom-slider .el-slider__runway) {
  background-color: #f3f4f6;
}

/* Tag overrides for non-risk mode */
:deep(.el-tag--success) {
  --el-tag-bg-color: #10b981;
  --el-tag-border-color: #10b981;
  --el-tag-text-color: #fff;
}
</style> -->


<script setup lang="ts">
import { computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import { 
  RefreshLeft, Filter, Search, Close, 
  Warning, CircleCheck, DataLine, MagicStick 
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

// 1. Initialize Store
const store = useExplorerStore();
const { filterOptions, selectedSampleId, pivotFilter, currentAnalysisMode } = storeToRefs(store);

// 2. Computed Properties
const currentDisplayList = computed(() => store.currentDisplayList);

// 创建一个可写的 Computed 属性，用于绑定 v-model
const modeModel = computed({
  get: () => currentAnalysisMode.value,
  set: (val) => {
    store.setAnalysisMode(val); // 使用 Store Action 来切换，确保重置状态
  }
});

// 3. Action Handlers
function applyFilters() { store.applyFilters(); }
function resetFilters() { store.resetFilters(); }
function onSampleSelect(newId: string | number | null) { store.selectSample(newId); }
function clearPivot() { store.clearPivotFilter(); }

// [新增] 自动寻找并选中最佳案例
const autoFindCase = () => {
  // 1. 强制切换到 Risk 模式 (因为我们要演示风险溯源)
  store.setAnalysisMode('risk'); 
  
  // 2. 调用 Store 中的启发式算法
  // 注意：确保 explorerStore.ts 中已经添加了 findBestRiskCase action
  if (store.findBestRiskCase) {
    const bestCases = store.findBestRiskCase();
    
    if (bestCases.length > 0) {
      const best = bestCases[0];
      // 3. 选中它
      store.selectSample(best.id);
      
      ElMessage.success({
        message: `已自动定位最佳案例 ID: ${best.id} (Score: ${best.score.toFixed(3)})`,
        type: 'success',
        duration: 3000
      });
    } else {
      ElMessage.warning('当前数据中未找到符合条件的高质量案例');
    }
  } else {
    // 兜底逻辑：如果没有更新 Store，直接选分最高的
    const fallback = store.topRankedAnomalies[0];
    if (fallback) store.selectSample(fallback.id);
  }
};

// Static Options
const riskLevelOptions = ['高风险', '中风险', '低风险'];
</script>

<template>
  <div class="control-panel">
    <div class="panel-header">
      <h3>Sample Explorer</h3>
      <span class="subtitle">Inspection Record Analysis</span>
    </div>

    <div class="mode-switcher">
      <el-radio-group 
        v-model="modeModel" 
        size="default" 
        class="mode-radio"
        :class="`mode-${modeModel}`"
      >
        <el-radio-button label="all">
          <div class="radio-content"><el-icon><DataLine /></el-icon> Global</div>
        </el-radio-button>
        <el-radio-button label="risk">
          <div class="radio-content"><el-icon><Warning /></el-icon> Risk</div>
        </el-radio-button>
        <el-radio-button label="safe">
          <div class="radio-content"><el-icon><CircleCheck /></el-icon> Safe</div>
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="magic-section">
      <el-button 
        class="magic-btn" 
        @click="autoFindCase"
      >
        <el-icon class="el-icon--left"><MagicStick /></el-icon>
        Auto-Detect Perfect Case
      </el-button>
    </div>
    
    <div class="scroll-container">
      
      <div class="section-main">
        <div class="label-row">
          <span class="section-label">
            {{ 
              modeModel === 'safe' ? 'Verified Safe Samples' : 
              (modeModel === 'all' ? 'Global Sample Overview' : 'Top Anomalies List') 
            }}
          </span>
          
          <el-tag 
            size="small" 
            :color="modeModel === 'safe' ? '#10b981' : (modeModel === 'all' ? '#409eff' : '#1f2937')" 
            effect="dark" 
            style="border:none"
          >
            {{ currentDisplayList.length }} Items
          </el-tag>
        </div>
        
        <el-select
          :model-value="selectedSampleId"
          @change="onSampleSelect"
          :placeholder="modeModel === 'safe' ? 'Select a safe sample...' : 'Select a sample to trace...'"
          class="main-selector"
          clearable
          filterable
        >
          <template #prefix><el-icon class="search-icon"><Search /></el-icon></template>
          
          <el-option
            v-for="sample in currentDisplayList"
            :key="sample.id"
            :label="`ID: ${sample.id} (${sample.riskLevel})`" 
            :value="sample.id"
          >
            <div style="display: flex; justify-content: space-between; width: 100%">
              <span style="font-weight: 600; color: #333">ID: {{ sample.id }}</span>
              <span style="color: #8492a6; font-size: 12px; font-family: monospace;">
                Score: {{ sample.score.toFixed(3) }}
              </span>
            </div>
          </el-option>
        </el-select>

        <div class="helper-text">
          <span v-if="modeModel === 'safe'" style="color: #059669;">
            Select verified samples to analyze safe supply chain patterns.
          </span>
          <span v-else>
            Select from the list to visualize causal context and flow paths.
          </span>
        </div>
      </div>

      <div class="divider"></div>

      <div v-if="pivotFilter" class="pivot-section">
        <div class="pivot-label">Active Context Filter</div>
        <div class="pivot-card">
          <div class="pivot-content">
            <span class="pivot-prefix">Focusing on Entity:</span>
            <span class="pivot-value">{{ pivotFilter }}</span>
          </div>
          <el-icon class="pivot-close-icon" @click="clearPivot"><Close /></el-icon>
        </div>
      </div>

      <div class="filter-form">
        <div class="form-title"><el-icon><Filter /></el-icon> Custom Filters</div>
        
        <div class="form-group">
          <label>Risk Level</label>
          <el-select
            v-model="filterOptions.riskLevels"
            multiple
            collapse-tags
            placeholder="All Levels"
            style="width: 100%"
          >
            <el-option v-for="item in riskLevelOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </div>

        <div class="form-group">
          <label>Score Range ({{ filterOptions.scoreThreshold[0] }} - {{ filterOptions.scoreThreshold[1] }})</label>
          <el-slider
            v-model="filterOptions.scoreThreshold"
            range
            :step="0.01"
            :max="1"
            :min="0"
            size="small"
            class="custom-slider"
          />
          <div class="range-display">
            <span>Min: 0.0</span>
            <span>Max: 1.0</span>
          </div>
        </div>
        
        <div class="action-row">
          <el-button class="btn-apply" type="primary" color="#1f2937" @click="applyFilters">Apply Filters</el-button>
          <el-button class="btn-reset" :icon="RefreshLeft" circle @click="resetFilters" title="Reset View"></el-button>
        </div>
      </div>
      
    </div> </div>
</template>

<style scoped>
/* --- Layout & Typography --- */
.control-panel {
  height: 100%;
  /* 关键修复 1: 使用 Flex 布局垂直排列 */
  display: flex;
  flex-direction: column;
  
  padding: 24px;
  box-sizing: border-box;
  background-color: #ffffff;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #333;
  border-right: 1px solid #f0f0f0;
  
  /* 关键修复 2: 确保容器本身不溢出父级，如果父级高度固定的话 */
  overflow: hidden; 
}

/* Header (固定在顶部) */
.panel-header {
  margin-bottom: 20px;
  flex-shrink: 0; /* 防止被压缩 */
}
.panel-header h3 {
  margin: 0;
  font-family: 'Times New Roman', serif;
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  letter-spacing: 0.5px;
}
.subtitle {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  display: block;
  margin-top: 4px;
}

/* --- Mode Switcher (固定) --- */
.mode-switcher {
  margin-bottom: 16px;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}
.mode-radio { width: 100%; }
:deep(.el-radio-group) { width: 100%; display: flex; }
:deep(.el-radio-button) { flex: 1; }
:deep(.el-radio-button__inner) {
  width: 100%;
  padding: 8px 0;
  font-weight: 600;
  font-size: 11px;
}
.radio-content { display: flex; align-items: center; justify-content: center; gap: 4px; }

/* 动态颜色控制 */
.mode-all :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #409eff; border-color: #409eff; box-shadow: -1px 0 0 0 #409eff;
}
.mode-risk :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #1f2937; border-color: #1f2937; box-shadow: -1px 0 0 0 #1f2937;
}
.mode-safe :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #10b981; border-color: #10b981; box-shadow: -1px 0 0 0 #10b981;
}

/* --- Magic Button (固定) --- */
.magic-section {
  margin-bottom: 24px;
  flex-shrink: 0;
}
.magic-btn {
  width: 100%;
  background: linear-gradient(135deg, #fdfbfb 0%, #f4f6f8 100%);
  border: 1px dashed #dcdfe6;
  color: #606266;
  font-weight: 600;
  font-size: 12px;
  height: 36px;
}
.magic-btn:hover {
  background: #ecf5ff; border-color: #409eff; color: #409eff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
}

/* --- 核心滚动区域 (Scrollable Area) --- */
/* 这里包裹了列表、分割线、Pivot过滤器和自定义过滤器 */
.scroll-container {
  flex: 1; /* 占据剩余所有空间 */
  overflow-y: auto; /* 允许垂直滚动 */
  min-height: 0; /* 防止 flex 子项溢出 */
  
  /* 隐藏滚动条但保留功能 (可选) */
  scrollbar-width: thin; 
  padding-right: 4px; /* 防止滚动条挡住内容 */
}

/* Webkit 滚动条样式优化 */
.scroll-container::-webkit-scrollbar { width: 6px; }
.scroll-container::-webkit-scrollbar-thumb { background-color: #e5e7eb; border-radius: 3px; }
.scroll-container::-webkit-scrollbar-track { background: transparent; }

/* --- 内部组件样式 --- */
.section-main { margin-bottom: 20px; }
.label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.section-label { font-size: 13px; font-weight: 700; color: #374151; }
.helper-text { font-size: 11px; color: #6b7280; margin-top: 8px; line-height: 1.4; font-style: italic; }

.divider { height: 1px; background-color: #f3f4f6; margin: 10px 0 24px 0; }

.pivot-section { margin-bottom: 24px; }
.pivot-label { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 6px; }
.pivot-card {
  background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 3px solid #374151;
  border-radius: 4px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;
}
.pivot-content { font-size: 13px; color: #111; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px; }
.pivot-prefix { opacity: 0.6; margin-right: 4px; font-size: 12px;}
.pivot-value { font-weight: 600; font-family: monospace; color: #1f2937; }
.pivot-close-icon { cursor: pointer; color: #9ca3af; font-size: 14px; }
.pivot-close-icon:hover { color: #ef4444; }

.filter-form { display: flex; flex-direction: column; gap: 16px; padding-bottom: 20px; /* 底部留白 */ }
.form-title { font-size: 12px; font-weight: 700; color: #4b5563; display: flex; align-items: center; gap: 6px; text-transform: uppercase; }
.form-group label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500; }
.range-display { display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; margin-top: -2px; font-family: monospace; }

.action-row { display: flex; gap: 10px; margin-top: 12px; }
.btn-apply { flex: 1; font-weight: 600; border: none; }
.btn-apply:hover { opacity: 0.9; }
.btn-reset { border-color: #e5e7eb; color: #6b7280; }
.btn-reset:hover { color: #1f2937; border-color: #1f2937; background-color: transparent; }

/* Element Plus Overrides */
:deep(.el-input__wrapper) { box-shadow: 0 0 0 1px #e5e7eb inset !important; background-color: #fff; border-radius: 4px; padding: 4px 11px; }
:deep(.el-input__wrapper:hover), :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px #1f2937 inset !important; }
:deep(.el-select .el-input__inner) { font-weight: 500; color: #111; font-size: 13px; }
:deep(.search-icon) { color: #9ca3af; }
:deep(.custom-slider .el-slider__bar) { background-color: #1f2937; }
:deep(.custom-slider .el-slider__button) { border-color: #1f2937; width: 14px; height: 14px; background-color: #fff; }
:deep(.custom-slider .el-slider__runway) { background-color: #f3f4f6; }
:deep(.el-tag--success) { --el-tag-bg-color: #10b981; --el-tag-border-color: #10b981; --el-tag-text-color: #fff; }
</style>



<!-- <script setup lang="ts">
import { computed } from 'vue';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import { 
  RefreshLeft, Filter, Search, Close, 
  Warning, CircleCheck, DataLine, MagicStick 
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

// 1. Initialize Store
const store = useExplorerStore();
const { filterOptions, selectedSampleId, pivotFilter, currentAnalysisMode } = storeToRefs(store);

// 2. Computed Properties
const currentDisplayList = computed(() => store.currentDisplayList);

// 创建一个可写的 Computed 属性，用于绑定 v-model
const modeModel = computed({
  get: () => currentAnalysisMode.value,
  set: (val) => {
    store.setAnalysisMode(val); // 使用 Store Action 来切换，确保重置状态
  }
});

// 3. [关键新增] 搜索处理函数 (修复 ID 筛选问题)
const handleSearch = (query: string) => {
  store.searchQuery = query; // 将输入的 ID 更新到 store，触发全局搜索
};

const handleClear = () => {
  store.searchQuery = ''; // 清空时重置
};

// 4. Action Handlers
function applyFilters() { store.applyFilters(); }
function resetFilters() { store.resetFilters(); }
function onSampleSelect(newId: string | number | null) { store.selectSample(newId); }
function clearPivot() { store.clearPivotFilter(); }

// 5. 自动寻找并选中最佳案例 (功能保留)
const autoFindCase = () => {
  store.setAnalysisMode('risk'); 
  
  if (store.findBestRiskCase) {
    const bestCases = store.findBestRiskCase();
    
    if (bestCases.length > 0) {
      const best = bestCases[0];
      store.selectSample(best.id);
      
      ElMessage.success({
        message: `已自动定位最佳案例 ID: ${best.id} (Score: ${best.score.toFixed(3)})`,
        type: 'success',
        duration: 3000
      });
    } else {
      ElMessage.warning('当前数据中未找到符合条件的高质量案例');
    }
  } else {
    // 兜底逻辑
    const fallback = store.topRankedAnomalies[0];
    if (fallback) store.selectSample(fallback.id);
  }
};

// Static Options
const riskLevelOptions = ['高风险', '中风险', '低风险'];
</script>

<template>
  <div class="control-panel">
    <div class="panel-header">
      <h3>Sample Explorer</h3>
      <span class="subtitle">Inspection Record Analysis</span>
    </div>

    <div class="mode-switcher">
      <el-radio-group 
        v-model="modeModel" 
        size="default" 
        class="mode-radio"
        :class="`mode-${modeModel}`"
      >
        <el-radio-button label="all">
          <div class="radio-content"><el-icon><DataLine /></el-icon> Global</div>
        </el-radio-button>
        <el-radio-button label="risk">
          <div class="radio-content"><el-icon><Warning /></el-icon> Risk</div>
        </el-radio-button>
        <el-radio-button label="safe">
          <div class="radio-content"><el-icon><CircleCheck /></el-icon> Safe</div>
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="magic-section">
      <el-button 
        class="magic-btn" 
        @click="autoFindCase"
      >
        <el-icon class="el-icon--left"><MagicStick /></el-icon>
        Auto-Detect Perfect Case
      </el-button>
    </div>
    
    <div class="scroll-container">
      
      <div class="section-main">
        <div class="label-row">
          <span class="section-label">
            {{ 
              modeModel === 'safe' ? 'Verified Safe Samples' : 
              (modeModel === 'all' ? 'Global Sample Overview' : 'Top Anomalies List') 
            }}
          </span>
          
          <el-tag 
            size="small" 
            :color="modeModel === 'safe' ? '#10b981' : (modeModel === 'all' ? '#409eff' : '#1f2937')" 
            effect="dark" 
            style="border:none"
          >
            {{ currentDisplayList.length }} Items
          </el-tag>
        </div>
        
        <el-select
          :model-value="selectedSampleId"
          @change="onSampleSelect"
          :placeholder="modeModel === 'safe' ? 'Search safe ID...' : 'Search sample ID...'"
          class="main-selector"
          clearable
          filterable
          remote
          reserve-keyword
          :remote-method="handleSearch"
          @clear="handleClear"
        >
          <template #prefix><el-icon class="search-icon"><Search /></el-icon></template>
          
          <el-option
            v-for="sample in currentDisplayList"
            :key="sample.id"
            :label="`ID: ${sample.id} (${sample.riskLevel})`" 
            :value="sample.id"
          >
            <div style="display: flex; justify-content: space-between; width: 100%">
              <span style="font-weight: 600; color: #333">ID: {{ sample.id }}</span>
              <span style="color: #8492a6; font-size: 12px; font-family: monospace;">
                Score: {{ sample.score.toFixed(3) }}
              </span>
            </div>
          </el-option>
        </el-select>

        <div class="helper-text">
          <span v-if="modeModel === 'safe'" style="color: #059669;">
            Select verified samples to analyze safe supply chain patterns.
          </span>
          <span v-else>
            Select from the list to visualize causal context and flow paths.
          </span>
        </div>
      </div>

      <div class="divider"></div>

      <div v-if="pivotFilter" class="pivot-section">
        <div class="pivot-label">Active Context Filter</div>
        <div class="pivot-card">
          <div class="pivot-content">
            <span class="pivot-prefix">Focusing on Entity:</span>
            <span class="pivot-value">{{ pivotFilter }}</span>
          </div>
          <el-icon class="pivot-close-icon" @click="clearPivot"><Close /></el-icon>
        </div>
      </div>

      <div class="filter-form">
        <div class="form-title"><el-icon><Filter /></el-icon> Custom Filters</div>
        
        <div class="form-group">
          <label>Risk Level</label>
          <el-select
            v-model="filterOptions.riskLevels"
            multiple
            collapse-tags
            placeholder="All Levels"
            style="width: 100%"
          >
            <el-option v-for="item in riskLevelOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </div>

        <div class="form-group">
          <label>Score Range ({{ filterOptions.scoreThreshold[0] }} - {{ filterOptions.scoreThreshold[1] }})</label>
          <el-slider
            v-model="filterOptions.scoreThreshold"
            range
            :step="0.01"
            :max="1"
            :min="0"
            size="small"
            class="custom-slider"
          />
          <div class="range-display">
            <span>Min: 0.0</span>
            <span>Max: 1.0</span>
          </div>
        </div>
        
        <div class="action-row">
          <el-button class="btn-apply" type="primary" color="#1f2937" @click="applyFilters">Apply Filters</el-button>
          <el-button class="btn-reset" :icon="RefreshLeft" circle @click="resetFilters" title="Reset View"></el-button>
        </div>
      </div>
      
    </div> </div>
</template>

<style scoped>
/* --- Layout & Typography --- */
.control-panel {
  height: 100%;
  display: flex;
  flex-direction: column; /* 纵向排列 */
  
  padding: 24px;
  box-sizing: border-box;
  background-color: #ffffff;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #333;
  border-right: 1px solid #f0f0f0;
  
  overflow: hidden; /* 防止父容器溢出 */
}

/* Header (固定) */
.panel-header {
  margin-bottom: 20px;
  flex-shrink: 0; 
}
.panel-header h3 {
  margin: 0;
  font-family: 'Times New Roman', serif;
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  letter-spacing: 0.5px;
}
.subtitle {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  display: block;
  margin-top: 4px;
}

/* --- Mode Switcher (固定) --- */
.mode-switcher {
  margin-bottom: 16px;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}
.mode-radio { width: 100%; }
:deep(.el-radio-group) { width: 100%; display: flex; }
:deep(.el-radio-button) { flex: 1; }
:deep(.el-radio-button__inner) {
  width: 100%;
  padding: 8px 0;
  font-weight: 600;
  font-size: 11px;
}
.radio-content { display: flex; align-items: center; justify-content: center; gap: 4px; }

/* 动态颜色控制 */
.mode-all :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #409eff; border-color: #409eff; box-shadow: -1px 0 0 0 #409eff;
}
.mode-risk :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #1f2937; border-color: #1f2937; box-shadow: -1px 0 0 0 #1f2937;
}
.mode-safe :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: #10b981; border-color: #10b981; box-shadow: -1px 0 0 0 #10b981;
}

/* --- Magic Button (固定) --- */
.magic-section {
  margin-bottom: 24px;
  flex-shrink: 0;
}
.magic-btn {
  width: 100%;
  background: linear-gradient(135deg, #fdfbfb 0%, #f4f6f8 100%);
  border: 1px dashed #dcdfe6;
  color: #606266;
  font-weight: 600;
  font-size: 12px;
  height: 36px;
}
.magic-btn:hover {
  background: #ecf5ff; border-color: #409eff; color: #409eff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
}

/* --- 核心滚动区域 (Scrollable Area) --- */
.scroll-container {
  flex: 1; /* 占据剩余空间 */
  overflow-y: auto; /* 允许垂直滚动 */
  min-height: 0; 
  padding-right: 4px; 
}

/* Webkit 滚动条样式优化 */
.scroll-container::-webkit-scrollbar { width: 6px; }
.scroll-container::-webkit-scrollbar-thumb { background-color: #e5e7eb; border-radius: 3px; }
.scroll-container::-webkit-scrollbar-track { background: transparent; }

/* --- 内部组件样式 --- */
.section-main { margin-bottom: 20px; }
.label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.section-label { font-size: 13px; font-weight: 700; color: #374151; }
.helper-text { font-size: 11px; color: #6b7280; margin-top: 8px; line-height: 1.4; font-style: italic; }

.divider { height: 1px; background-color: #f3f4f6; margin: 10px 0 24px 0; }

.pivot-section { margin-bottom: 24px; }
.pivot-label { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 6px; }
.pivot-card {
  background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 3px solid #374151;
  border-radius: 4px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;
}
.pivot-content { font-size: 13px; color: #111; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px; }
.pivot-prefix { opacity: 0.6; margin-right: 4px; font-size: 12px;}
.pivot-value { font-weight: 600; font-family: monospace; color: #1f2937; }
.pivot-close-icon { cursor: pointer; color: #9ca3af; font-size: 14px; }
.pivot-close-icon:hover { color: #ef4444; }

.filter-form { display: flex; flex-direction: column; gap: 16px; padding-bottom: 20px; }
.form-title { font-size: 12px; font-weight: 700; color: #4b5563; display: flex; align-items: center; gap: 6px; text-transform: uppercase; }
.form-group label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500; }
.range-display { display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; margin-top: -2px; font-family: monospace; }

.action-row { display: flex; gap: 10px; margin-top: 12px; }
.btn-apply { flex: 1; font-weight: 600; border: none; }
.btn-apply:hover { opacity: 0.9; }
.btn-reset { border-color: #e5e7eb; color: #6b7280; }
.btn-reset:hover { color: #1f2937; border-color: #1f2937; background-color: transparent; }

/* Element Plus Overrides */
:deep(.el-input__wrapper) { box-shadow: 0 0 0 1px #e5e7eb inset !important; background-color: #fff; border-radius: 4px; padding: 4px 11px; }
:deep(.el-input__wrapper:hover), :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px #1f2937 inset !important; }
:deep(.el-select .el-input__inner) { font-weight: 500; color: #111; font-size: 13px; }
:deep(.search-icon) { color: #9ca3af; }
:deep(.custom-slider .el-slider__bar) { background-color: #1f2937; }
:deep(.custom-slider .el-slider__button) { border-color: #1f2937; width: 14px; height: 14px; background-color: #fff; }
:deep(.custom-slider .el-slider__runway) { background-color: #f3f4f6; }
:deep(.el-tag--success) { --el-tag-bg-color: #10b981; --el-tag-border-color: #10b981; --el-tag-text-color: #fff; }
</style> -->


