import type { CustomerTier } from '@/types/customer'

/**
 * 分层规则配置
 * @description 客户分层评分规则和阈值配置
 * 修改日期：2026-04-03
 */

export interface TierRule {
  minScore: number
  maxScore: number
  label: string
  color: string
  bgColor: string
  description: string
}

export const TIER_RULES: Record<CustomerTier, TierRule> = {
  high_potential: {
    minScore: 75,
    maxScore: 100,
    label: '高潜客户',
    color: '#22c55e', // green-500
    bgColor: 'bg-green-500',
    description: '完成率高、增长态势好'
  },
  stable: {
    minScore: 50,
    maxScore: 75,
    label: '稳定客户',
    color: '#3b82f6', // blue-500
    bgColor: 'bg-blue-500',
    description: '完成率中等，趋势平稳'
  },
  warning: {
    minScore: 25,
    maxScore: 50,
    label: '预警客户',
    color: '#f59e0b', // yellow-500
    bgColor: 'bg-yellow-500',
    description: '完成率偏低，有下滑风险'
  },
  high_risk: {
    minScore: 0,
    maxScore: 25,
    label: '高风险客户',
    color: '#ef4444', // red-500
    bgColor: 'bg-red-500',
    description: '完成率极低，大概率无法完成'
  }
}

/**
 * 强制分层触发条件（覆盖评分规则）
 */
export const FORCED_TIER_CONDITIONS = {
  high_risk: {
    // 完成率<30% 且 剩余天数<60天 → 强制高风险
    completionRateMax: 30,
    remainingDaysMax: 60
  },
  warning: {
    // 完成率<50% 或 趋势下降
    completionRateMax: 50,
    trendDirection: 'falling' as const
  }
}

/**
 * 评分权重配置
 * 加权规则：完成率(40%) + 趋势(30%) + 时间充裕度(20%) + 行业系数(10%)
 */
export const SCORE_WEIGHTS = {
  completionRate: 0.4,
  trend: 0.3,
  timeBuffer: 0.2,
  industry: 0.1
}

/**
 * 获取分层标签
 */
export function getTierLabel(tier: CustomerTier): string {
  return TIER_RULES[tier].label
}

/**
 * 获取分层颜色
 */
export function getTierColor(tier: CustomerTier): string {
  return TIER_RULES[tier].color
}

/**
 * 获取分层背景色类名
 */
export function getTierBgClass(tier: CustomerTier): string {
  return TIER_RULES[tier].bgColor
}
