import type { Customer, Policy } from '@/types/customer'

/**
 * 政策进度计算（纯函数）
 * @description 基于客户日流水 + 政策信息，计算政策执行进度，无需系统接口
 * 修改日期：2026-08-19
 */

export interface PolicyProgress {
  elapsedDays: number
  totalDays: number
  timeProgress: number // 0-1，政策时间进度
  actualSpend: number // 政策期内实际消耗（万）
  baseline: number // 基期日均 × 已过天数
  actualIncremental: number // 实际增量 = max(0, 实际 - 基线)
  targetConsumption: number // 目标日均 × 已过天数（短期政策）
  consumptionProgress: number // 实际消耗 / 目标消耗
  incrementalProgress: number // 实际增量 / 要求增量
  status: 'done' | 'ahead' | 'on_track' | 'behind'
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * 计算政策进度
 * @param policy 政策
 * @param customer 客户（需要 dailySpend）
 * @param today 参考日期，默认今天
 */
export function calcPolicyProgress(policy: Policy, customer: Customer, today: Date = new Date()): PolicyProgress {
  const start = new Date(policy.startDate)
  const end = new Date(policy.endDate)
  const totalDays = Math.max(1, dayDiff(start, end))
  const elapsed = Math.max(0, Math.min(dayDiff(start, today), totalDays))

  // 政策期内实际消耗（截至今天）
  const cutoff = today > end ? end : today
  const actualSpend = customer.dailySpend
    .filter(d => {
      const dt = new Date(d.date)
      return dt >= start && dt <= cutoff
    })
    .reduce((sum, d) => sum + d.amount, 0)

  // 基线：基期日均 × 已过天数；增量 = 实际 - 基线
  const baseline = policy.baseDaily * elapsed
  const actualIncremental = Math.max(0, actualSpend - baseline)

  const targetConsumption = policy.targetDaily * elapsed
  const consumptionProgress = targetConsumption > 0 ? actualSpend / targetConsumption : 0
  const incrementalProgress = policy.requiredIncremental > 0 ? actualIncremental / policy.requiredIncremental : 0
  const timeProgress = elapsed / totalDays

  let status: PolicyProgress['status']
  if (elapsed >= totalDays) {
    status = 'done'
  } else if (incrementalProgress >= 1) {
    status = 'ahead'
  } else if (timeProgress >= 0.7 && incrementalProgress < timeProgress - 0.15) {
    status = 'behind'
  } else {
    status = 'on_track'
  }

  return {
    elapsedDays: elapsed,
    totalDays,
    timeProgress: parseFloat(timeProgress.toFixed(2)),
    actualSpend: parseFloat(actualSpend.toFixed(1)),
    baseline: parseFloat(baseline.toFixed(1)),
    actualIncremental: parseFloat(actualIncremental.toFixed(1)),
    targetConsumption: parseFloat(targetConsumption.toFixed(1)),
    consumptionProgress: parseFloat(consumptionProgress.toFixed(2)),
    incrementalProgress: parseFloat(incrementalProgress.toFixed(2)),
    status,
  }
}