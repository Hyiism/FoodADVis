import { defineStore } from 'pinia';

// 样本数据接口
export interface Sample {
  id: number;
  x: number;
  y: number;
  score: number;
  label: string;
  label_str?: string; // 兼容后端可能生成的字段
  riskLevel: string;
  name: string;
  // Additional fields as per your project requirements
  production_province?: string;
  production_city?: string;
  sale_province?: string;
  sale_city?: string;
}

// 解释路径接口
interface ExplanationLink {
  from: string;
  to: string;
  relation: string;
  weight: number;
}

// 过滤器配置接口
interface FilterOptions {
  riskLevels: string[];
  scoreThreshold: [number, number];
}

// 上下文数据接口
export interface ContextData {
  products: (string | number)[];
  markets: (string | number)[];
  farmers: (string | number)[];
  contaminants?: (string | number)[];
}

export type MetaPathChain = ExplanationLink[];


export const useExplorerStore = defineStore('explorer', {
  state: () => ({
    // --- 核心数据 ---
    samples: [] as Sample[],
    // Context data mapped by sample ID
    context: {} as Record<number, ContextData>,
    // Explanations mapped by sample ID
    explanations: {} as Record<number, MetaPathChain[]>, 
    
    // --- 交互状态 ---
    selectedSampleId: null as number | null,
    loading: false,
    
    // --- 过滤器状态 (适配 ControlPanel.vue) ---
    filterOptions: {
      riskLevels: [], // 空数组表示全选/不筛选
      scoreThreshold: [0, 1]
    } as FilterOptions,
    
    // 枢纽过滤器 (Pivot Filter) - 用于上下文筛选
    pivotFilter: null as string | null,
    
    // 搜索关键词
    searchQuery: '',
    
    // 省份筛选
    selectedProvince: null as string | null,
  }),

  getters: {
    // 1. 过滤后的样本列表 (核心 Getter)
    filteredSamples(state): Sample[] {
      return state.samples.filter(s => {
        // A. 风险等级筛选
        const riskMatch = state.filterOptions.riskLevels.length === 0 || 
                          state.filterOptions.riskLevels.includes(s.riskLevel);
        
        // B. 分数范围筛选
        const [minScore, maxScore] = state.filterOptions.scoreThreshold;
        const scoreMatch = s.score >= minScore && s.score <= maxScore;

        // C. 枢纽筛选 (Pivot)
        let pivotMatch = true;
        if (state.pivotFilter) {
             const match = state.pivotFilter.match(/^(\w+)\[(\d+)\]$/);
             if (match) {
                 const typeName = match[1];
                 const entityId = parseInt(match[2], 10);
                 // Convert typeName to the key used in context object (e.g., 'Farmer' -> 'farmers')
                 // Simple pluralization for this logic:
                 const typeKey = typeName.toLowerCase() + (typeName.endsWith('s') ? '' : 's');
                 
                 const context = state.context[s.id];
                 // Check if the entity ID exists in the specific context array
                 // Using 'any' cast for context[typeKey] as strict typing might require mapped types
                 if (!context || !(context as any)[typeKey] || !(context as any)[typeKey].includes(entityId)) {
                     pivotMatch = false;
                 }
             }
        }
        
        // D. 搜索筛选
        const searchMatch = state.searchQuery 
          ? (s.id.toString().includes(state.searchQuery) || (s.name && s.name.includes(state.searchQuery)))
          : true;

        // E. 省份筛选
        const provinceMatch = state.selectedProvince 
           ? s.production_province === state.selectedProvince 
           : true;

        return riskMatch && scoreMatch && pivotMatch && searchMatch && provinceMatch;
      });
    },

    // 2. Top 20 异常样本 (适配 ControlPanel.vue)
    // 用于 "Top 20 Anomalies" 下拉框
    topRankedAnomalies(state): Sample[] {
      // 依赖 filteredSamples 确保列表与当前筛选一致，或者依赖原始 samples
      // 这里通常依赖 filteredSamples 更有交互意义，或者取全量的高风险
      // 按照原逻辑，取 filteredSamples 中非低风险的前20
       return this.filteredSamples
        .filter(s => s.riskLevel !== '低风险') 
        .sort((a, b) => b.score - a.score) 
        .slice(0, 20); 
    },
    
    // 2.1 Top 20 安全样本
    topRankedSafeSamples(state): Sample[] {
      return this.filteredSamples
        .filter(s => s.riskLevel === '低风险')
        .sort((a, b) => a.score - b.score) 
        .slice(0, 20);
    },

    // 3. 当前选中样本
    selectedSample(state): Sample | undefined {
      if (state.selectedSampleId === null) return undefined;
      return state.samples.find(s => s.id === state.selectedSampleId);
    },

    // 4. 当前上下文 (右侧面板)
    currentContext(state): ContextData | null {
      if (state.selectedSampleId === null) return null;
      return state.context[state.selectedSampleId] || null;
    },
    
    // Alias for compatibility if needed
    selectedSampleContext(): ContextData | null {
        return this.currentContext;
    },

    // 5. 当前解释路径 (底部图表)
    currentExplanation(state): MetaPathChain[] | null {
      if (state.selectedSampleId === null) return null;
      return state.explanations[state.selectedSampleId] || [];
    },
    
    // Alias for compatibility
    selectedSampleMetaPath(): MetaPathChain[] | null {
        return this.currentExplanation;
    },
    
    // 6. 当前分析模式 ('risk' or 'safe')
    currentAnalysisMode(state): 'risk' | 'safe' {
      if (state.selectedSampleId) {
        const sample = state.samples.find(s => s.id === state.selectedSampleId);
        if (sample && sample.riskLevel === '低风险') {
          return 'safe';
        }
      }
      return 'risk';
    },

    // 7. 当前显示的列表 (根据模式动态切换)
    currentDisplayList(): Sample[] {
       if (this.currentAnalysisMode === 'safe') {
           return this.topRankedSafeSamples;
       } else {
           return this.topRankedAnomalies;
       }
    },
    
    // 8. 兼容性: 全量原始数据 (供其他组件使用)
    allSamplesRaw(state): Sample[] {
        return state.samples;
    },
    allContextData(state): Record<number, ContextData> {
        return state.context;
    },
    allExplanations(state): Record<number, MetaPathChain[]> {
        return state.explanations;
    },

    // [新增] 安全实体热点图：统计实体关联了多少个【低风险】样本
    entitySafetyMap(state): Map<string, number> {
      const safetyMap = new Map<string, number>();
      if (!state.samples || !state.context) return safetyMap;

      for (const sample of state.samples) {
        // 只统计低风险样本
        if (sample.riskLevel !== '低风险') continue;
        
        const context = state.context[sample.id];
        if (!context) continue;

        for (const [typeKey, idList] of Object.entries(context)) {
          const typeName = typeKey.charAt(0).toUpperCase() + (typeKey.endsWith('s') ? typeKey.slice(1, -1) : typeKey.slice(1));
          (idList as (string | number)[]).forEach((id: string | number) => {
            const entityName = `${typeName}[${id}]`;
            safetyMap.set(entityName, (safetyMap.get(entityName) || 0) + 1);
          });
        }
      }
      return safetyMap;
    },
  },

  actions: {
    // --- 初始化数据 ---
    async initialize() {
      if (this.samples.length > 0) return; // Prevent reload if data exists
      
      this.loading = true;
      try {
        console.log('正在加载数据...');
        
        // 并行加载所有数据文件
        const [resSamples, resContext, resExplain] = await Promise.all([
          fetch('/api_data_samples.json'),
          fetch('/api_data_context.json'),
          fetch('/api_data_explanations.json')
        ]);

        if (resSamples.ok) this.samples = await resSamples.json();
        if (resContext.ok) this.context = await resContext.json();
        if (resExplain.ok) this.explanations = await resExplain.json();
        
        console.log('数据加载完成');
      } catch (error) {
        console.error('初始化数据失败:', error);
      } finally {
        this.loading = false;
      }
    },

    // --- 交互 Action ---
    selectSample(id: number | string | null) {
      if (id === null || id === '') {
        this.selectedSampleId = null;
        return;
      }
      // 确保 id 是数字
      const numId = typeof id === 'string' ? parseInt(id, 10) : id;
      
      if (this.selectedSampleId === numId) {
        this.selectedSampleId = null; // 反选
      } else {
        this.selectedSampleId = numId;
      }
    },

    // --- 过滤器 Action (适配 ControlPanel.vue) ---
    applyFilters() {
      // Vue's reactivity handles the getter updates.
      // This action can be used for logging or triggering side effects.
      console.log('Filters applied:', this.filterOptions);
    },

    resetFilters() {
      this.filterOptions = {
        riskLevels: [],
        scoreThreshold: [0, 1]
      };
      this.searchQuery = '';
      this.pivotFilter = null;
      this.selectedProvince = null;
      this.selectedSampleId = null;
    },

    clearPivotFilter() {
      this.pivotFilter = null;
      // Optionally reset sample selection if tied to pivot
      // this.selectedSampleId = null; 
    },
    
    // 设置 Pivot (供其他组件调用)
    setPivotFilter(value: string | null) {
      // Toggle if clicking the same one
      if (this.pivotFilter === value) {
          this.pivotFilter = null;
      } else {
          this.pivotFilter = value;
      }
      this.selectedSampleId = null; // Reset selection on filter change
    },
    
    // 设置省份筛选
    setProvinceFilter(province: string | null) {
        if (this.selectedProvince === province) {
            this.selectedProvince = null;
        } else {
            this.selectedProvince = province;
        }
        this.selectedSampleId = null;
    }
  }
});