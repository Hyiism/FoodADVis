// import { defineStore } from 'pinia';

// // 样本数据接口
// export interface Sample {
//   id: number;
//   x: number;
//   y: number;
//   score: number;
//   label: string;
//   label_str?: string; 
//   riskLevel: string;
//   name: string;
//   // 兼容 V10 Mock 数据生成的新字段
//   production_province?: string;
//   production_city?: string;
//   sale_province?: string;
//   sale_city?: string;
// }

// // 解释路径接口
// export interface ExplanationLink {
//   from: string;
//   to: string;
//   relation: string;
//   weight: number;
// }

// // 上下文接口
// export interface ContextData {
//   products: (string | number)[];
//   markets: (string | number)[];
//   farmers: (string | number)[];
//   contaminants?: (string | number)[];
// }

// export type MetaPathChain = ExplanationLink[];

// // 过滤器配置接口
// interface FilterOptions {
//   riskLevels: string[];
//   scoreThreshold: [number, number];
// }

// export const useExplorerStore = defineStore('explorer', {
//   state: () => ({
//     // --- 核心数据 ---
//     samples: [] as Sample[],
//     context: {} as Record<string, ContextData>, // 注意：Key 经常是字符串
//     explanations: {} as Record<number, MetaPathChain[]>,
    
//     // --- 交互状态 ---
//     selectedSampleId: null as number | null,
//     loading: false,
    
//     // --- 过滤器状态 ---
//     filterOptions: {
//       riskLevels: [], 
//       scoreThreshold: [0, 1]
//     } as FilterOptions,
    
//     pivotFilter: null as string | null,
//     searchQuery: '',
//     selectedProvince: null as string | null, // 省份筛选
//   }),

//   getters: {
//     // 1. 过滤后的样本列表
//     filteredSamples(state): Sample[] {
//       return state.samples.filter(s => {
//         const riskMatch = state.filterOptions.riskLevels.length === 0 || 
//                           state.filterOptions.riskLevels.includes(s.riskLevel);
//         const [minScore, maxScore] = state.filterOptions.scoreThreshold;
//         const scoreMatch = s.score >= minScore && s.score <= maxScore;
//         const searchMatch = state.searchQuery 
//           ? (s.id.toString().includes(state.searchQuery) || (s.name && s.name.includes(state.searchQuery)))
//           : true;
//         const provinceMatch = state.selectedProvince 
//            ? s.production_province === state.selectedProvince 
//            : true;

//         // Pivot 筛选 (简化版，仅作演示)
//         let pivotMatch = true;
//         if (state.pivotFilter) pivotMatch = true; 

//         return riskMatch && scoreMatch && pivotMatch && searchMatch && provinceMatch;
//       });
//     },

//     // 2. Top 20 异常样本 (用于 ControlPanel)
//     topRankedAnomalies(state): Sample[] {
//        return this.filteredSamples
//         .filter(s => s.riskLevel !== '低风险') 
//         .sort((a, b) => b.score - a.score) 
//         .slice(0, 20); 
//     },
    
//     // 3. [新增] Top 20 安全样本 (用于 ControlPanel)
//     topRankedSafeSamples(state): Sample[] {
//       return this.filteredSamples
//         .filter(s => s.riskLevel === '低风险')
//         .sort((a, b) => a.score - b.score) // 分数越低越安全
//         .slice(0, 20);
//     },

//     // 4. 当前选中样本
//     selectedSample(state): Sample | undefined {
//       if (state.selectedSampleId === null) return undefined;
//       return state.samples.find(s => s.id === state.selectedSampleId);
//     },

//     // 5. [核心修复] 当前上下文 (增强鲁棒性)
//     // 解决了 ID 是数字但 JSON Key 是字符串导致的 "Empty" 问题
//     currentContext(state): ContextData | null {
//       const id = state.selectedSampleId;
//       if (id === null || id === undefined) return null;
      
//       // 优先尝试直接获取
//       // @ts-ignore
//       let ctx = state.context[id];
      
//       // 如果没找到，尝试转字符串 (Mock 数据常见情况)
//       if (!ctx) {
//          ctx = state.context[String(id)];
//       }
      
//       return ctx || null;
//     },

//     // 6. 当前解释路径
//     currentExplanation(state): MetaPathChain[] | null {
//       if (state.selectedSampleId === null) return null;
//       // @ts-ignore
//       return state.explanations[state.selectedSampleId] || state.explanations[String(state.selectedSampleId)] || [];
//     },
    
//     // 7. [新增] 当前分析模式 (风险 vs 安全)
//     // ContextExplorer 依赖此属性来切换红/绿颜色
//     currentAnalysisMode(state): 'risk' | 'safe' {
//       if (state.selectedSampleId) {
//         const sample = state.samples.find(s => s.id === state.selectedSampleId);
//         if (sample && sample.riskLevel === '低风险') {
//           return 'safe';
//         }
//       }
//       return 'risk'; // 默认
//     },

//     // 8. [新增] 当前显示的列表 (用于 ControlPanel 动态切换)
//     currentDisplayList(): Sample[] {
//        if (this.currentAnalysisMode === 'safe') {
//            return this.topRankedSafeSamples;
//        } else {
//            return this.topRankedAnomalies;
//        }
//     },
    
//     // 9. [新增] 安全实体热点图 (用于 HotspotAnalyzer)
//     entitySafetyMap(state): Map<string, number> {
//       const safetyMap = new Map<string, number>();
//       // 遍历所有样本，统计低风险样本的上下文
//       for (const sample of state.samples) {
//         if (sample.riskLevel !== '低风险') continue;
        
//         // 使用兼容性查找
//         const ctx = state.context[sample.id] || state.context[String(sample.id)];
//         if (!ctx) continue;

//         for (const [typeKey, idList] of Object.entries(ctx)) {
//           // 简单的单复数处理
//           const typeName = typeKey.charAt(0).toUpperCase() + (typeKey.endsWith('s') ? typeKey.slice(1, -1) : typeKey.slice(1));
//           (idList as (string | number)[]).forEach((id: string | number) => {
//             const entityName = `${typeName}[${id}]`;
//             safetyMap.set(entityName, (safetyMap.get(entityName) || 0) + 1);
//           });
//         }
//       }
//       return safetyMap;
//     },

//     // 10. 风险实体热点图 (原有逻辑)
//     entityRiskMap(state): Map<string, number> {
//       const riskMap = new Map<string, number>();
//       for (const sample of state.samples) {
//         if (sample.riskLevel === '低风险') continue;
        
//         const ctx = state.context[sample.id] || state.context[String(sample.id)];
//         if (!ctx) continue;

//         for (const [typeKey, idList] of Object.entries(ctx)) {
//           const typeName = typeKey.charAt(0).toUpperCase() + (typeKey.endsWith('s') ? typeKey.slice(1, -1) : typeKey.slice(1));
//           (idList as (string | number)[]).forEach((id: string | number) => {
//             const entityName = `${typeName}[${id}]`;
//             riskMap.set(entityName, (riskMap.get(entityName) || 0) + 1);
//           });
//         }
//       }
//       return riskMap;
//     },

//     // 兼容旧代码的别名
//     allSamplesRaw(state): Sample[] { return state.samples; },
//     selectedSampleContext(): ContextData | null { return this.currentContext; },
//     allExplanations(state): Record<number, MetaPathChain[]> { return state.explanations; },
//   },

//   actions: {
//     async initialize() {
//       if (this.samples.length > 0) return;
//       this.loading = true;
//       try {
//         console.log('正在加载数据...');
//         const [resSamples, resContext, resExplain] = await Promise.all([
//           fetch('/api_data_samples.json'),
//           fetch('/api_data_context.json'),
//           fetch('/api_data_explanations.json')
//         ]);

//         if (resSamples.ok) this.samples = await resSamples.json();
//         if (resContext.ok) this.context = await resContext.json();
//         if (resExplain.ok) this.explanations = await resExplain.json();
//         console.log('数据加载完成');
//       } catch (error) {
//         console.error('初始化数据失败:', error);
//       } finally {
//         this.loading = false;
//       }
//     },

//     selectSample(id: number | string | null) {
//       if (id === null || id === '') {
//         this.selectedSampleId = null;
//         return;
//       }
//       const numId = typeof id === 'string' ? parseInt(id, 10) : id;
//       this.selectedSampleId = (this.selectedSampleId === numId) ? null : numId;
//     },

//     applyFilters() { console.log('Filters applied'); },
//     resetFilters() {
//       this.filterOptions = { riskLevels: [], scoreThreshold: [0, 1] };
//       this.searchQuery = '';
//       this.pivotFilter = null;
//       this.selectedProvince = null;
//       this.selectedSampleId = null;
//     },
//     clearPivotFilter() { this.pivotFilter = null; },
//     setPivotFilter(value: string | null) {
//       this.pivotFilter = (this.pivotFilter === value) ? null : value;
//       this.selectedSampleId = null; 
//     },
//     setProvinceFilter(province: string | null) {
//         this.selectedProvince = (this.selectedProvince === province) ? null : province;
//         this.selectedSampleId = null;
//     }
//   }
// });

import { defineStore } from 'pinia';

// --- 1. 类型定义 ---

// 样本数据接口
export interface Sample {
  id: number;
  x: number;
  y: number;
  score: number;
  label: string;
  label_str?: string; 
  riskLevel: string; // "高风险" | "中风险" | "低风险"
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
  from_label?: string; 
  to_label?: string;
}

// 上下文接口
export interface ContextData {
  products: (string | number)[];
  markets: (string | number)[];
  farmers: (string | number)[];
  contaminants?: (string | number)[];
  stats?: { 
    farmer_vol?: number;
    market_vol?: number;
  };
}

export type MetaPathChain = ExplanationLink[];

// 过滤器配置接口
interface FilterOptions {
  riskLevels: string[];
  scoreThreshold: [number, number];
}

// --- 2. Store 定义 ---

export const useExplorerStore = defineStore('explorer', {
  state: () => ({
    // --- 核心数据 ---
    samples: [] as Sample[],
    context: {} as Record<string, ContextData>, // ID 可能是数字或字符串 Key
    explanations: {} as Record<number, MetaPathChain[]>,
    
    // --- 交互状态 ---
    selectedSampleId: null as number | null,
    loading: false,
    
    // [核心] 视图模式：支持 'all' (默认), 'risk', 'safe'
    viewMode: 'all' as 'all' | 'risk' | 'safe', 
    
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
    // 1. [核心逻辑] 当前分析模式 (用于 UI 主题色、组件显隐)
    // 逻辑：如果选中了样本，以样本实际风险为准；否则以用户手动选择的 viewMode 为准
    currentAnalysisMode(state): 'all' | 'risk' | 'safe' {
      if (state.selectedSampleId) {
        const sample = state.samples.find(s => s.id === state.selectedSampleId);
        if (sample) return sample.riskLevel === '低风险' ? 'safe' : 'risk';
      }
      return state.viewMode;
    },

    // 2. [核心逻辑] 过滤后的样本列表 (用于 EmbeddingView 绘图)
    // 逻辑：基于 viewMode 进行“硬过滤”，再应用 score/search 等“软过滤”
    filteredSamples(state): Sample[] {
      let baseSamples = state.samples;
      
      // Step A: 视图模式硬过滤
      if (state.viewMode === 'safe') {
        baseSamples = state.samples.filter(s => s.riskLevel === '低风险');
      } else if (state.viewMode === 'risk') {
        baseSamples = state.samples.filter(s => s.riskLevel !== '低风险');
      } 
      // case 'all': 不做过滤，保留全部
      
      // Step B: 应用通用过滤器
      return baseSamples.filter(s => {
        // 风险等级筛选 (如果用户在 filterOptions 里选了特定的)
        const riskMatch = state.filterOptions.riskLevels.length === 0 || 
                          state.filterOptions.riskLevels.includes(s.riskLevel);
        
        // 分数筛选
        const [minScore, maxScore] = state.filterOptions.scoreThreshold;
        const scoreMatch = s.score >= minScore && s.score <= maxScore;
        
        // 搜索筛选
        const searchMatch = state.searchQuery 
          ? (s.id.toString().includes(state.searchQuery) || (s.name && s.name.includes(state.searchQuery)))
          : true;
        
        // 省份筛选
        const provinceMatch = state.selectedProvince 
           ? s.production_province === state.selectedProvince 
           : true;

        // Pivot 筛选 (简化版，实际逻辑可能更复杂)
        const pivotMatch = true; 
        
        return riskMatch && scoreMatch && pivotMatch && searchMatch && provinceMatch;
      });
    },

    // 3. Top 20 异常样本
    topRankedAnomalies(state): Sample[] {
       // 注意：从 filteredSamples 取，这样能响应分数条的拖动
       return this.filteredSamples
        .filter(s => s.riskLevel !== '低风险') 
        .sort((a, b) => b.score - a.score) 
        .slice(0, 20); 
    },
    
    // 4. Top 20 安全样本
    topRankedSafeSamples(state): Sample[] {
      return this.filteredSamples
        .filter(s => s.riskLevel === '低风险')
        .sort((a, b) => a.score - b.score) // 安全样本看低分 (接近0)
        .slice(0, 20);
    },

    // 5. [核心逻辑] 当前显示的列表 (用于 ControlPanel 侧边栏)
    currentDisplayList(): Sample[] {
       if (this.currentAnalysisMode === 'safe') {
           return this.topRankedSafeSamples;
       } else if (this.currentAnalysisMode === 'risk') {
           return this.topRankedAnomalies;
       } else {
           // 'all' 模式下，默认展示异常样本 (Top Risks)，因为这是用户最关心的
           // 也可以根据需求返回混合列表
           return this.topRankedAnomalies;
       }
    },

    // 6. 当前选中样本对象
    selectedSample(state): Sample | undefined {
      if (state.selectedSampleId === null) return undefined;
      return state.samples.find(s => s.id === state.selectedSampleId);
    },

    // 7. 当前上下文 (增强鲁棒性，处理 ID 类型不一致)
    currentContext(state): ContextData | null {
      const id = state.selectedSampleId;
      if (id === null || id === undefined) return null;
      
      // 优先尝试直接获取
      // @ts-ignore
      let ctx = state.context[id];
      // 尝试转字符串
      if (!ctx) ctx = state.context[String(id)];
      
      return ctx || null;
    },

    // 8. 当前解释路径
    currentExplanation(state): MetaPathChain[] | null {
      if (state.selectedSampleId === null) return null;
      // @ts-ignore
      return state.explanations[state.selectedSampleId] || state.explanations[String(state.selectedSampleId)] || [];
    },

    // 9. 实体热点图 (用于 SafetyRadar)
    entitySafetyMap(state): Map<string, number> {
      const safetyMap = new Map<string, number>();
      // 使用 filteredSamples 还是 samples 取决于是否希望排行榜随筛选变化
      // 这里使用 filteredSamples 以实现“所见即所得”
      const source = this.filteredSamples.length > 0 ? this.filteredSamples : state.samples;

      for (const sample of source) {
        // 只统计低风险样本
        if (sample.riskLevel !== '低风险') continue;
        
        const ctx = state.context[sample.id] || state.context[String(sample.id)];
        if (!ctx) continue;

        // 聚合所有实体
        const entities = [
           ...(ctx.farmers || []), 
           ...(ctx.markets || []), 
           ...(ctx.products || [])
        ];
        
        entities.forEach(entity => {
           const key = String(entity);
           safetyMap.set(key, (safetyMap.get(key) || 0) + 1);
        });
      }
      return safetyMap;
    },
    
    // 兼容旧代码的 Getter 别名
    allSamplesRaw(state): Sample[] { return state.samples; },
    selectedSampleContext(): ContextData | null { return this.currentContext; },
    allExplanations(state): Record<number, MetaPathChain[]> { return state.explanations; },
  },

  actions: {
    // 初始化数据
    async initialize() {
      if (this.samples.length > 0) return;
      this.loading = true;
      try {
        console.log('ExplorerStore: Loading data...');
        const [resSamples, resContext, resExplain] = await Promise.all([
          fetch('/api_data_samples.json'),
          fetch('/api_data_context.json'),
          fetch('/api_data_explanations.json')
        ]);

        if (resSamples.ok) this.samples = await resSamples.json();
        if (resContext.ok) this.context = await resContext.json();
        if (resExplain.ok) this.explanations = await resExplain.json();
        console.log('ExplorerStore: Data loaded.');
      } catch (error) {
        console.error('ExplorerStore: Init failed', error);
      } finally {
        this.loading = false;
      }
    },

    // 选中样本
    selectSample(id: number | string | null) {
      if (id === null || id === '') {
        this.selectedSampleId = null;
        return;
      }
      const numId = typeof id === 'string' ? parseInt(id, 10) : id;
      // 简单的切换逻辑：点同一个则取消选中
      this.selectedSampleId = (this.selectedSampleId === numId) ? null : numId;
    },

    // [核心操作] 切换分析模式
    setAnalysisMode(mode: 'all' | 'risk' | 'safe') {
      this.viewMode = mode;
      this.selectedSampleId = null; // 切换模式时清空选中，避免状态冲突
      this.resetFilters();          // 重置过滤器，提供干净的视图
    },

    applyFilters() { console.log('Filters applied'); },
    
    resetFilters() {
      this.filterOptions = { riskLevels: [], scoreThreshold: [0, 1] };
      this.searchQuery = '';
      this.pivotFilter = null;
      this.selectedProvince = null;
      // 注意：这里不重置 viewMode，保留用户当前所在的 Tab
    },

    clearPivotFilter() { this.pivotFilter = null; },
    
    setPivotFilter(value: string | null) {
      this.pivotFilter = (this.pivotFilter === value) ? null : value;
      this.selectedSampleId = null; 
    },
    
    setProvinceFilter(province: string | null) {
        this.selectedProvince = (this.selectedProvince === province) ? null : province;
        this.selectedSampleId = null;
    },


    findBestRiskCase() {
      // 1. 只看高风险样本 (Score > 0.8)
      const candidates = this.samples.filter(s => s.score > 0.8);
      
      // 2. 给每个样本打分 (Relevance Score)
      const scoredCandidates = candidates.map(sample => {
        let qualityScore = 0;
        const idStr = String(sample.id);
        
        // A. 基础分：风险越高越好
        qualityScore += sample.score * 10; 

        // B. 路径丰富度 (核心)
        // 获取该样本的解释路径
        // @ts-ignore
        const explanation = this.explanations[sample.id] || this.explanations[idStr];
        const paths = (explanation && explanation.paths) ? explanation.paths : (Array.isArray(explanation) ? explanation : []);

        if (paths.length > 0) {
          // 路径越多，说明线索越多
          qualityScore += paths.length * 2; 

          // 检查路径里是否包含关键节点
          const jsonStr = JSON.stringify(paths);
          // 如果包含了“Contaminant (污染物)”，加重分！这是风险溯源的核心
          if (jsonStr.includes('Contaminant') || jsonStr.includes('Contam')) qualityScore += 20;
          // 如果能溯源到“Farmer (农户)”，加分！
          if (jsonStr.includes('Farmer')) qualityScore += 15;
          // 如果能关联到“Market (市场)”，加分！
          if (jsonStr.includes('Market')) qualityScore += 5;
        }

        // C. 数据完整性 (Context)
        // @ts-ignore
        const ctx = this.context[idStr];
        if (ctx) {
          // 如果名字很长(说明是真实名字而不是 ID)，加分，演示起来好看
          if (ctx.farmers?.[0] && String(ctx.farmers[0]).length > 4) qualityScore += 5;
          if (ctx.markets?.[0] && String(ctx.markets[0]).length > 4) qualityScore += 5;
        }

        return { sample, qualityScore };
      });

      // 3. 按质量分降序排列
      scoredCandidates.sort((a, b) => b.qualityScore - a.qualityScore);

      // 4. 返回前 5 个最好的案例
      return scoredCandidates.slice(0, 5).map(item => item.sample);
    }
  }
});