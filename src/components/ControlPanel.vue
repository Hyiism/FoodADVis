<script setup lang="ts">
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
</style>