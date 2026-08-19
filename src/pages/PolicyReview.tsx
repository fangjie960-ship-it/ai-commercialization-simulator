import { useMemo } from 'react'
import { ClipboardList, Target } from 'lucide-react'
import { useCustomerStore } from '@/store/customerStore'
import { calcPolicyProgress } from '@/utils/policy'
import type { Policy } from '@/types/customer'

/**
 * 政策复盘
 * @description 政策期结束后查看整体完成情况；执行中的政策也在此跟踪
 */
export function PolicyReview() {
  const { customers, policies, setPage, setSelectedCustomer } = useCustomerStore()

  const list = useMemo(() => {
    return Object.values(policies)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(policy => {
        const customer = customers.find(c => c.id === policy.customerId)
        if (!customer) return null
        return { policy, customer, progress: calcPolicyProgress(policy, customer) }
      })
      .filter(Boolean) as { policy: Policy; customer: (typeof customers)[number]; progress: ReturnType<typeof calcPolicyProgress> }[]
  }, [policies, customers])

  const active = list.filter(x => x.progress.status !== 'done')
  const ended = list.filter(x => x.progress.status === 'done')

  if (list.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <ClipboardList className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">暂无已执行的政策</p>
          <button
            onClick={() => setPage('strategy')}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            去策略模拟页执行政策
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">政策复盘</h2>
          <span className="text-sm text-gray-500 ml-2">执行中 {active.length} · 已结束 {ended.length}</span>
        </div>

        {active.length > 0 && (
          <div className="grid grid-cols-5 gap-4">
            <SummaryCard label="执行中政策" value={`${active.length}`} />
            <SummaryCard label="已达标" value={`${active.filter(x => x.progress.incrementalProgress >= 1).length}`} />
            <SummaryCard label="进度落后" value={`${active.filter(x => x.progress.status === 'behind').length}`} />
            <SummaryCard
              label="整体增量达成"
              value={(() => {
                const req = active.reduce((s, x) => s + x.policy.requiredIncremental, 0)
                const act = active.reduce((s, x) => s + x.progress.actualIncremental, 0)
                return req > 0 ? `${((act / req) * 100).toFixed(0)}%` : '—'
              })()}
            />
            <SummaryCard
              label="平均时间进度"
              value={(() => {
                const avg = active.reduce((s, x) => s + x.progress.timeProgress, 0) / Math.max(1, active.length)
                return `${(avg * 100).toFixed(0)}%`
              })()}
            />
          </div>
        )}

        <PolicyTable title="执行中政策" rows={active} onOpenDetail={(id) => { setSelectedCustomer(id); setPage('customer_detail') }} />
        <PolicyTable title="已结束政策（复盘）" rows={ended} onOpenDetail={(id) => { setSelectedCustomer(id); setPage('customer_detail') }} />

        {ended.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-sm font-medium text-gray-700 mb-3">整体复盘摘要</h4>
            <div className="grid grid-cols-3 gap-4">
              <SummaryCard label="已结束政策数" value={`${ended.length}`} />
              <SummaryCard label="达标客户数" value={`${ended.filter(x => x.progress.incrementalProgress >= 1).length}`} />
              <SummaryCard
                label="平均增量达成率"
                value={(() => {
                  const avg = ended.reduce((s, x) => s + x.progress.incrementalProgress, 0) / Math.max(1, ended.length)
                  return `${(avg * 100).toFixed(0)}%`
                })()}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PolicyTable({ title, rows, onOpenDetail }: { title: string; rows: { policy: Policy; customer: { id: string; name: string }; progress: ReturnType<typeof calcPolicyProgress> }[]; onOpenDetail: (id: string) => void }) {
  if (rows.length === 0) return null
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <div className="px-5 py-3 border-b border-gray-200">
        <h4 className="text-sm font-medium text-gray-700">{title}</h4>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-3 text-left text-gray-500">客户</th>
            <th className="px-4 py-3 text-left text-gray-500">方案</th>
            <th className="px-4 py-3 text-right text-gray-500">政策期</th>
            <th className="px-4 py-3 text-right text-gray-500">要求增量</th>
            <th className="px-4 py-3 text-right text-gray-500">实际增量</th>
            <th className="px-4 py-3 text-right text-gray-500">增量达成</th>
            <th className="px-4 py-3 text-center text-gray-500">状态</th>
            <th className="px-4 py-3 text-center text-gray-500">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map(({ policy, customer, progress }) => (
            <tr key={policy.id}>
              <td className="px-4 py-3 text-gray-900">{customer.name}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs ${policy.schemeType === 'waiver' ? 'bg-yellow-500/20 text-yellow-600' : 'bg-green-500/20 text-green-600'}`}>
                  {policy.schemeType === 'waiver' ? '免扣保证金' : '短期政策'}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {policy.startDate} ~ {policy.endDate}
              </td>
              <td className="px-4 py-3 text-right text-gray-900">¥{policy.requiredIncremental.toFixed(0)}万</td>
              <td className="px-4 py-3 text-right text-gray-900">¥{progress.actualIncremental.toFixed(1)}万</td>
              <td className="px-4 py-3 text-right">
                <span className={progress.incrementalProgress >= 1 ? 'text-green-600' : 'text-yellow-600'}>
                  {(progress.incrementalProgress * 100).toFixed(0)}%
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <StatusText status={progress.status} />
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  onClick={() => onOpenDetail(customer.id)}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Target className="w-3.5 h-3.5" /> 详情
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusText({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    done: { text: '已结束', cls: 'text-gray-500' },
    ahead: { text: '已达标', cls: 'text-green-600' },
    on_track: { text: '正常', cls: 'text-blue-600' },
    behind: { text: '落后', cls: 'text-red-500' },
  }
  const cfg = map[status] ?? map.on_track
  return <span className={`text-xs ${cfg.cls}`}>{cfg.text}</span>
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-100 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}