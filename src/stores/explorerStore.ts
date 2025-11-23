import { defineStore } from 'pinia'
// 导入我们之前创建的类型定义文件
import type { Sample, ContextData, MetaPathChain } from './types' 

// [新增] 模拟的省份列表，用于将样本 ID 映射到地理位置 (实现联动)
const MOCK_PROVINCES = [
  "浙江省", "江苏省", "山东省", "福建省", "广东省", 
  "上海市", "北京市", "辽宁省", "湖北省", "湖南省", "四川省"
];

export const useExplorerStore = defineStore('explorer', {
  
  // --- 1. 定义状态 (State) ---
  state: () => ({
    // A. 控制面板的筛选条件
    filterOptions: {
      riskLevels: [] as string[], 
      scoreThreshold: [0.15, 1], 
    },

    // B. “原始数据库”
    allSamplesRaw: [] as Sample[],
    allContextData: {} as Record<string | number, ContextData>,
    allExplanations: {} as Record<string | number, MetaPathChain[]>,

    // C. 经过本地筛选后，真正要显示的样本
    filteredSamples: [] as Sample[],
    
    // D. 交互状态
    selectedSampleId: null as (string | number | null),
    isLoading: false,
    entityRiskMapCache: null as (Map<string, number> | null),

    // E. 联动状态
    pivotFilter: null as (string | null), // 实体交叉筛选
    selectedProvince: null as (string | null), // [新增] 省份筛选
  }),

  // --- 2. 定义 Getters (计算属性) ---
  getters: {
    topRankedAnomalies: (state) => {
      return state.filteredSamples
        .slice() 
        .sort((a, b) => b.score - a.score) 
        .slice(0, 20); 
    },

    selectedSample: (state) => {
      if (state.selectedSampleId === null) return null;
      return state.allSamplesRaw.find(s => s.id === state.selectedSampleId);
    },

    selectedSampleContext: (state) => {
      if (state.selectedSampleId === null) return null;
      return state.allContextData[state.selectedSampleId] || null;
    },

    selectedSampleMetaPath: (state) : MetaPathChain[] | null => {
      if (state.selectedSampleId === null) return null;
      return state.allExplanations[state.selectedSampleId] || null;
    },

    // [新增] 计算当前选中样本的运输路径 (用于地图连线)
    // 逻辑：基于 ID 的哈希算法，确保同一个样本总是对应固定的 [产地 -> 销地]
    currentSampleRoute: (state) => {
      if (!state.selectedSampleId) return null;
      
      const id = Number(state.selectedSampleId);
      if (isNaN(id)) return null;

      // 模拟映射逻辑: ID % 长度 = 产地索引
      const fromIndex = id % MOCK_PROVINCES.length;
      // 销地索引稍微错开一点，避免产销地重合
      const toIndex = (id + 3) % MOCK_PROVINCES.length; 
      
      return {
        from: MOCK_PROVINCES[fromIndex],
        to: MOCK_PROVINCES[toIndex]
      };
    },

    entityRiskMap(state): Map<string, number> {
      if (state.entityRiskMapCache) {
        return state.entityRiskMapCache;
      }
      
      const riskMap = new Map<string, number>();
      if (!state.allSamplesRaw || !state.allContextData) return riskMap;

      for (const sample of state.allSamplesRaw) {
        if (sample.riskLevel === '低风险') continue;
        
        const context = state.allContextData[sample.id];
        if (!context) continue;

        for (const [typeKey, idList] of Object.entries(context)) {
          const typeName = typeKey.charAt(0).toUpperCase() + (typeKey.endsWith('s') ? typeKey.slice(1, -1) : typeKey.slice(1));
          
          (idList as (string | number)[]).forEach((id: string | number) => {
            const entityName = `${typeName}[${id}]`;
            riskMap.set(entityName, (riskMap.get(entityName) || 0) + 1);
          });
        }
      }
      
      state.entityRiskMapCache = riskMap;
      return riskMap;
    }
  },

  // --- 3. 定义 Actions (方法) ---
  actions: {
    async initialize() {
      if (this.allSamplesRaw.length > 0) return; 

      this.isLoading = true;
      try {
        const [samplesRes, contextRes, explanationRes] = await Promise.all([
          fetch('/api_data_samples.json'),  
          fetch('/api_data_context.json'),  
          fetch('/api_data_explanations.json') 
        ]);
        
        this.allSamplesRaw = await samplesRes.json();
        this.allContextData = await contextRes.json();
        if (explanationRes.ok) {
          this.allExplanations = await explanationRes.json();
        }

        this.applyFilters();
        
      } catch (error) {
        console.error('加载静态 JSON 失败:', error);
      } finally {
        this.isLoading = false;
      }
    },
    
    applyFilters() {
      this.isLoading = true;
      let result = this.allSamplesRaw; // 从全量数据开始

      // 1. [新增] 检查省份筛选
      // 如果用户在地图上点击了某个省份，只保留该省份的样本
      if (this.selectedProvince) {
        console.log(`Store: 正在筛选省份: ${this.selectedProvince}`);
        result = result.filter(sample => {
          // 使用与 currentSampleRoute 相同的映射逻辑
          const pIndex = Number(sample.id) % MOCK_PROVINCES.length;
          // 这里假设筛选的是“产地”
          return MOCK_PROVINCES[pIndex] === this.selectedProvince;
        });
      }

      // 2. 检查交叉筛选 (Pivot Filter)
      if (this.pivotFilter) {
        const match = this.pivotFilter.match(/^(\w+)\[(\d+)\]$/);
        if (match) {
          const typeName = match[1];
          const entityId = parseInt(match[2], 10);
          const typeKey = typeName.toLowerCase() + (typeName.endsWith('s') ? '' : 's'); 

          result = result.filter(sample => {
            const context = this.allContextData[sample.id];
            // @ts-ignore
            return context && context[typeKey] && context[typeKey].includes(entityId);
          });
        }
      }
      
      // 3. 常规筛选
      result = result.filter(sample => {
        const {riskLevels, scoreThreshold } = this.filterOptions;
        if (riskLevels.length > 0 && !riskLevels.includes(sample.riskLevel)) return false;
        const [minScore, maxScore] = scoreThreshold;
        if (sample.score < minScore || sample.score > maxScore) return false;
        return true;
      });
      
      this.filteredSamples = result;
      this.isLoading = false;
    },

    resetFilters() {
      this.filterOptions = {
        riskLevels: [], 
        scoreThreshold: [0, 1], 
      };
      this.pivotFilter = null; 
      this.selectedProvince = null; // [新增] 重置省份
      this.selectedSampleId = null;
      
      this.applyFilters(); 
    },

    selectSample(id: string | number | null) {
      this.selectedSampleId = (this.selectedSampleId === id) ? null : id;
    },

    setPivotFilter(entityName: string | null) {
      this.pivotFilter = (this.pivotFilter === entityName) ? null : entityName;
      this.selectedSampleId = null; 
      this.applyFilters();
    },

    clearPivotFilter() {
      this.pivotFilter = null;
      this.applyFilters();
    },

    // [新增] 设置省份筛选
    setProvinceFilter(province: string | null) {
      // 如果再次点击同一个省，则取消筛选
      this.selectedProvince = (this.selectedProvince === province) ? null : province;
      
      // 切换省份时，通常清除单个样本的选择，以免逻辑冲突
      this.selectedSampleId = null; 
      
      this.applyFilters(); // 重新计算 filteredSamples
    }
  }
})