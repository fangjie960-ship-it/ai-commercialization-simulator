import type { StrategyType } from '@/types/customer'

/**
 * 策略库配置
 * @description 内置策略类型定义和适用场景说明
 * 修改日期：2026-04-03
 */

export interface StrategyConfig {
  type: StrategyType
  name: string
  description: string
  applicableTiers: string[]
  incentiveRateRange: {
    min: number
    max: number
  }
  typicalDuration: number // 典型持续天数
  pros: string[]
  cons: string[]
}

export const STRATEGY_LIBRARY: Record<StrategyType, StrategyConfig> = {
  waiver: {
    type: 'waiver',
    name: '免扣保证金',
    description: '豁免客户部分保证金扣除，降低资金压力',
    applicableTiers: ['warning', 'high_risk'],
    incentiveRateRange: { min: 0, max: 5 },
    typicalDuration: 30,
    pros: ['降低客户资金压力', '维护客户关系', '操作成本低'],
    cons: ['公司承担保证金风险', '无法直接刺激消耗']
  },
  short_term: {
    type: 'short_term',
    name: '短期激励',
    description: '在特定时间窗口内提供额外返点，刺激增量消耗',
    applicableTiers: ['high_potential', 'stable'],
    incentiveRateRange: { min: 3, max: 15 },
    typicalDuration: 14,
    pros: ['见效快', '针对性强', 'ROI可控'],
    cons: ['客户可能等待激励期才消耗', '需要精确时间把控']
  },
  tiered: {
    type: 'tiered',
    name: '阶梯激励',
    description: '按完成进度分阶段给予不同返点，精细化运营',
    applicableTiers: ['stable'],
    incentiveRateRange: { min: 2, max: 12 },
    typicalDuration: 90,
    pros: ['激励持续性强', '鼓励提前完成', '成本分摊可控'],
    cons: ['计算复杂', '需要持续跟踪', '客户理解成本高']
  },
  exclusive: {
    type: 'exclusive',
    name: '专属服务',
    description: '提供专属AM服务、优先审核、专属资源等非金钱激励',
    applicableTiers: ['high_potential'],
    incentiveRateRange: { min: 0, max: 0 },
    typicalDuration: 365,
    pros: ['提升客户粘性', '差异化竞争', '长期价值高'],
    cons: ['人力成本高', '难以规模化', '效果难量化']
  },
  combined: {
    type: 'combined',
    name: '组合策略',
    description: '免扣保证金 + 短期激励组合，组合拳救场',
    applicableTiers: ['high_risk'],
    incentiveRateRange: { min: 5, max: 20 },
    typicalDuration: 45,
    pros: ['多管齐下效果好', '灵活度高', '可根据情况调整'],
    cons: ['成本高', '操作复杂', '需要多部门协调']
  }
}

/**
 * 获取策略配置
 */
export function getStrategyConfig(type: StrategyType): StrategyConfig {
  return STRATEGY_LIBRARY[type]
}

/**
 * 获取策略名称
 */
export function getStrategyName(type: StrategyType): string {
  return STRATEGY_LIBRARY[type].name
}

/**
 * 获取适用某分层的所有策略
 */
export function getStrategiesForTier(tier: string): StrategyConfig[] {
  return Object.values(STRATEGY_LIBRARY).filter(s => 
    s.applicableTiers.includes(tier)
  )
}

/**
 * 获取所有策略类型列表
 */
export function getAllStrategyTypes(): StrategyType[] {
  return Object.keys(STRATEGY_LIBRARY) as StrategyType[]
}
