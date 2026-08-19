import { describe, it, expect } from 'vitest'
import { calculateROI, calculateIncentiveCost, predictIncrementalSpend, calculateSensitivityCurve } from './roi'

describe('ROI 计算', () => {
  it('基础计算：增量100 / 成本20 = 5', () => {
    expect(calculateROI(100, 20)).toBe(5)
  })
  it('成本为 0 时 ROI 为 0', () => {
    expect(calculateROI(100, 0)).toBe(0)
  })
  it('激励成本 = 增量 × 返点比例', () => {
    expect(calculateIncentiveCost(100, 10)).toBe(10)
  })
})

describe('增量预测与敏感性', () => {
  it('基础日均10 × 30天 × 10%返点(弹性0.5) = 15万', () => {
    expect(predictIncrementalSpend(10, 30, 10)).toBeCloseTo(15, 1)
  })
  it('敏感性曲线包含 steps+1 个点', () => {
    const curve = calculateSensitivityCurve(10, 30, { min: 5, max: 15 }, 5)
    expect(curve.length).toBe(6)
    expect(curve[0].rate).toBe(5)
    expect(curve[5].rate).toBe(15)
  })
})