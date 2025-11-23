export interface Sample {
  id: string | number
  riskLevel: '高风险' | '中风险' | '低风险'
  score: number
  label: '合格' | '不合格'
  x: number // t-SNE 降维后的 X 坐标
  y: number // t-SNE 降维后的 Y 坐标
}

/**
 * 代表一个样本的上下文 (邻居)
 * 这是 /api/samples/{id}/context 返回的对象
 */
export interface ContextData {
  products: (string | number)[]
  markets: (string | number)[]
  farmers: (string | number)[]
  contaminants?: (string | number)[]
}

/**
 * 代表一个异常路径中的“链路”
 * 这是 /api/samples/{id}/explanation 返回的数组中的对象
 */
export interface MetaPath {
  from: string
  to: string
  weight: number
  relation: string
}

export type MetaPathChain = MetaPath[];