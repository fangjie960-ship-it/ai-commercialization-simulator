import { LayoutDashboard, Users, Target, TrendingUp, FileText, Calculator, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { useCustomerStore } from '@/store/customerStore'
import type { Industry, PredictionModel } from '@/types/customer'

const navItems = [
  { id: 'dashboard' as const, label: '工作台', icon: LayoutDashboard },
  { id: 'customers' as const, label: '客户列表', icon: Users },
  { id: 'daily_trend' as const, label: '消耗趋势', icon: TrendingUp },
  { id: 'strategy' as const, label: '策略模拟', icon: Target },
  { id: 'policy_review' as const, label: '政策复盘', icon: FileText },
]

const industryLabels: Record<Industry, string> = {
  drama: '短剧',
  game: '游戏',
  ecommerce: '电商',
  education: '教育',
  other: '其他'
}

export function Sidebar() {
  const { 
    currentPage, 
    setPage, 
    getDashboardStats, 
    calculationConfig, 
    setIndustryCalculationConfig,
    recalculateAll 
  } = useCustomerStore()
  const stats = getDashboardStats()
  const [showCalcConfig, setShowCalcConfig] = useState(false)

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col h-screen shrink-0">
      {/* Logo */}
      <div className="h-16 px-6 flex items-center border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-500" />
          <span>AI策略模拟器</span>
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                ${isActive 
                  ? 'bg-blue-500/10 text-blue-600' 
                  : 'text-gray-500 hover:bg-gray-200 hover:text-gray-200'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
              {item.id === 'dashboard' && stats.highRiskCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {stats.highRiskCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-gray-200 space-y-2 shrink-0 max-h-[45vh] overflow-y-auto">
        {/* 计算配置面板 */}
        <div className="bg-gray-100 rounded-lg overflow-hidden">
          <button 
            onClick={() => setShowCalcConfig(!showCalcConfig)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Calculator className="w-4 h-4" />
              <span>计算配置</span>
            </div>
            {showCalcConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {showCalcConfig && (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-gray-500">选择预测模型计算完成率</p>
              
              {(Object.keys(industryLabels) as Industry[]).map((industry) => {
                const config = calculationConfig.industryConfigs[industry]
                const isPeriodBased = config.model === 'period_based'
                
                return (
                  <div key={industry} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{industryLabels[industry]}</span>
                      <select
                        value={config.model}
                        onChange={(e) => {
                          const model = e.target.value as PredictionModel
                          setIndustryCalculationConfig(industry, {
                            model,
                            useDefault: false,
                            periodStartDate: config.periodStartDate,
                            periodEndDate: config.periodEndDate
                          })
                          recalculateAll()
                        }}
                        className="text-xs bg-white border border-gray-300 rounded px-2 py-1 text-gray-900"
                      >
                        <option value="average">日均平推</option>
                        <option value="period_based">基期预测</option>
                      </select>
                    </div>
                    
                    {isPeriodBased && (
                      <div className="space-y-1 pl-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap" title="留空=取数据最新日期">累计日:</span>
                          <input
                            type="date"
                            value={config.consumptionCutoffDate || ''}
                            onChange={(e) => {
                              setIndustryCalculationConfig(industry, {
                                ...config,
                                consumptionCutoffDate: e.target.value,
                                useDefault: false
                              })
                            }}
                            className="text-xs bg-white border border-gray-300 rounded px-2 py-1 text-gray-900 flex-1 min-w-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">基期起:</span>
                          <input
                            type="date"
                            value={config.periodStartDate || ''}
                            onChange={(e) => {
                              setIndustryCalculationConfig(industry, {
                                ...config,
                                periodStartDate: e.target.value,
                                useDefault: false
                              })
                            }}
                            className="text-xs bg-white border border-gray-300 rounded px-2 py-1 text-gray-900 flex-1 min-w-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">截止日:</span>
                          <input
                            type="date"
                            value={config.periodEndDate || ''}
                            onChange={(e) => {
                              setIndustryCalculationConfig(industry, {
                                ...config,
                                periodEndDate: e.target.value,
                                useDefault: false
                              })
                            }}
                            className="text-xs bg-white border border-gray-300 rounded px-2 py-1 text-gray-900 flex-1 min-w-0"
                          />
                        </div>
                        <button
                          onClick={recalculateAll}
                          disabled={!config.periodStartDate || !config.periodEndDate}
                          className="w-full mt-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-white disabled:text-gray-500 text-white text-xs rounded transition-colors"
                        >
                          应用并重新计算
                        </button>
                        <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                          基期选一段稳定区间算日均；累计以 YTD 已完成消耗为准（流水未覆盖全年时不低估）
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>


      </div>
    </aside>
  )
}
