<script setup lang="ts">
import { onMounted } from 'vue';
import { Splitpanes, Pane } from 'splitpanes';
import 'splitpanes/dist/splitpanes.css';
import { useExplorerStore } from '@/stores/explorerStore';
import TheHeader from '@/components/TheHeader.vue';
import ControlPanel from '@/components/ControlPanel.vue';
import EmbeddingView from '@/components/EmbeddingView.vue';
import MetaPathView from '@/components/MetaPathView.vue'; 
import HotspotAnalyzer from '@/components/HotspotAnalyzer.vue';
// 1. 引入地图组件
import ChinaMap from '@/components/ChinaMap.vue';

const store = useExplorerStore();
onMounted(() => {
  store.initialize();
});
</script>

<template>
  <div class="app-layout">
    <TheHeader />
    <div class="main-content">
      <Splitpanes class="default-theme" horizontal>
        
        <!-- 上半部分 -->
        <Pane size="50">
          <Splitpanes class="default-theme">
            <!-- 左：控制面板 -->
            <Pane size="25" min-size="20"><ControlPanel /></Pane>
            
            <!-- 中：嵌入视图 -->
            <Pane size="41"><EmbeddingView /></Pane>
            
            <!-- 右：地图模块 (原来的 placeholder-pane 位置) -->
            <Pane size="34">
              <!-- 2. 使用地图组件 -->
              <ChinaMap />
            </Pane>
          </Splitpanes>
        </Pane>
        
        <!-- 下半部分 -->
        <Pane size="50">
          <Splitpanes class="default-theme">
            <Pane size="25" min-size="20">
              <HotspotAnalyzer />
            </Pane>
            
            <Pane size="75">
              <MetaPathView />
            </Pane>
          </Splitpanes>
        </Pane>

      </Splitpanes>
    </div>
  </div>
</template>

<style>
/* 全局样式 */
body {
  margin: 0;
  padding: 0;
  overflow: hidden; /* 防止出现双滚动条 */
}

/* 整个应用布局容器，使用 flex 垂直排列 */
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh; /* 让整个容器占据视口高度 */
}

/* 主内容区域占据标题栏下方的所有剩余空间 */
.main-content {
  flex: 1; /* 让它填充可用空间 */
  overflow: hidden; /* 确保 splitpanes 不会溢出 */
}

/* 占位符样式（如果还在使用） */
.placeholder-pane {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f4f4f4;
  color: #999;
  font-size: 1.5em;
  font-weight: bold;
  border: 2px dashed #ccc;
  box-sizing: border-box;
}
</style>