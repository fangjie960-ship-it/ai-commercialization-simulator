import { AlertTriangle, TrendingUp, DollarSign, ClipboardList } from 'lucide-react'
import { useMemo } from 'react'
import { useCustomerStore } from '@/store/customerStore'
import { TierBadge } from '@/components/TierBadge'
import { IndustryBadge } from '@/components/IndustryBadge'
import { ProgressBar } from '@/components/ProgressBar'
import { getTierLabel } from '@/config/classificationRules'
import { calcPolicyProgress } from '@/utils/policy'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid } from 'recharts'
import type { Customer, CustomerTier, Policy } from '@/types/customer'

const COLORS = {
  high_potential: '#22c55e',
  stable: '#3b82f6',
  warning: '#f59e0b',
  high_risk: '#ef4444'
}


export function Dashboard() {
  const { getDashboardStats, getHighRiskCustomers, analyses, customers, policies, setPage, setSelectedCustomer } = useCustomerStore()
  const stats = getDashboardStats()
  const highRiskCustomers = getHighRiskCustomers()

  // 政策执行情况
  const policyList = useMemo(() => {
    return Object.values(policies)
      .map(p => {
        const customer = customers.find(c => c.id === p.customerId)
        if (!customer) return null
        return { policy: p, customer, progress: calcPolicyProgress(p, customer) }
      })
      .filter(Boolean) as { policy: Policy; customer: Customer; progress: ReturnType<typeof calcPolicyProgress> }[]
  }, [policies, customers])

  const activePolicies = policyList.filter(x => x.progress.status !== 'done')
  const behindPolicies = activePolicies.filter(x => x.progress.status === 'behind')
  const policyOverallRate = useMemo(() => {
    const req = activePolicies.reduce((s, x) => s + x.policy.requiredIncremental, 0)
    const act = activePolicies.reduce((s, x) => s + x.progress.actualIncremental, 0)
    return req > 0 ? (act / req) * 100 : 0
  }, [activePolicies])

  // 分层分布
  const tierData = (['high_potential', 'stable', 'warning', 'high_risk'] as CustomerTier[])
    .map(t => ({ name: getTierLabel(t), value: stats.tierDistribution[t], color: COLORS[t] }))
    .filter(d => d.value > 0)

  // 四象限气泡图数据
  const bubbleData = customers.map(c => {
    const analysis = analyses[c.id]
    if (!analysis) return null
    return {
      x: analysis.currentCompletionRate,
      y: analysis.trendSlope * 10,
      z: c.contractAmount / 50,
      name: c.name,
      tier: analysis.tier,
      customerId: c.id
    }
  }).filter(Boolean)

  const handleCustomerClick = (customerId: string) => {
    setSelectedCustomer(customerId)
    setPage('customer_detail')
  }

  return (
    <div className="p-6 space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={AlertTriangle}
          label="待处理预警"
          value={stats.highRiskCount + stats.warningCount}
          color="text-yellow-500"
          subValue={`高风险 ${stats.highRiskCount} 个`}
        />
        <StatCard
          icon={TrendingUp}
          label="平均当前完成率"
          value={`${stats.averageCompletionRate}%`}
          color="text-blue-500"
          subValue="整体进度"
        />
        <StatCard
          icon={DollarSign}
          label="总框架金额"
          value={`¥${(stats.totalContractAmount / 10000).toFixed(1)}亿`}
          color="text-green-500"
          subValue={`${stats.totalCustomers} 个客户`}
        />
        <StatCard
          icon={ClipboardList}
          label="政策执行中"
          value={`${activePolicies.length}`}
          color="text-purple-500"
          subValue={activePolicies.length > 0 ? `整体增量达成 ${policyOverallRate.toFixed(0)}%` : '暂无执行中政策'}
        />
      </div>

      {/* 中部图表区 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 分层分布饼图 */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">客户分层分布</h3>
          <div className="h-64">
            {tierData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tierData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    className="cursor-pointer"
                  >
                    {tierData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity" />
                    ))}
                  </Pie>
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0]
                        const total = tierData.reduce((sum, item) => sum + item.value, 0)
                        const percentage = total > 0 ? ((data.value as number) / total * 100).toFixed(1) : '0.0'
                        return (
                          <div className="bg-gray-100 p-3 rounded-lg border border-gray-300">
                            <p className="text-gray-900 font-medium">{data.name}</p>
                            <p className="text-sm text-gray-500">数量: {data.value}</p>
                            <p className="text-sm text-gray-500">占比: {percentage}%</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                暂无数据，请在客户列表页导入数据
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            {tierData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 px-2 py-1 rounded">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-gray-500">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 四象限气泡图 */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">客户分布矩阵</h3>
          <div className="h-64">
            {bubbleData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis 
                    type="number" 
                    dataKey="x" 
                    name="完成率" 
                    unit="%" 
                    domain={[0, 150]}
                    stroke="#9ca3af"
                  />
                  <YAxis 
                    type="number" 
                    dataKey="y" 
                    name="趋势" 
                    stroke="#9ca3af"
                  />
                  <ZAxis type="number" dataKey="z" range={[50, 400]} />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="bg-gray-100 p-3 rounded-lg border border-gray-300">
                            <p className="text-gray-900 font-medium">{data.name}</p>
                            <p className="text-sm text-gray-500">当前完成率: {data.x.toFixed(1)}%</p>
                            <p className="text-sm text-gray-500">趋势: {data.y > 0 ? '上升' : data.y < 0 ? '下降' : '平稳'}</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Scatter 
                    name="客户" 
                    data={bubbleData} 
                    fill="#3b82f6"
                    onClick={(data) => handleCustomerClick((data as any).customerId)}
                  >
                    {bubbleData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[entry!.tier as CustomerTier]} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                暂无数据
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 预警区 */}
      <div className="grid grid-cols-2 gap-6">
      {/* 高风险客户列表 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            高风险客户预警
          </h3>
          <button 
            onClick={() => setPage('customers')}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            查看全部 →
          </button>
        </div>
        <div className="p-6">
          {customers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">暂无客户数据</p>
              <button
                onClick={() => setPage('customers')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                前往导入
              </button>
            </div>
          ) : highRiskCustomers.length > 0 ? (
            <div className="space-y-4">
              {highRiskCustomers.map((customer) => {
                const analysis = analyses[customer.id]
                if (!analysis) return null
                return (
                  <div 
                    key={customer.id}
                    onClick={() => handleCustomerClick(customer.id)}
                    className="flex items-center justify-between p-4 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <TierBadge tier="high_risk" />
                      <span className="text-gray-900 font-medium">{customer.name}</span>
                      <IndustryBadge industry={customer.industry} />
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="w-48">
                        <ProgressBar value={analysis.completionRate} size="sm" />
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">剩余 {analysis.remainingDays} 天</p>
                        <p className="text-xs text-red-500">需日均 ¥{analysis.requiredDailySpend.toFixed(1)}万</p>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedCustomer(customer.id)
                          setPage('strategy')
                        }}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
                      >
                        去策略模拟
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              暂无高风险客户，继续保持！
            </div>
          )}
        </div>
      </div>

      {/* 政策进度落后 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            政策进度落后
          </h3>
          <button onClick={() => setPage('policy_review')} className="text-sm text-blue-600 hover:text-blue-700">
            查看全部 →
          </button>
        </div>
        <div className="p-6">
          {behindPolicies.length === 0 ? (
            <div className="text-center py-8 text-gray-500">暂无进度落后的政策</div>
          ) : (
            <div className="space-y-4">
              {behindPolicies.map(({ policy, customer, progress }) => (
                <div
                  key={policy.id}
                  onClick={() => handleCustomerClick(customer.id)}
                  className="flex items-center justify-between p-4 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${policy.schemeType === 'waiver' ? 'bg-yellow-500/20 text-yellow-600' : 'bg-green-500/20 text-green-600'}`}>
                      {policy.schemeType === 'waiver' ? '免扣保证金' : '短期政策'}
                    </span>
                    <span className="text-gray-900 font-medium">{customer.name}</span>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-gray-500">增量达成 {(progress.incrementalProgress * 100).toFixed(0)}%</p>
                    <p className="text-xs text-red-500">时间进度 {(progress.timeProgress * 100).toFixed(0)}% · 落后</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  color: string
  subValue: string
}

function StatCard({ icon: Icon, label, value, color, subValue }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`text-2xl font-semibold mt-1 ${color}`}>{value}</p>
          <p className="text-xs text-gray-500 mt-1">{subValue}</p>
        </div>
        <div className={`p-3 rounded-lg bg-gray-100 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}
