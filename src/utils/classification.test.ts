import { describe, it, expect } from 'vitest'
import { analyzeCustomer } from './classification'
import type { Customer } from '@/types/customer'

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    businessLicense: 'L1',
    name: '测试客户',
    industry: 'game',
    contractAmount: 1000,
    completedAmount: 600,
    monthlyTrend: [100, 110, 120, 130, 140, 150],
    dailySpend: [],
    contractDate: '2026-01-01',
    expireDate: '2026-12-31',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('analyzeCustomer - 日均平推（模式A）', () => {
  it('完成率 = 当前日均×365/框架金额，来源为 average', () => {
    const a = analyzeCustomer(makeCustomer(), { model: 'average', useDefault: true })
    // 近3个月均值 140 → 日均 4.667 → 预估全年 1703 → 完成率 170.3%
    expect(a.completionRateSource).toBe('average')
    expect(a.completionRate).toBeGreaterThan(100)
    expect(a.currentCompletionRate).toBeCloseTo(60, 1) // 600/1000
  })
})

describe('analyzeCustomer - 基期预测（模式B）', () => {
  it('累计取 YTD，剩余按基期日均外推', () => {
    const dailySpend: Customer['dailySpend'] = []
    for (let d = 1; d <= 15; d++) {
      dailySpend.push({ date: `2026-07-${String(d).padStart(2, '0')}`, amount: 10, targetAmount: 10, rebateRate: 5, predictedAction: 'maintain' })
    }
    const a = analyzeCustomer(makeCustomer({ dailySpend }), {
      model: 'period_based',
      periodStartDate: '2026-07-01',
      periodEndDate: '2026-07-15',
      useDefault: false,
    })
    expect(a.completionRateSource).toBe('period_based')
    expect(a.periodBasedData?.cumulativeBeforeCutoff).toBe(600) // max(YTD 600, 流水 150)
    expect(a.periodBasedData?.periodDailyAverage).toBeCloseTo(10, 1)
  })
})

describe('analyzeCustomer - 边界', () => {
  it('历史数据 < 3 个月时预测完成率为 null', () => {
    const a = analyzeCustomer(makeCustomer({ monthlyTrend: [10, 20] }), { model: 'average', useDefault: true })
    expect(a.predictedCompletionRate).toBeNull()
  })

  it('扣罚保证金封顶 600 万', () => {
    const a = analyzeCustomer(makeCustomer({ contractAmount: 100000, monthlyTrend: [0, 0, 0, 0, 0, 0] }), { model: 'average', useDefault: true })
    expect(a.estimatedPenaltyDeposit).toBe(600)
  })

  it('完成率极低且剩余天数少 → 高风险', () => {
    const a = analyzeCustomer(makeCustomer({ monthlyTrend: [1, 1, 1, 1, 1, 1], expireDate: '2026-09-01' }), { model: 'average', useDefault: true })
    expect(a.tier).toBe('high_risk')
  })
})