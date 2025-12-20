<script setup lang="ts">
import { computed, watch } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';

// 引入子组件
import ChordDiagram from './ChordDiagram.vue';
import PathFlowView from './PathFlowView.vue';
import SafetyRadar from './SafetyRadar.vue';

const store = useExplorerStore();
const { selectedSampleId, samples } = storeToRefs(store);

// --- 核心切换逻辑 ---
const isHighRisk = computed(() => {
  if (!selectedSampleId.value || !samples.value) return false;
  
  const currentSample = samples.value.find(s => String(s.id) === String(selectedSampleId.value));
  
  // 只有"低风险"才显示全屏安全视图，其他(中/高)显示分屏弦图
  return currentSample ? currentSample.riskLevel !== '低风险' : false;
});

</script>

<template>
  <div class="meta-matrix-container">
    <transition name="layout-fade" mode="out-in">
      
      <Splitpanes v-if="isHighRisk" class="default-theme">
        
        <Pane size="40" min-size="30" class="pane-border">
          <ChordDiagram />
        </Pane>

        <Pane size="60" min-size="40" class="pane-border relative-pane">
          <PathFlowView />
        </Pane>

      </Splitpanes>

      <div v-else class="full-screen-wrapper">
         <SafetyRadar />
      </div>

    </transition>
  </div>
</template>

<style scoped>
.meta-matrix-container {
  height: 100%; 
  width: 100%; 
  background-color: #ffffff;
  position: relative;
  overflow: hidden;
}

:deep(.splitpanes) { height: 100%; }

.relative-pane {
  position: relative;
  height: 100%; 
  overflow: hidden;
  background-color: #fff;
}

/* 修复后的全屏容器：无内边距，无宽度限制 */
.full-screen-wrapper {
  height: 100%;
  width: 100%;
  background-color: #fff;
  display: flex;
  flex-direction: column; /* 让内部组件自由伸展 */
  overflow: hidden;
}

/* 切换动画 */
.layout-fade-enter-active,
.layout-fade-leave-active {
  transition: opacity 0.3s ease;
}
.layout-fade-enter-from,
.layout-fade-leave-to {
  opacity: 0;
}
</style>