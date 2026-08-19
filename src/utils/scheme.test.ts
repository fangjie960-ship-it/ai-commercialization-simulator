import { describe, it, expect } from 'vitest'
import { selectScheme, calcFullPenalty, roundUpNice, calcWaiverScheme, calcShortTermScheme } from './scheme'

describe('方案匹配', () => {
  it('按预估完成率匹配方案', () => {
    expect(selectScheme(55)).toBe('waiver')
    expect(selectScheme(78)).toBe('short_term')
    expect(selectScheme(92)).toBe('none')
  })
  it('全额保证金 = min(任务金额×1%, 600万)', () => {
    expect(calcFullPenalty(500)).toBe(5)
    expect(calcFullPenalty(100000)).toBe(600)
  })
})

describe('取整规则', () => {
  it('4.8→5、1.75→2、17.5→20、120→120', () => {
    expect(roundUpNice(4.8)).toBe(5)
    expect(roundUpNice(1.75)).toBe(2)
    expect(roundUpNice(17.5)).toBe(20)
    expect(roundUpNice(120)).toBe(120)
  })
})

describe('免扣保证金方案', () => {
  it('ROI目标倒推增量并取整，重算ROI保持接近目标', () => {
    const w = calcWaiverScheme({ contractAmount: 500, estimatedRate: 55, estimatedPenalty: 5, mode: 'target_roi', targetIncremental: 0, targetRoi: 3.5 })
    expect(w.waiveType).toBe('full')
    expect(w.incremental).toBe(20) // 3.5×5=17.5 → 20
    expect(w.roi).toBeCloseTo(4, 1)
  })
  it('小免扣额时 ROI 不跳到离谱值', () => {
    const w = calcWaiverScheme({ contractAmount: 500, estimatedRate: 65, estimatedPenalty: 0.5, mode: 'target_roi', targetIncremental: 0, targetRoi: 3.5 })
    expect(w.incremental).toBe(2) // 3.5×0.5=1.75 → 2
    expect(w.roi).toBeCloseTo(4, 1)
  })
})

describe('短期政策方案（档位×基础/激励）', () => {
  const tiers = [
    { maxBaseDaily: 2, baseGrowth: 10, baseRebate: 6, incentiveGrowth: 20, incentiveRebate: 10 },
    { baseGrowth: 8, baseRebate: 5, incentiveGrowth: 15, incentiveRebate: 8 },
  ]
  it('基期日均 ≤2 归档1，基础/激励两档 ROI 按各自返点', () => {
    const r = calcShortTermScheme({ baseDaily: 2, contractAmount: 500, estimatedRate: 80, policyDays: 30, tiers })
    expect(r?.tierIndex).toBe(0)
    expect(r?.base.growth).toBe(10)
    expect(r?.base.roi).toBeCloseTo(100 / 6, 1)
    expect(r?.incentive.growth).toBe(20)
    expect(r?.incentive.roi).toBeCloseTo(100 / 10, 1)
  })
  it('基期日均 >2 归档2（兜底）', () => {
    const r = calcShortTermScheme({ baseDaily: 3, contractAmount: 500, estimatedRate: 88, policyDays: 30, tiers })
    expect(r?.tierIndex).toBe(1)
    expect(r?.base.growth).toBe(8)
  })
})