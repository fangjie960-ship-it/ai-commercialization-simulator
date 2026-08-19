/**
 * ROI 计算工具函数
 * @description 策略 ROI 计算和敏感性分析
 * 修改日期：2026-04-03
 */

import type { ROISimulation, StrategyType } from '@/types/customer'
import { getStrategyConfig } from '@/config/strategyLibrary'

/**
 * ROI 计算
 * 公式：ROI = 增量消耗 / 激励成本
 */
export function calculateROI(
  incrementalSpend: number,
  incentiveCost: number
): number {
  if (incentiveCost <= 0) return 0
  return parseFloat((incrementalSpend / incentiveCost).toFixed(2))
}

/**
 * 激励成本计算
 * 公式：激励成本 = 预期增量消耗 × 返点比例
 */
export function calculateIncentiveCost(
  incrementalSpend: number,
  incentiveRate: number
): number {
  return incrementalSpend * (incentiveRate / 100)
}

/**
 * 预测增量消耗
 * 基于激励比例和行业系数调整
 */
export function predictIncrementalSpend(
  baseSpend: number, // 基础日均消耗
  days: number,
  incentiveRate: number,
  industryCoefficient: number = 1.0,
  tierMultiplier: number = 1.0
): number {
  // 激励弹性系数：假设每 1% 返点带来 0.5% 的消耗增长
  const incentiveElasticity = 0.5
  const boostRate = incentiveRate * incentiveElasticity / 100
  
  // 基础预测增量
  const baseIncremental = baseSpend * days * boostRate
  
  // 应用行业系数和分层乘数
  return baseIncremental * industryCoefficient * tierMultiplier
}

/**
 * 回本周期计算
 * 公式：激励成本 / (增量日均消耗)
 */
export function calculateBreakEvenDays(
  incentiveCost: number,
  incrementalDailySpend: number
): number {
  if (incrementalDailySpend <= 0) return Infinity
  return Math.ceil(incentiveCost / incrementalDailySpend)
}

/**
 * 多方案 ROI 模拟
 * 生成 A/B/C 三个方案供对比
 */
export function generateROIScenarios(
  customerId: string,
  strategyType: StrategyType,
  baseDailySpend: number,
  daysRemaining: number,
  currentCompletionRate: number,
  contractAmount: number
): ROISimulation[] {
  const config = getStrategyConfig(strategyType)
  const { min, max } = config.incentiveRateRange
  const mid = (min + max) / 2

  // 三个方案：保守、标准、激进
  const scenarios = [
    { name: 'A', rate: min, label: '保守方案' },
    { name: 'B', rate: mid, label: '标准方案' },
    { name: 'C', rate: max, label: '激进方案' }
  ]

  return scenarios.map(({ name: _name, rate }) => {
    const incrementalSpend = predictIncrementalSpend(
      baseDailySpend,
      Math.min(daysRemaining, config.typicalDuration),
      rate
    )
    const incentiveCost = calculateIncentiveCost(incrementalSpend, rate)
    const roi = calculateROI(incrementalSpend, incentiveCost)

    // 计算实施后的完成率
    const currentAmount = (currentCompletionRate / 100) * contractAmount
    const predictedTotal = currentAmount + incrementalSpend
    const completionRateAfter = (predictedTotal / contractAmount) * 100

    return {
      customerId,
      strategyType,
      incentiveCost,
      incrementalSpend,
      roi,
      breakEvenDays: calculateBreakEvenDays(incentiveCost, incrementalSpend / daysRemaining),
      completionRateAfter: Math.min(100, completionRateAfter)
    }
  })
}

/**
 * 敏感性分析
 * 计算不同激励比例下的 ROI 曲线
 */
export function calculateSensitivityCurve(
  baseDailySpend: number,
  days: number,
  rateRange: { min: number; max: number },
  steps: number = 10
): Array<{ rate: number; roi: number; incremental: number; cost: number }> {
  const results: Array<{ rate: number; roi: number; incremental: number; cost: number }> = []
  const step = (rateRange.max - rateRange.min) / steps

  for (let i = 0; i <= steps; i++) {
    const rate = rateRange.min + step * i
    const incremental = predictIncrementalSpend(baseDailySpend, days, rate)
    const cost = calculateIncentiveCost(incremental, rate)
    const roi = calculateROI(incremental, cost)

    results.push({
      rate: parseFloat(rate.toFixed(1)),
      roi,
      incremental: parseFloat(incremental.toFixed(2)),
      cost: parseFloat(cost.toFixed(2))
    })
  }

  return results
}
