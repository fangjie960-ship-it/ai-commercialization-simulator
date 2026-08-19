import { useCustomerStore } from '@/store/customerStore'
import { analyzeCustomer } from '@/utils/classification'
import { Upload, Users, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react'
import Papa from 'papaparse'
import { useState } from 'react'
import type { Customer, Industry } from '@/types/customer'

export const Dashboard = () => {
  const customers = useCustomerStore(state => state.customers)
  const analyses = useCustomerStore(state => state.analyses)
  const importCustomers = useCustomerStore(state => state.importCustomers)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  // 计算统计数据
  const stats = {
    total: customers.length,
    highRisk: Object.values(analyses).filter(a => a.tier === 'high_risk').length,
    warning: Object.values(analyses).filter(a => a.tier === 'warning').length,
    avgCompletion: customers.length > 0
      ? customers.reduce((sum, c) => sum + (c.completedAmount / c.contractAmount * 100), 0) / customers.length
      : 0,
    totalContract: customers.reduce((sum, c) => sum + c.contractAmount, 0)
  }

  // 处理CSV导入
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        try {
          const data = results.data as any[]
          const customers = data.map((row, index) => {
            // 验证必填字段
            if (!row['客户名称'] || !row['行业'] || !row['框架金额']) {
              throw new Error(`第${index + 1}行：缺少必填字段`)
            }

            // 解析月度趋势
            const monthlyTrend = row['月度消耗趋势']?.split(',').map((v: string) => parseFloat(v.trim())) || []

            return {
              name: row['客户名称'],
              industry: row['行业'] as Industry,
              contractAmount: parseFloat(row['框架金额']),
              completedAmount: parseFloat(row['已完成消耗'] || '0'),
              monthlyTrend,
              contractDate: row['签约日期'] || new Date().toISOString().split('T')[0],
              expireDate: row['到期日期'] || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              grade: row['客户等级'] || undefined,
              remark: row['备注'] || undefined
            } as Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>
          })

          importCustomers(customers)
          setShowImportModal(false)
        } catch (err) {
          setImportError(err instanceof Error ? err.message : '导入失败')
        }
      },
      error: (err) => {
        setImportError(err.message)
      }
    })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI商业化策略模拟器</h1>
            <p className="text-gray-500 text-sm mt-1">客户分层 · 消耗预测 · AI策略推荐 · ROI模拟</p>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Upload size={18} />
            导入客户数据
          </button>
        </div>
      </header>

      <main className="p-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <StatCard
            title="客户总数"
            value={stats.total.toString()}
            icon={<Users className="text-blue-500" size={20} />}
          />
          <StatCard
            title="高风险预警"
            value={stats.highRisk.toString()}
            icon={<AlertTriangle className="text-red-500" size={20} />}
            valueColor="text-red-500"
          />
          <StatCard
            title="预警客户"
            value={stats.warning.toString()}
            icon={<AlertTriangle className="text-yellow-500" size={20} />}
            valueColor="text-yellow-500"
          />
          <StatCard
            title="平均完成率"
            value={`${stats.avgCompletion.toFixed(1)}%`}
            icon={<TrendingUp className="text-green-500" size={20} />}
          />
          <StatCard
            title="总框架金额"
            value={`${stats.totalContract.toFixed(0)}万`}
            icon={<DollarSign className="text-purple-500" size={20} />}
          />
        </div>

        {/* 客户列表 */}
        <div className="bg-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">客户列表</h2>
          {customers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">暂无客户数据</p>
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                导入客户数据
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-300">
                    <th className="pb-3">客户名称</th>
                    <th className="pb-3">行业</th>
                    <th className="pb-3">框架金额</th>
                    <th className="pb-3">完成率</th>
                    <th className="pb-3">分层</th>
                    <th className="pb-3">剩余天数</th>
                    <th className="pb-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(customer => {
                    const analysis = analyses[customer.id] || analyzeCustomer(customer)
                    return (
                      <tr key={customer.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-4 text-gray-900">{customer.name}</td>
                        <td className="py-4 text-gray-500">{customer.industry}</td>
                        <td className="py-4 text-gray-500">{customer.contractAmount}万</td>
                        <td className="py-4">
                          <span className={`font-medium ${analysis.completionRate >= 70 ? 'text-green-600' : analysis.completionRate >= 50 ? 'text-blue-600' : analysis.completionRate >= 30 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {analysis.completionRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-4">
                          <TierBadge tier={analysis.tier} />
                        </td>
                        <td className="py-4 text-gray-500">{analysis.remainingDays}天</td>
                        <td className="py-4">
                          <button className="text-blue-500 hover:text-blue-600 text-sm">
                            查看详情
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 导入弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">导入客户数据</h3>
            <p className="text-gray-500 text-sm mb-4">
              上传CSV文件，需包含：客户名称、行业、框架金额、已完成消耗、月度消耗趋势、签约日期、到期日期
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
            {importError && (
              <p className="text-red-500 text-sm mt-2">{importError}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-gray-500 hover:text-gray-900 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 统计卡片组件
const StatCard = ({ title, value, icon, valueColor = 'text-gray-900' }: {
  title: string
  value: string
  icon: React.ReactNode
  valueColor?: string
}) => (
  <div className="bg-card rounded-xl p-4">
    <div className="flex items-center justify-between mb-2">
      <p className="text-gray-500 text-sm">{title}</p>
      {icon}
    </div>
    <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
  </div>
)

// 分层标签组件
const TierBadge = ({ tier }: { tier: string }) => {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    high_potential: { bg: 'bg-green-500/20', text: 'text-green-600', label: '高潜' },
    stable: { bg: 'bg-blue-500/20', text: 'text-blue-600', label: '稳定' },
    warning: { bg: 'bg-yellow-500/20', text: 'text-yellow-600', label: '预警' },
    high_risk: { bg: 'bg-red-500/20', text: 'text-red-500', label: '高风险' }
  }
  const c = config[tier] || { bg: 'bg-gray-500/20', text: 'text-gray-500', label: tier }
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}
