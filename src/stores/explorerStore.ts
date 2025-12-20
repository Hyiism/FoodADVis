import { defineStore } from 'pinia';

// 样本数据接口
export interface Sample {
  id: number;
  x: number;
  y: number;
  score: number;
  label: string;
  label_str?: string; 
  riskLevel: string;
  name: string;
  // 兼容 V10 Mock 数据生成的新字段
  production_province?: string;
  production_city?: string;
  sale_province?: string;
  sale_city?: string;
}

// 解释路径接口
export interface ExplanationLink {
  from: string;
  to: string;
  relation: string;
  weight: number;
}

// 上下文接口
export interface ContextData {
  products: (string | number)[];
  markets: (string | number)[];
  farmers: (string | number)[];
  contaminants?: (string | number)[];
}

export type MetaPathChain = ExplanationLink[];

// 过滤器配置接口
interface FilterOptions {
  riskLevels: string[];
  scoreThreshold: [number, number];
}

export const useExplorerStore = defineStore('explorer', {
  state: () => ({
    // --- 核心数据 ---
    samples: [] as Sample[],
    context: {} as Record<string, ContextData>, // 注意：Key 经常是字符串
    explanations: {} as Record<number, MetaPathChain[]>,
    
    // --- 交互状态 ---
    selectedSampleId: null as number | null,
    loading: false,
    
    // --- 过滤器状态 ---
    filterOptions: {
      riskLevels: [], 
      scoreThreshold: [0, 1]
    } as FilterOptions,
    
    pivotFilter: null as string | null,
    searchQuery: '',
    selectedProvince: null as string | null, // 省份筛选
  }),

  getters: {
    // 1. 过滤后的样本列表
    filteredSamples(state): Sample[] {
      return state.samples.filter(s => {
        const riskMatch = state.filterOptions.riskLevels.length === 0 || 
                          state.filterOptions.riskLevels.includes(s.riskLevel);
        const [minScore, maxScore] = state.filterOptions.scoreThreshold;
        const scoreMatch = s.score >= minScore && s.score <= maxScore;
        const searchMatch = state.searchQuery 
          ? (s.id.toString().includes(state.searchQuery) || (s.name && s.name.includes(state.searchQuery)))
          : true;
        const provinceMatch = state.selectedProvince 
           ? s.production_province === state.selectedProvince 
           : true;

        // Pivot 筛选 (简化版，仅作演示)
        let pivotMatch = true;
        if (state.pivotFilter) pivotMatch = true; 

        return riskMatch && scoreMatch && pivotMatch && searchMatch && provinceMatch;
      });
    },

    // 2. Top 20 异常样本 (用于 ControlPanel)
    topRankedAnomalies(state): Sample[] {
       return this.filteredSamples
        .filter(s => s.riskLevel !== '低风险') 
        .sort((a, b) => b.score - a.score) 
        .slice(0, 20); 
    },
    
    // 3. [新增] Top 20 安全样本 (用于 ControlPanel)
    topRankedSafeSamples(state): Sample[] {
      return this.filteredSamples
        .filter(s => s.riskLevel === '低风险')
        .sort((a, b) => a.score - b.score) // 分数越低越安全
        .slice(0, 20);
    },

    // 4. 当前选中样本
    selectedSample(state): Sample | undefined {
      if (state.selectedSampleId === null) return undefined;
      return state.samples.find(s => s.id === state.selectedSampleId);
    },

    // 5. [核心修复] 当前上下文 (增强鲁棒性)
    // 解决了 ID 是数字但 JSON Key 是字符串导致的 "Empty" 问题
    currentContext(state): ContextData | null {
      const id = state.selectedSampleId;
      if (id === null || id === undefined) return null;
      
      // 优先尝试直接获取
      // @ts-ignore
      let ctx = state.context[id];
      
      // 如果没找到，尝试转字符串 (Mock 数据常见情况)
      if (!ctx) {
         ctx = state.context[String(id)];
      }
      
      return ctx || null;
    },

    // 6. 当前解释路径
    currentExplanation(state): MetaPathChain[] | null {
      if (state.selectedSampleId === null) return null;
      // @ts-ignore
      return state.explanations[state.selectedSampleId] || state.explanations[String(state.selectedSampleId)] || [];
    },
    
    // 7. [新增] 当前分析模式 (风险 vs 安全)
    // ContextExplorer 依赖此属性来切换红/绿颜色
    currentAnalysisMode(state): 'risk' | 'safe' {
      if (state.selectedSampleId) {
        const sample = state.samples.find(s => s.id === state.selectedSampleId);
        if (sample && sample.riskLevel === '低风险') {
          return 'safe';
        }
      }
      return 'risk'; // 默认
    },

    // 8. [新增] 当前显示的列表 (用于 ControlPanel 动态切换)
    currentDisplayList(): Sample[] {
       if (this.currentAnalysisMode === 'safe') {
           return this.topRankedSafeSamples;
       } else {
           return this.topRankedAnomalies;
       }
    },
    
    // 9. [新增] 安全实体热点图 (用于 HotspotAnalyzer)
    entitySafetyMap(state): Map<string, number> {
      const safetyMap = new Map<string, number>();
      // 遍历所有样本，统计低风险样本的上下文
      for (const sample of state.samples) {
        if (sample.riskLevel !== '低风险') continue;
        
        // 使用兼容性查找
        const ctx = state.context[sample.id] || state.context[String(sample.id)];
        if (!ctx) continue;

        for (const [typeKey, idList] of Object.entries(ctx)) {
          // 简单的单复数处理
          const typeName = typeKey.charAt(0).toUpperCase() + (typeKey.endsWith('s') ? typeKey.slice(1, -1) : typeKey.slice(1));
          (idList as (string | number)[]).forEach((id: string | number) => {
            const entityName = `${typeName}[${id}]`;
            safetyMap.set(entityName, (safetyMap.get(entityName) || 0) + 1);
          });
        }
      }
      return safetyMap;
    },

    // 10. 风险实体热点图 (原有逻辑)
    entityRiskMap(state): Map<string, number> {
      const riskMap = new Map<string, number>();
      for (const sample of state.samples) {
        if (sample.riskLevel === '低风险') continue;
        
        const ctx = state.context[sample.id] || state.context[String(sample.id)];
        if (!ctx) continue;

        for (const [typeKey, idList] of Object.entries(ctx)) {
          const typeName = typeKey.charAt(0).toUpperCase() + (typeKey.endsWith('s') ? typeKey.slice(1, -1) : typeKey.slice(1));
          (idList as (string | number)[]).forEach((id: string | number) => {
            const entityName = `${typeName}[${id}]`;
            riskMap.set(entityName, (riskMap.get(entityName) || 0) + 1);
          });
        }
      }
      return riskMap;
    },

    // 兼容旧代码的别名
    allSamplesRaw(state): Sample[] { return state.samples; },
    selectedSampleContext(): ContextData | null { return this.currentContext; },
    allExplanations(state): Record<number, MetaPathChain[]> { return state.explanations; },
  },

  actions: {
    async initialize() {
      if (this.samples.length > 0) return;
      this.loading = true;
      try {
        console.log('正在加载数据...');
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

    selectSample(id: number | string | null) {
      if (id === null || id === '') {
        this.selectedSampleId = null;
        return;
      }
      const numId = typeof id === 'string' ? parseInt(id, 10) : id;
      this.selectedSampleId = (this.selectedSampleId === numId) ? null : numId;
    },

    applyFilters() { console.log('Filters applied'); },
    resetFilters() {
      this.filterOptions = { riskLevels: [], scoreThreshold: [0, 1] };
      this.searchQuery = '';
      this.pivotFilter = null;
      this.selectedProvince = null;
      this.selectedSampleId = null;
    },
    clearPivotFilter() { this.pivotFilter = null; },
    setPivotFilter(value: string | null) {
      this.pivotFilter = (this.pivotFilter === value) ? null : value;
      this.selectedSampleId = null; 
    },
    setProvinceFilter(province: string | null) {
        this.selectedProvince = (this.selectedProvince === province) ? null : province;
        this.selectedSampleId = null;
    }
  }
});