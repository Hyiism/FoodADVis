<template>
  <div class="panel-container">
    <h4>Node Types</h4>
    <div class="legend-item">
      <span class="color-box disease"></span> Disease
    </div>
    <div class="legend-item">
      <span class="color-box drug"></span> Drug
    </div>
    </div>
</template>

<style scoped>
.panel-container {
  padding: 16px;
  height: 100%;
  box-sizing: border-box;
  background-color: #f7f9fb; /* 和控制面板一样的背景色 */
  border-right: 1px solid #e0e0e0;
  border-top: 1px solid #e0e0e0; /* 和上面的面板分开 */
}

h4 {
  margin-top: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.color-box {
  width: 15px;
  height: 15px;
  margin-right: 8px;
  border: 1px solid #ccc;
}

/* 从你的截图中复制颜色 */
.disease { background-color: #f8a55e; }
.drug { background-color: #74d2e7; }
</style>