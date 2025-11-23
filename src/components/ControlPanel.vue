<script setup lang="ts">
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';
import { RefreshLeft, Filter, Search, Close } from '@element-plus/icons-vue';

const store = useExplorerStore();

const { filterOptions, topRankedAnomalies, selectedSampleId, pivotFilter } = storeToRefs(store);

function applyFilters() { store.applyFilters(); }
function resetFilters() { store.resetFilters(); }
function onSampleSelect(newId: string | number | null) { store.selectSample(newId); }

function clearPivot() {
  store.clearPivotFilter();
}

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
        <span class="section-label">Top 20 Anomalies</span>
        <el-tag size="small" color="#1f2937" effect="dark" style="border:none">{{ topRankedAnomalies.length }} Detected</el-tag>
      </div>
      
      <el-select
        :model-value="selectedSampleId"
        @change="onSampleSelect"
        placeholder="Select a sample to analyze..."
        class="main-selector"
        clearable
        filterable
      >
        <template #prefix><el-icon class="search-icon"><Search /></el-icon></template>
        <el-option
          v-for="sample in topRankedAnomalies"
          :key="sample.id"
          :label="`ID: ${sample.id} (Score: ${sample.score.toFixed(3)})`"
          :value="sample.id"
        >
          <span style="float: left; font-family: monospace; font-weight: 600; color: #333">ID: {{ sample.id }}</span>
          <span style="float: right; color: #8492a6; font-size: 12px; font-family: monospace;">
            {{ sample.score.toFixed(3) }}
          </span>
        </el-option>
      </el-select>
      <div class="helper-text">Select from the highest risk samples to visualize their context path.</div>
    </div>

    <div class="divider"></div>

    <div v-if="pivotFilter" class="pivot-section">
      <div class="pivot-label">Active Filter</div>
      <div class="pivot-card">
        <div class="pivot-content">
          <span class="pivot-prefix">Related to:</span>
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
        <label>Anomaly Score Range</label>
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
          <span>{{ filterOptions.scoreThreshold[0] }}</span>
          <span>{{ filterOptions.scoreThreshold[1] }}</span>
        </div>
      </div>
      
      <div class="action-row">
        <el-button class="btn-apply" type="primary" color="#1f2937" @click="applyFilters">Apply</el-button>
        <el-button class="btn-reset" :icon="RefreshLeft" circle @click="resetFilters" title="Reset"></el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 容器：纯白、无边框，极简 */
.control-panel {
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #333;
}

/* 标题样式 */
.panel-header {
  margin-bottom: 24px;
}
.panel-header h3 {
  margin: 0;
  font-family: 'Times New Roman', serif; /* 学术感 */
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
}

/* 核心选择区 */
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
  color: #9ca3af;
  margin-top: 6px;
  line-height: 1.4;
}

/* 分割线 */
.divider {
  height: 1px;
  background-color: #f3f4f6;
  margin: 10px 0 24px 0;
}

/* Pivot Filter 样式优化 (去蓝化) */
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
  background-color: #f9fafb; /* 极淡灰 */
  border: 1px solid #e5e7eb;
  border-left: 3px solid #374151; /* 深灰左边框 */
  border-radius: 4px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
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
.pivot-value { font-weight: 600; font-family: monospace; }
.pivot-close-icon {
  cursor: pointer; color: #9ca3af; transition: color 0.2s;
}
.pivot-close-icon:hover { color: #111; }

/* 表单区 */
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
  font-size: 11px;
  color: #9ca3af;
  margin-top: -4px;
  font-family: monospace;
}

/* 按钮组 */
.action-row {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.btn-apply {
  flex: 1;
  font-weight: 600;
  border: none; /* 去边框 */
}
.btn-reset:hover {
  color: #1f2937;
  border-color: #1f2937;
  background-color: transparent;
}

/* Element Plus 样式覆写 (颜色替换：#3b82f6 -> #1f2937) */
:deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px #e5e7eb inset !important;
  background-color: #fff; /* 纯白输入框 */
  border-radius: 2px;
}
:deep(.el-input__wrapper:hover), :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #1f2937 inset !important; /* 聚焦变深灰 */
}
:deep(.el-select .el-input__inner) {
  font-weight: 500;
  color: #111;
}
:deep(.search-icon) { color: #9ca3af; }

/* Slider 颜色替换 */
:deep(.custom-slider .el-slider__bar) {
  background-color: #1f2937;
}
:deep(.custom-slider .el-slider__button) {
  border-color: #1f2937;
  width: 12px;
  height: 12px;
}
:deep(.el-tag--danger) {
    --el-tag-bg-color: #1f2937;
    --el-tag-border-color: #1f2937;
    --el-tag-text-color: #fff;
}
</style>