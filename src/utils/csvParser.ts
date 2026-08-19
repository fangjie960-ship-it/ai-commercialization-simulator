import Papa from 'papaparse'
import type { Customer, Industry } from '@/types/customer'

/**
 * CSV 解析工具函数
 * @description 客户数据 CSV 导入解析和校验
 * 修改日期：2026-04-03
 */

/**
 * CSV 行数据结构
 */
interface CSVRow {
  营业执照?: string
  客户名称?: string
  行业?: string
  框架金额?: string | number
  已完成消耗?: string | number
  月度消耗趋势?: string
  签约日期?: string
  到期日期?: string
  客户等级?: string
  备注?: string
  框架任务金额?: string | number
  返点比例?: string | number
  预估客户动作?: string
}

/**
 * 解析错误类型
 */
export interface ParseError {
  row: number
  field: string
  message: string
  value?: string
}

/**
 * 解析结果
 */
export interface ParseResult {
  customers: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>[]
  errors: ParseError[]
  totalRows: number
  successCount: number
}

/**
 * 行业名称映射
 */
const INDUSTRY_MAP: Record<string, Industry> = {
  '短剧': 'drama',
  'drama': 'drama',
  '游戏': 'game',
  'game': 'game',
  '电商': 'ecommerce',
  'ecommerce': 'ecommerce',
  '教育': 'education',
  'education': 'education',
  '其他': 'other',
  'other': 'other'
}

/**
 * 解析 CSV 文件
 */
export function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const errors: ParseError[] = []
    const customers: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>[] = []

    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (results) => {
        const rows = results.data
        const totalRows = rows.length

        rows.forEach((row, index) => {
          const rowNum = index + 2 // +2 因为第1行是表头
          const parseResult = parseRow(row, rowNum)

          if (parseResult.errors.length > 0) {
            errors.push(...parseResult.errors)
          } else if (parseResult.customer) {
            customers.push(parseResult.customer)
          }
        })

        resolve({
          customers,
          errors,
          totalRows,
          successCount: customers.length
        })
      },
      error: (error) => {
        errors.push({
          row: 0,
          field: 'file',
          message: `CSV 解析失败: ${error.message}`
        })
        resolve({
          customers,
          errors,
          totalRows: 0,
          successCount: 0
        })
      }
    })
  })
}

/**
 * 解析单行数据
 */
function parseRow(row: CSVRow, rowNum: number): {
  customer?: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>
  errors: ParseError[]
} {
  const errors: ParseError[] = []

  // 1. 校验必填字段
  if (!row.营业执照?.trim()) {
    errors.push({ row: rowNum, field: '营业执照', message: '营业执照不能为空' })
  }

  if (!row.客户名称?.trim()) {
    errors.push({ row: rowNum, field: '客户名称', message: '客户名称不能为空' })
  }

  if (!row.行业?.trim()) {
    errors.push({ row: rowNum, field: '行业', message: '行业不能为空' })
  } else if (!INDUSTRY_MAP[row.行业.trim()]) {
    errors.push({
      row: rowNum,
      field: '行业',
      message: '行业必须是：短剧、游戏、电商、教育、其他之一',
      value: row.行业
    })
  }

  // 2. 解析数值字段
  const contractAmount = parseFloat(String(row.框架金额))
  if (isNaN(contractAmount) || contractAmount <= 0) {
    errors.push({
      row: rowNum,
      field: '框架金额',
      message: '框架金额必须是大于0的数字',
      value: String(row.框架金额)
    })
  }

  const completedAmount = parseFloat(String(row.已完成消耗))
  if (isNaN(completedAmount) || completedAmount < 0) {
    errors.push({
      row: rowNum,
      field: '已完成消耗',
      message: '已完成消耗必须是大于等于0的数字',
      value: String(row.已完成消耗)
    })
  }

  // 3. 校验数据逻辑
  if (contractAmount > 0 && completedAmount > contractAmount) {
    errors.push({
      row: rowNum,
      field: '已完成消耗',
      message: `已完成消耗(${completedAmount})不能超过框架金额(${contractAmount})`,
      value: String(row.已完成消耗)
    })
  }

  // 4. 解析月度消耗趋势
  let monthlyTrend: number[] = []
  if (row.月度消耗趋势) {
    try {
      monthlyTrend = parseMonthlyTrend(row.月度消耗趋势)
      if (monthlyTrend.length !== 6) {
        errors.push({
          row: rowNum,
          field: '月度消耗趋势',
          message: '月度消耗趋势必须包含6个月的数值',
          value: row.月度消耗趋势
        })
      }
    } catch (e) {
      errors.push({
        row: rowNum,
        field: '月度消耗趋势',
        message: '月度消耗趋势格式错误，应为逗号分隔的数字（如：10,20,15,25,30,35）',
        value: row.月度消耗趋势
      })
    }
  } else {
    errors.push({
      row: rowNum,
      field: '月度消耗趋势',
      message: '月度消耗趋势不能为空'
    })
  }

  // 5. 校验日期
  if (!row.签约日期) {
    errors.push({ row: rowNum, field: '签约日期', message: '签约日期不能为空' })
  }
  if (!row.到期日期) {
    errors.push({ row: rowNum, field: '到期日期', message: '到期日期不能为空' })
  }
  if (row.签约日期 && row.到期日期) {
    const contractDate = new Date(row.签约日期)
    const expireDate = new Date(row.到期日期)
    if (contractDate >= expireDate) {
      errors.push({
        row: rowNum,
        field: '到期日期',
        message: '到期日期必须晚于签约日期'
      })
    }
  }

  // 如果有错误，返回错误
  if (errors.length > 0) {
    return { errors }
  }

  // 构造客户对象
  const customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> = {
    businessLicense: row.营业执照!.trim(),
    name: row.客户名称!.trim(),
    industry: INDUSTRY_MAP[row.行业!.trim()],
    contractAmount,
    completedAmount,
    monthlyTrend,
    dailySpend: [], // CSV导入时不包含每日流水，需通过系统生成或单独导入
    contractDate: row.签约日期!,
    expireDate: row.到期日期!,
    grade: (row.客户等级 as 'A' | 'B' | 'C' | 'D') || undefined,
    remark: row.备注
  }

  return { customer, errors: [] }
}

/**
 * 解析月度消耗趋势字符串
 * 支持格式："10,20,15,25,30,35" 或 "[10,20,15,25,30,35]"
 */
function parseMonthlyTrend(trendStr: string): number[] {
  const cleaned = trendStr.replace(/[\[\]\s]/g, '')
  return cleaned.split(',').map(v => parseFloat(v)).filter(v => !isNaN(v))
}

/**
 * 生成 CSV 模板
 */
export function generateCSVTemplate(): string {
  const headers = ['营业执照', '客户名称', '行业', '框架金额', '已完成消耗', '月度消耗趋势', '签约日期', '到期日期', '客户等级', '备注']
  const example = [
    '91110000123456789X',
    '示例客户',
    '游戏',
    '500',
    '200',
    '30,35,40,38,42,45',
    '2024-01-01',
    '2024-12-31',
    'A',
    '备注信息'
  ]
  return [headers.join(','), example.join(',')].join('\n')
}

/**
 * 下载 CSV 模板
 */
export function downloadCSVTemplate(): void {
  const content = generateCSVTemplate()
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = '客户数据导入模板.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}
