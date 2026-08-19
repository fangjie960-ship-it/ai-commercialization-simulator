import { describe, it, expect } from 'vitest'
import { guessSpendMapping, parseSpendCSV } from './spendParser'

describe('guessSpendMapping', () => {
  it('识别日期/营业执照/消耗量（真实 SQL 字段）', () => {
    const m = guessSpendMapping(['日期', '营业执照', '产品线', '消耗量'])
    expect(m.date).toBe('日期')
    expect(m.license).toBe('营业执照')
    expect(m.amount).toBe('消耗量')
  })
})

describe('parseSpendCSV', () => {
  it('按(日期,执照)聚合求和、识别未匹配、跳过非法行', async () => {
    const csv = [
      '日期,营业执照,产品线,消耗量',
      '2026-08-01,L1,短剧,10',
      '2026-08-01,L1,游戏,20',
      '2026-08-02,L1,短剧,30',
      '2026/8/1,L2,电商,5',
      '2026-08-01,L9,教育,8',
      '2026-08-01,L1,短剧,abc',
    ].join('\n')
    const result = await parseSpendCSV(csv, { date: '日期', license: '营业执照', amount: '消耗量' }, new Set(['L1', 'L2']))
    expect(result.totalRows).toBe(6)
    expect(result.invalidRows).toHaveLength(1) // abc 非法
    const l1 = result.aggregatedRows.find(r => r.license === 'L1' && r.date === '2026-08-01')
    expect(l1?.amount).toBeCloseTo(30, 1) // 10+20 聚合
    expect(result.unmatchedLicenses).toEqual(['L9'])
  })
  it('日期标准化为 YYYY-MM-DD', async () => {
    const csv = '日期,营业执照,产品线,消耗量\n2026/8/1,L1,短剧,5\n2026.8.2,L1,短剧,6\n20260803,L1,短剧,7'
    const result = await parseSpendCSV(csv, { date: '日期', license: '营业执照', amount: '消耗量' }, new Set(['L1']))
    expect(result.aggregatedRows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true)
    expect(result.aggregatedRows).toHaveLength(3)
  })
})