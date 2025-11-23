<template>
  <header class="app-header">
    <div class="header-content">
      <h1 class="app-title">FoodADExplorer</h1>
      </div>
  </header>
</template>

<style scoped>
.app-header {
  background-color: #333; /* 黑色背景 */
  color: #fff;
  padding: 10px 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); /* 底部阴影，增加层次感 */
  z-index: 1000; /* 确保它在最上层 */
  width: 100%;
  box-sizing: border-box; /* 包含 padding 在宽度内 */
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between; /* 如果有其他内容，让它们左右对齐 */
  max-width: 1400px; /* 限制内容宽度，如果需要 */
  margin: 0 auto; /* 内容居中 */
}

.app-title {
  margin: 0;
  font-size: 1.8em;
  font-weight: normal;
}
</style>