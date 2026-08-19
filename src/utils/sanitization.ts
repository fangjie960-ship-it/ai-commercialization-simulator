import type { Customer, ContractScale } from '@/types/customer'

/**
 * 脱敏工具函数
 * @description 用于将客户敏感数据转换为可安全发送给 LLM 的格式
 * 修改日期：2026-04-03
 */

/**
 * 框架金额分桶
 * 脱敏规则：<500万=small，500-2000万=medium，>2000万=large
 */
export function getContractScale(amount: number): ContractScale {
  if (amount < 500) return 'small'
  if (amount <= 2000) return 'medium'
  return 'large'
}

/**
 * 趋势方向档位化
 * 脱敏规则：将斜率转换为趋势档位描述
 */
export function getTrendBucket(slope: number): 'rising' | 'stable' | 'falling' {
  if (slope > 0.1) return 'rising'
  if (slope < -0.1) return 'falling'
  return 'stable'
}

/**
 * 生成脱敏客户标识
 * 格式：customer_{tier}_{index}
 */
export function getAnonymousId(tier: string, index: number): string {
  return `customer_${tier}_${index}`
}

/**
 * 构建脱敏后的客户数据对象
 * 发送给 LLM 的数据必须通过此函数处理
 */
export function sanitizeCustomerForLLM(
  customer: Customer,
  tier: string,
  index: number
): {
  id: string
  tier: string
  industry: string
  contractScale: ContractScale
  trendDirection: string
  completionRate: number
  remainingDays: number
} {
  return {
    id: getAnonymousId(tier, index),
    tier,
    industry: customer.industry,
    contractScale: getContractScale(customer.contractAmount),
    trendDirection: 'stable', // 实际应由趋势计算得出
    completionRate: (customer.completedAmount / customer.contractAmount) * 100,
    remainingDays: Math.ceil(
      (new Date(customer.expireDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
  }
}
