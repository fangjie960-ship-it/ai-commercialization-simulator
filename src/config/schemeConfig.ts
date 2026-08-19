/**
 * 策略方案配置
 * @description 免扣保证金 / 短期政策的默认参数与档位（可被页面参数覆盖）
 * 修改日期：2026-08-19
 * 规则来源：运营口径
 * - 保证金全扣 = 任务金额 × 1%，封顶 600 万
 * - 预估完成率 <60% 免扣全部保证金；60%~70% 免扣应扣部分
 * - 短期政策按基期日均分两档，每档设基础增速/激励增速
 */

export const WAIVER_CONFIG = {
  // 保证金规则：全扣 = 任务金额 × 1%，封顶 600 万
  penaltyRate: 0.01,
  penaltyCapWan: 600,
  // 预估完成率 < 60% → 免扣全部保证金
  fullWaiveRate: 60,
  // 60% ≤ 预估完成率 < 70% → 免扣应扣部分
  partialWaiveRate: 70,
}

/** 短期政策档位：按基期日均分档，每档含基础/激励两档增速，各配增量返点（与年框返点无关） */
export interface ShortTermTierConfig {
  maxBaseDaily?: number // 基期日均上限（万/天），本档覆盖 baseDaily ≤ maxBaseDaily；不填=兜底档（大于上一档）
  baseGrowth: number // 基础增速 %
  baseRebate: number // 达到基础增速时的增量返点 %
  incentiveGrowth: number // 激励增速 %
  incentiveRebate: number // 达到激励增速时的增量返点 %
}

export const SHORT_TERM_CONFIG = {
  policyDays: 30, // 政策期默认天数
  // 默认值（页面可改）：
  // 档1（基期日均 ≤ 2万/天）：基础 +10%→返点6%，激励 +20%→返点10%
  // 档2（基期日均 > 2万/天）：基础 +8%→返点5%，激励 +15%→返点8%
  tiers: [
    { maxBaseDaily: 2, baseGrowth: 10, baseRebate: 6, incentiveGrowth: 20, incentiveRebate: 10 },
    { baseGrowth: 8, baseRebate: 5, incentiveGrowth: 15, incentiveRebate: 8 },
  ] as ShortTermTierConfig[],
}