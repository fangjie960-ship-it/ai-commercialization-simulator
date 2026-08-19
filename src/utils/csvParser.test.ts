import { describe, it, expect } from 'vitest'
import { parseCSV } from './csvParser'

const HEADER = '营业执照,客户名称,行业,框架金额,已完成消耗,月度消耗趋势,签约日期,到期日期,客户等级,备注'

describe('parseCSV', () => {
  it('正常行解析成功', async () => {
    const csv = `${HEADER}\n91110000123456789X,示例客户,游戏,500,200,"30,35,40,38,42,45",2024-01-01,2024-12-31,A,备注`
    const result = await parseCSV(csv)
    expect(result.successCount).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(result.customers[0].name).toBe('示例客户')
    expect(result.customers[0].industry).toBe('game')
  })

  it('缺必填字段时报具体错误', async () => {
    const csv = `${HEADER}\n,示例客户,游戏,500,200,"30,35,40,38,42,45",2024-01-01,2024-12-31,A,`
    const result = await parseCSV(csv)
    expect(result.successCount).toBe(0)
    expect(result.errors.some(e => e.field === '营业执照')).toBe(true)
  })

  it('已完成消耗超过框架金额时报错', async () => {
    const csv = `${HEADER}\n91110000123456789X,示例客户,游戏,500,600,"30,35,40,38,42,45",2024-01-01,2024-12-31,A,`
    const result = await parseCSV(csv)
    expect(result.errors.some(e => e.message.includes('不能超过框架金额'))).toBe(true)
  })

  it('空文件返回 0 客户', async () => {
    const result = await parseCSV('')
    expect(result.customers).toHaveLength(0)
    expect(result.successCount).toBe(0)
  })
})