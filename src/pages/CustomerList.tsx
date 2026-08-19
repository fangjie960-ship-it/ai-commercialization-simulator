import { useState } from 'react'
import { Search, Upload, Plus, Download, ChevronLeft, ChevronRight, Edit2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomerStore } from '@/store/customerStore'
import { TierBadge } from '@/components/TierBadge'
import { ImportModal } from '@/components/ImportModal'
import { downloadBackup, parseBackup } from '@/utils/backup'
import { CustomerFormModal } from '@/components/CustomerFormModal'
import { clearAllCustomersFromDB } from '@/utils/indexedDB'
import { demoCustomers } from '@/data/demoCustomers'
import type { Customer, Industry, EstimatedAction } from '@/types/customer'

const industries: { value: Industry | 'all'; label: string }[] = [
  { value: 'all', label: '全部行业' },
  { value: 'drama', label: '短剧' },
  { value: 'game', label: '游戏' },
  { value: 'ecommerce', label: '电商' },
  { value: 'education', label: '教育' },
  { value: 'other', label: '其他' }
]

const estimatedActions: { value: EstimatedAction | 'all'; label: string }[] = [
  { value: 'all', label: '全部预估动作' },
  { value: 'upgrade', label: '可能升框' },
  { value: 'complete', label: '努力完框' },
  { value: 'downgrade', label: '可能降档位' },
  { value: 'abandon', label: '可能弃框' }
]

export function CustomerList() {
  const { 
    customers, 
    analyses, 
    filter, 
    setFilter, 
    importCustomers, 
    deleteCustomer,
    setPage,
    setSelectedCustomer,
    getFilteredCustomers,
    policies,
    calculationConfig,
    restoreBackup
  } = useCustomerStore()

  const [showImportModal, setShowImportModal] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  const filteredCustomers = getFilteredCustomers()
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage)


  const loadDemoData = async () => {
    // 先清空旧数据，确保加载最新生成的演示数据
    await clearAllCustomersFromDB()
    importCustomers(demoCustomers)
    toast.success('演示数据已加载')
  }

  const handleBackup = () => {
    if (customers.length === 0 && Object.keys(policies).length === 0) {
      toast.error('当前没有可备份的数据')
      return
    }
    downloadBackup({
      version: 1,
      exportedAt: new Date().toISOString(),
      customers,
      policies: Object.values(policies),
      calculationConfig,
      filter,
    })
    toast.success('数据已备份为 JSON 文件')
  }

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const data = parseBackup(text)
      if (!window.confirm('恢复将覆盖当前数据（客户/政策/配置），确定继续？')) return
      await restoreBackup(data)
      toast.success('数据已恢复：' + data.customers.length + ' 个客户 / ' + data.policies.length + ' 条政策')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '恢复失败，请检查备份文件')
    }
  }

  const openDetail = (customerId: string) => {
    setSelectedCustomer(customerId)
    setPage('customer_detail')
  }

  return (
    <div className="p-6 space-y-6">
      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          {/* 搜索 */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="搜索客户名称或营业执照..."
              value={filter.searchQuery}
              onChange={(e) => setFilter({ searchQuery: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 行业筛选 */}
          <select
            value={filter.industry}
            onChange={(e) => setFilter({ industry: e.target.value as Industry | 'all' })}
            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
          >
            {industries.map(i => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>

          {/* 预估动作筛选 */}
          <select
            value={filter.estimatedAction}
            onChange={(e) => setFilter({ estimatedAction: e.target.value as EstimatedAction | 'all' })}
            className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
          >
            {estimatedActions.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            <span className="text-sm">恢复数据</span>
            <input type="file" accept=".json" className="hidden" onChange={handleRestore} />
          </label>
          <button
            onClick={handleBackup}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="text-sm">备份数据</span>
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm">批量导入</span>
          </button>
          <button
            onClick={() => { setEditingCustomer(null); setShowFormModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">新增客户</span>
          </button>
        </div>
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {customers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500 mb-4">暂无客户数据</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={loadDemoData}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                加载演示数据
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                导入 CSV
              </button>
            </div>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">最新消耗日期</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">客户名称</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">框架任务金额(万)</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">YTD消耗</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">预估消耗达成</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">完成率(当前/预估)</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">预估扣罚保证金</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">模型</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">日均消耗</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">层级</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">剩余天数</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase">预估动作</th>
                  <th className="px-4 py-4 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedCustomers.map((customer) => {
                  const analysis = analyses[customer.id]
                  if (!analysis) return null

                  // 从每日流水中计算最新日期
                  const recentDailySpend = customer.dailySpend?.slice(-7) || []
                  const latestSpendDate = recentDailySpend.length > 0
                    ? recentDailySpend[recentDailySpend.length - 1]?.date
                    : '-'
                  
                  // 基于完成率的预估动作逻辑
                  let predictedActionText: string
                  let predictedActionColor: string
                  if (analysis.completionRate >= 120) {
                    predictedActionText = '可能升框'
                    predictedActionColor = 'text-purple-600'
                  } else if (analysis.completionRate > 80) {
                    predictedActionText = '努力完框'
                    predictedActionColor = 'text-green-600'
                  } else if (analysis.completionRate < 50) {
                    predictedActionText = '可能弃框'
                    predictedActionColor = 'text-red-500'
                  } else {
                    predictedActionText = '可能降档位'
                    predictedActionColor = 'text-yellow-600'
                  }

                  return (
                    <tr key={customer.id} onClick={() => openDetail(customer.id)} className="hover:bg-gray-50 transition-colors cursor-pointer">
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {latestSpendDate !== '-' ? latestSpendDate : '-'}
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">{customer.name}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        ¥{customer.contractAmount}万
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        ¥{analysis.completedAmount.toFixed(1)}万
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        ¥{analysis.estimatedYearlySpend.toFixed(1)}万
                      </td>
                      <td className="px-4 py-4 w-44">
                        <div className="text-sm text-gray-900">{analysis.currentCompletionRate.toFixed(1)}%</div>
                        <div className="text-xs text-gray-500">预估 {analysis.completionRate.toFixed(1)}%</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        ¥{analysis.estimatedPenaltyDeposit.toFixed(2)}万
                      </td>
                      <td className="px-4 py-4">
                        <span 
                          className={`text-xs px-2 py-0.5 rounded ${
                            analysis.completionRateSource === 'period_based' 
                              ? 'bg-purple-500/20 text-purple-600' 
                              : 'bg-blue-500/20 text-blue-600'
                          }`}
                          title={analysis.completionRateSource === 'period_based' 
                            ? `基期预测: ${analysis.periodBasedData?.periodStartDate} ~ ${analysis.periodBasedData?.periodEndDate}`
                            : '日均平推: 当前日均消耗 × 365 / 框架金额'
                          }
                        >
                          {analysis.completionRateSource === 'period_based' ? '基期' : '日均'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {analysis.completionRateSource === 'period_based' && analysis.periodBasedData
                          ? `${analysis.periodBasedData.periodDailyAverage.toFixed(1)}万/日`
                          : `${analysis.currentDailySpend.toFixed(1)}万/日`
                        }
                      </td>
                      <td className="px-4 py-4">
                        <TierBadge tier={analysis.tier} />
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {analysis.remainingDays} 天
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-sm ${predictedActionColor}`}>
                          {predictedActionText}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingCustomer(customer); setShowFormModal(true) }}
                            className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteCustomer(customer.id); toast.success(`已删除 ${customer.name}`) }}
                            className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* 分页 */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                共 {filteredCustomers.length} 条，每页 {itemsPerPage} 条
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-500">
                  {currentPage} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 导入中心弹窗 */}
      <ImportModal open={showImportModal} onClose={() => setShowImportModal(false)} />
      <CustomerFormModal open={showFormModal} customer={editingCustomer} onClose={() => setShowFormModal(false)} />
    </div>
  )
}
