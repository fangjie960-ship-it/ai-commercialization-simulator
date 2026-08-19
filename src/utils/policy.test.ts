import { describe, it, expect } from 'vitest'
import { calcPolicyProgress } from './policy'
import type { Customer, Policy } from '@/types/customer'

const policy: Policy = {
  id: 'p1', customerId: 'c1', schemeType: 'short_term', name: '短期政策',
  startDate: '2026-08-01', endDate: '2026-08-31', baseDaily: 2, targetDaily: 2.2,
  requiredIncremental: 6, incrementalRebate: 10, annualRebate: 5, growth: 10, waivedAmount: 0, createdAt: 1,
}

function makeCustomer(days: string[], amount: number): Customer {
  return {
    id: 'c1', businessLicense: 'L1', name: '测试', industry: 'game',
    contractAmount: 500, completedAmount: 200, monthlyTrend: [50, 50, 50, 50, 50, 50],
    dailySpend: days.map(date => ({ date, amount, targetAmount: 2, rebateRate: 5, predictedAction: 'maintain' })),
    contractDate: '2026-01-01', expireDate: '2026-12-31', createdAt: 1, updatedAt: 1,
  }
}

const days = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)

describe('calcPolicyProgress', () => {
  it('时间/消耗/增量进度计算正确', () => {
    const p = calcPolicyProgress(policy, makeCustomer(days.slice(0, 10), 2.5), new Date('2026-08-11'))
    expect(p.elapsedDays).toBe(10)
    expect(p.actualSpend).toBeCloseTo(25, 0)
    expect(p.baseline).toBeCloseTo(20, 0)
    expect(p.actualIncremental).toBeCloseTo(5, 0)
    expect(p.incrementalProgress).toBeCloseTo(5 / 6, 2)
    expect(p.status).toBe('on_track')
  })
  it('时间过半但增量不足 → 落后', () => {
    const p = calcPolicyProgress(policy, makeCustomer(days.slice(0, 25), 2.0), new Date('2026-08-26'))
    expect(p.status).toBe('behind')
  })
  it('政策期结束 → done', () => {
    const p = calcPolicyProgress(policy, makeCustomer(days, 2.5), new Date('2026-09-01'))
    expect(p.status).toBe('done')
  })
})