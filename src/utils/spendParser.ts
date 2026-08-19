import Papa from 'papaparse'

/**
 * 消耗流水 CSV 解析工具
 * @description 支持"每个人的 SQL 拉法不一样"的真实场景：
 * 1. 字段名不同 → 手动列映射 + 别名自动识别
 * 2. 客户不唯一 → 以营业执照为匹配键，按 (日期, 营业执照) 聚合
 * 3. 每天多条（按产品线/账户/计划拉）→ 同一客户同一天多条求和
 */

/**
 * 列映射配置（用户把 CSV 列名映射到系统字段）
 */
export interface SpendColumnMapping {
  date: string    // 日期列名
  license: string // 营业执照列名
  amount: string  // 消耗金额列名
}

/**
 * 聚合后的消耗行（按 日期×营业执照 唯一）
 */
export interface AggregatedSpendRow {
  license: string
  date: string    // 标准化为 YYYY-MM-DD
  amount: number
}

/**
 * 解析错误
 */
export interface SpendParseError {
  row: number
  reason: string
  value?: string
}

/**
 * 解析结果
 */
export interface SpendParseResult {
  totalRows: number          // CSV 总数据行数
  rawValidRows: number       // 去重前的有效行数
  aggregatedRows: AggregatedSpendRow[]  // 按(日期,执照)聚合后的行
  invalidRows: SpendParseError[]
  unmatchedLicenses: string[]  // 主数据中不存在的执照（需用户处理）
  dateRange: { start: string; end: string } | null
}

/**
 * 常见列名别名库（自动识别用）
 */
export const SPEND_COLUMN_ALIASES: Record<keyof SpendColumnMapping, string[]> = {
  date: ['日期', 'date', 'dt', 'stat_date', '消耗日期', '统计日期'],
  license: ['营业执照', '统一社会信用代码', '信用代码', '执照', 'license', 'business_license', 'credit_code'],
  amount: ['消耗', '消耗量', '消耗金额', '费用', 'cost', 'spend', 'amount', '现金消耗', '实际消耗'],
}

/**
 * 根据列名自动猜测映射
 * @param headers CSV 表头
 * @returns 命中的映射（未命中的字段为 null）
 */
export function guessSpendMapping(headers: string[]): SpendColumnMapping {
  // 注意：同一列不能被复用，date/license/amount 各自独立匹配
  const used = new Set<string>()
  const result: SpendColumnMapping = { date: '', license: '', amount: '' }

  const pickUnique = (aliases: string[]): string => {
    for (const header of headers) {
      const lower = header.trim().toLowerCase()
      if (used.has(header)) continue
      if (aliases.some(a => lower === a.toLowerCase() || lower.includes(a.toLowerCase()))) {
        used.add(header)
        return header
      }
    }
    return ''
  }

  result.date = pickUnique(SPEND_COLUMN_ALIASES.date)
  result.license = pickUnique(SPEND_COLUMN_ALIASES.license)
  result.amount = pickUnique(SPEND_COLUMN_ALIASES.amount)

  return result
}

/**
 * 标准化日期为 YYYY-MM-DD
 * 支持 2026-08-01 / 2026/8/1 / 2026.8.1 / 20260801
 */
function normalizeDate(raw: string): string | null {
  const trimmed = String(raw).trim()
  if (!trimmed) return null

  let m = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    const d = new Date(year, month - 1, day)
    if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  m = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  return null
}

/**
 * 解析消耗流水 CSV
 * @param input CSV 文件（浏览器 File）或原始字符串（测试/服务端场景）
 * @param mapping 列映射（用户确认或自动识别）
 * @param knownLicenses 已存在客户的营业执照集合，用于标记未匹配
 */
export async function parseSpendCSV(
  input: File | string,
  mapping: SpendColumnMapping,
  knownLicenses: Set<string>
): Promise<SpendParseResult> {
  return new Promise((resolve) => {
    const invalidRows: SpendParseError[] = []
    const validRaw: AggregatedSpendRow[] = []
    let totalRows = 0

    Papa.parse<Record<string, string>>(input, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (results) => {
        const rows = results.data
        totalRows = rows.length

        rows.forEach((row, index) => {
          const rowNum = index + 2 // 第1行是表头

          const rawDate = row[mapping.date]
          const rawLicense = row[mapping.license]
          const rawAmount = row[mapping.amount]

          // 1. 日期校验
          const date = normalizeDate(rawDate || '')
          if (!date) {
            invalidRows.push({ row: rowNum, reason: '日期格式无法识别', value: rawDate })
            return
          }

          // 2. 营业执照校验
          const license = String(rawLicense || '').trim()
          if (!license) {
            invalidRows.push({ row: rowNum, reason: '营业执照为空', value: rawLicense })
            return
          }

          // 3. 消耗金额校验
          const amount = parseFloat(String(rawAmount))
          if (isNaN(amount)) {
            invalidRows.push({ row: rowNum, reason: '消耗金额不是数字', value: rawAmount })
            return
          }
          if (amount < 0) {
            invalidRows.push({ row: rowNum, reason: '消耗金额为负数（退款/调账？）', value: rawAmount })
            return
          }

          validRaw.push({ license, date, amount })
        })

        // 4. 按 (日期, 营业执照) 聚合求和（同一客户同一天多条合并）
        const aggMap = new Map<string, AggregatedSpendRow>()
        for (const row of validRaw) {
          const key = `${row.license}||${row.date}`
          const existing = aggMap.get(key)
          if (existing) {
            existing.amount = parseFloat((existing.amount + row.amount).toFixed(2))
          } else {
            aggMap.set(key, { ...row })
          }
        }
        const aggregatedRows = Array.from(aggMap.values())

        // 5. 找出主数据中不存在的执照
        const unmatched = new Set<string>()
        aggregatedRows.forEach(row => {
          if (!knownLicenses.has(row.license)) unmatched.add(row.license)
        })

        // 6. 日期范围
        let dateRange: SpendParseResult['dateRange'] = null
        if (aggregatedRows.length > 0) {
          const dates = aggregatedRows.map(r => r.date).sort()
          dateRange = { start: dates[0], end: dates[dates.length - 1] }
        }

        resolve({
          totalRows,
          rawValidRows: validRaw.length,
          aggregatedRows,
          invalidRows,
          unmatchedLicenses: Array.from(unmatched),
          dateRange,
        })
      },
      error: (error) => {
        resolve({
          totalRows: 0,
          rawValidRows: 0,
          aggregatedRows: [],
          invalidRows: [{ row: 0, reason: `CSV 解析失败: ${error.message}` }],
          unmatchedLicenses: [],
          dateRange: null,
        })
      },
    })
  })
}