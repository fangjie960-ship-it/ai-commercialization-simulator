import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { Dashboard } from '@/pages/Dashboard'
import { CustomerList } from '@/pages/CustomerList'
import { StrategySimulator } from '@/pages/StrategySimulator'
import { DailyTrend } from '@/pages/DailyTrend'
import { CustomerDetail } from '@/pages/CustomerDetail'
import { PolicyReview } from '@/pages/PolicyReview'
import { Toaster } from 'sonner'
import { useCustomerStore } from '@/store/customerStore'
import { useEffect } from 'react'

function App() {
  const { currentPage, loadCustomers } = useCustomerStore()

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  return (
    <div className="h-screen overflow-hidden bg-[#F7F8FA] text-gray-900 flex">
      <Sidebar />
      <Toaster richColors position="top-right" />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {currentPage === 'dashboard' && <Dashboard />}
          {currentPage === 'customers' && <CustomerList />}
          {currentPage === 'strategy' && <StrategySimulator />}
          {currentPage === 'daily_trend' && <DailyTrend />}
          {currentPage === 'customer_detail' && <CustomerDetail />}
          {currentPage === 'policy_review' && <PolicyReview />}
        </main>
      </div>
    </div>
  )
}

export default App
