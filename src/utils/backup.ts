import type { CalculationConfigState, Customer, FilterState, Policy } from '@/types/customer'

/**
 * 数据备份工具
 * @description 把客户/政策/计算配置/筛选条件导出为 JSON，可随时恢复或迁移到其他浏览器
 * 修改日期：2026-08-19
 */

export interface BackupData {
  version: 1
  exportedAt: string
  customers: Customer[]
  policies: Policy[]
  calculationConfig: CalculationConfigState
  filter: FilterState
}

/**
 * 校验并规范化备份内容（防御性：导入的数据不可信）
 */
export function parseBackup(text: string): BackupData {
  const raw: unknown = JSON.parse(text)
  if (!raw || typeof raw !== 'object') throw new Error('备份文件格式不正确')
  const d = raw as Record<string, unknown>
  if (d.version !== 1) throw new Error('备份版本不支持')

  const customers = Array.isArray(d.customers) ? (d.customers as Customer[]) : []
  const policies = Array.isArray(d.policies) ? (d.policies as Policy[]) : []
  if (customers.length === 0 && policies.length === 0) {
    throw new Error('备份文件里没有可恢复的数据')
  }
  if (!d.calculationConfig || typeof d.calculationConfig !== 'object') {
    throw new Error('备份文件缺少计算配置')
  }

  return {
    version: 1,
    exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : new Date().toISOString(),
    customers,
    policies,
    calculationConfig: d.calculationConfig as CalculationConfigState,
    filter: (d.filter as FilterState) || { industry: 'all', estimatedAction: 'all', completionRateMin: 0, completionRateMax: 200, searchQuery: '' },
  }
}

/**
 * 下载备份文件
 */
export function downloadBackup(data: BackupData): void {
  const content = JSON.stringify(data, null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  const link = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  link.href = URL.createObjectURL(blob)
  link.download = `年框策略备份-${date}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}