import { WAIVER_CONFIG, type ShortTermTierConfig } from '@/config/schemeConfig'

/**
 * 策略方案测算（纯函数）
 * @description 按预估完成率匹配方案，并计算免扣保证金 / 短期政策的 ROI
 * 修改日期：2026-08-19
 */

export type SchemeType = 'waiver' | 'short_term' | 'none'

/**
 * 根据预估完成率自动匹配方案
 * <70% 免扣保证金；70%~90% 短期政策；≥90% 无需干预
 */
export function selectScheme(estimatedRate: number): SchemeType {
  if (estimatedRate < WAIVER_CONFIG.partialWaiveRate) return 'waiver'
  if (estimatedRate < 90) return 'short_term'
  return 'none'
}

/**
 * 全额保证金 = min(任务金额 × 1%, 600万)
 */
export function calcFullPenalty(contractAmount: number): number {
  return Math.min(contractAmount * WAIVER_CONFIG.penaltyRate, WAIVER_CONFIG.penaltyCapWan)
}

/**
 * 取略高整数（运营习惯：按 ROI 倒推增量后取一个好看的整数）
 * ≥50 → 按10取整；≥10 → 按5取整；否则向上取整
 */
export function roundUpNice(value: number): number {
  if (value >= 100) return Math.ceil(value / 10) * 10
  if (value >= 10) return Math.ceil(value / 5) * 5
  return Math.ceil(value)
}

export interface WaiverInput {
  contractAmount: number
  estimatedRate: number // 预估完成率 %
  estimatedPenalty: number // 预估本来要扣的保证金（万）
  mode: 'target_incremental' | 'target_roi'
  targetIncremental: number // 目标增量（万）
  targetRoi: number // ROI 目标（倍）
}

export interface WaiverResult {
  fullPenalty: number // 全额保证金（万）
  waivedAmount: number // 免扣额（万）
  waiveType: 'full' | 'partial'
  incremental: number // 要求增量（万）
  roi: number // ROI = 增量 / 免扣额
}

/**
 * 免扣保证金方案测算
 * <60% 免扣全部保证金；60%~70% 免扣应扣部分
 * 支持两种模式：给定目标增量看 ROI / 给定 ROI 目标倒推增量（取略高整数）
 */
export function calcWaiverScheme(input: WaiverInput): WaiverResult {
  const fullPenalty = calcFullPenalty(input.contractAmount)
  const isFull = input.estimatedRate < WAIVER_CONFIG.fullWaiveRate
  const waivedAmount = isFull ? fullPenalty : input.estimatedPenalty

  let incremental: number
  if (input.mode === 'target_incremental') {
    incremental = input.targetIncremental
  } else {
    // 按 ROI 目标倒推：增量 = ROI目标 × 免扣额，取略高整数
    incremental = roundUpNice(input.targetRoi * waivedAmount)
  }

  const roi = waivedAmount > 0 ? incremental / waivedAmount : 0
  return {
    fullPenalty,
    waivedAmount,
    waiveType: isFull ? 'full' : 'partial',
    incremental,
    roi: parseFloat(roi.toFixed(2)),
  }
}

export interface ShortTermInput {
  baseDaily: number // 基期日均（万/天）
  contractAmount: number
  estimatedRate: number // 预估完成率 %
  policyDays: number // 政策期天数
  tiers: ShortTermTierConfig[] // 按基期日均分档，每档含基础/激励两档增速与返点
}

/** 某一增速层级的测算结果 */
export interface ShortTermLevel {
  level: 'base' | 'incentive'
  growth: number // 增速要求 %
  requiredDaily: number // 政策期日均要求（万/天）
  incremental: number // 政策期增量（万）
  cost: number // 返点成本（万）= 增量 × 该层级增量返点
  roi: number // ROI = 100 / 该层级增量返点率
  reaches100: boolean // 估算能否凭该增量冲到100%
}

export interface ShortTermResult {
  tier: ShortTermTierConfig // 命中的档位（按基期日均）
  tierIndex: number
  base: ShortTermLevel // 基础增速达标
  incentive: ShortTermLevel // 激励增速达标
}

/**
 * 短期政策方案测算
 * 1. 按基期日均命中档位（baseDaily ≤ maxBaseDaily 归该档，兜底档收尾）
 * 2. 档内两档增速：达到基础增速 → 给基础增量返点；达到激励增速 → 给激励增量返点（激励更多投放）
 * ROI = 增量 / (增量×该层级增量返点) = 100 / 该层级增量返点率（与年框返点无关）
 */
export function calcShortTermScheme(input: ShortTermInput): ShortTermResult | null {
  if (input.baseDaily <= 0 || input.policyDays <= 0 || input.contractAmount <= 0) return null

  const sortedTiers = [...input.tiers].sort((a, b) => (a.maxBaseDaily ?? Infinity) - (b.maxBaseDaily ?? Infinity))
  const matchIndex = sortedTiers.findIndex(t => t.maxBaseDaily !== undefined && input.baseDaily <= t.maxBaseDaily)
  const tierIndex = matchIndex === -1 ? sortedTiers.length - 1 : matchIndex
  const tier = sortedTiers[tierIndex]

  const calcLevel = (level: 'base' | 'incentive'): ShortTermLevel => {
    const growth = level === 'base' ? tier.baseGrowth : tier.incentiveGrowth
    const rebate = level === 'base' ? tier.baseRebate : tier.incentiveRebate
    const requiredDaily = input.baseDaily * (1 + growth / 100)
    const rawIncremental = input.baseDaily * (growth / 100) * input.policyDays
    const cost = rawIncremental * (rebate / 100)
    const roi = cost > 0 ? rawIncremental / cost : 0
    const reaches100 = input.estimatedRate + (rawIncremental / input.contractAmount) * 100 >= 100
    return {
      level,
      growth,
      requiredDaily: parseFloat(requiredDaily.toFixed(2)),
      incremental: parseFloat(rawIncremental.toFixed(1)),
      cost: parseFloat(cost.toFixed(2)),
      roi: parseFloat(roi.toFixed(2)),
      reaches100,
    }
  }

  return { tier, tierIndex, base: calcLevel('base'), incentive: calcLevel('incentive') }
}