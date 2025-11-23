<script setup lang="ts">
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';

// 引入刚才拆分的两个子组件
import ChordDiagram from './ChordDiagram.vue';
import PathFlowView from './PathFlowView.vue';
</script>

<template>
  <div class="meta-matrix-container">
    <Splitpanes class="default-theme">
      
      <Pane size="30" min-size="30" class="pane-border">
        <ChordDiagram />
      </Pane>

      <Pane size="70" min-size="40" class="pane-border">
        <PathFlowView />
      </Pane>

    </Splitpanes>
  </div>
</template>

<style scoped>
/* 强制白底 */
.meta-matrix-container {
  height: 100%; 
  width: 100%; 
  padding: 0; 
  overflow: hidden; 
  background-color: #ffffff !important;
}

:deep(.splitpanes) { height: 100%; background-color: #ffffff !important; }
:deep(.splitpanes__pane) { background-color: #ffffff !important; }

/* 添加淡灰色边框分割 */
.pane-border {
  border-right: 1px solid #f0f0f0;
  overflow: hidden; /* 子组件自己处理滚动 */
}
</style>