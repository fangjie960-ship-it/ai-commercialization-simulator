import { Bell, User } from 'lucide-react'
import { useCustomerStore } from '@/store/customerStore'

const PAGE_TITLES: Record<string, string> = {
  dashboard: '工作台',
  customers: '客户列表',
  daily_trend: '消耗趋势',
  strategy: '策略模拟',
  policy_review: '政策复盘',
  customer_detail: '客户详情',
}

/**
 * 顶栏：左侧显示当前页面标题；右侧铃铛显示待处理预警数（点击跳工作台）
 */
export function TopBar() {
  const { currentPage, setPage, getDashboardStats } = useCustomerStore()
  const stats = getDashboardStats()
  const alertCount = stats.highRiskCount + stats.warningCount

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <h1 className="text-base font-semibold text-gray-900">
        {PAGE_TITLES[currentPage] || 'AI商业化策略模拟器'}
      </h1>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setPage('dashboard')}
          title="待处理预警（点击前往工作台）"
          className="relative p-2 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <Bell className="w-5 h-5" />
          {alertCount > 0 && (
            <span className="absolute top-0 right-0 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] leading-4 rounded-full text-center">
              {alertCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm text-gray-700">运营主管</span>
        </div>
      </div>
    </header>
  )
}