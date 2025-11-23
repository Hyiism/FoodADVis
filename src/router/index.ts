// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
// 1. 导入你的新页面
import MainDashboard from '../views/MainDashboard.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      // 2. 把根路径指向你的新组件
      component: MainDashboard
    }
    // 3. (可选) 你可以删除或注释掉默认的 About 路由
    // {
    //   path: '/about',
    //   name: 'about',
    //   component: () => import('../views/AboutView.vue')
    // }
  ]
})

export default router