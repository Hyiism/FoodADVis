// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia' // 1. 导入

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia()) // 2. 确保这行存在
app.use(router)
app.use(ElementPlus)

app.mount('#app')