import { useMemo, useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts'
import { useCustomerStore } from '@/store/customerStore'
import { Calendar, TrendingUp, Filter, Users, Building2, Check, ChevronDown } from 'lucide-react'
import type { Industry, IndustryCalculationConfig } from '@/types/customer'

interface DailyDataPoint {
  date: string
  totalSpend: number
  customerCount: number
  customers: string[]
}

const industries: { value: Industry; label: string }[] = [
  { value: 'drama', label: '短剧' },
  { value: 'game', label: '游戏' },
  { value: 'ecommerce', label: '电商' },
  { value: 'education', label: '教育' },
  { value: 'other', label: '其他' }
]

export function DailyTrend() {
  const { customers, setAllIndustriesCalculationConfig, calculationConfig } = useCustomerStore()
  const [selectedIndustries, setSelectedIndustries] = useState<Industry[]>([])
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([])
  const [selectionRange, setSelectionRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null })
  const [showIndustryDropdown, setShowIndustryDropdown] = useState(false)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  // 预测方式：'average' = 日均平推, 'period_based' = 基期预测 - 从localStorage恢复
  const [predictionMode, setPredictionMode] = useState<'average' | 'period_based' | null>(() => {
    const saved = localStorage.getItem('dailyTrend_predictionMode')
    return saved as 'average' | 'period_based' | null || null
  })
  // 是否使用当前选中的基期
  const [useBasePeriod, setUseBasePeriod] = useState<boolean | null>(null)
  // 预测方式是否已锁定（应用后锁定，需点击调整才能修改）- 从localStorage恢复
  const [isPredictionLocked, setIsPredictionLocked] = useState(() => {
    const saved = localStorage.getItem('dailyTrend_predictionLocked')
    return saved ? JSON.parse(saved) : false
  })
  // 保存的基期统计（用于页面切换后显示）
  const [savedRangeStats, setSavedRangeStats] = useState<{
    days: number
    totalSpend: number
    avgDailySpend: number
    startDate: string
    endDate: string
  } | null>(() => {
    const saved = localStorage.getItem('dailyTrend_rangeStats')
    return saved ? JSON.parse(saved) : null
  })

  // 根据已选行业过滤客户列表
  const availableCustomers = useMemo(() => {
    if (selectedIndustries.length === 0) {
      return customers
    }
    return customers.filter(c => selectedIndustries.includes(c.industry))
  }, [customers, selectedIndustries])

  // 获取筛选后的客户列表（用于图表显示）
  const filteredCustomers = useMemo(() => {
    if (selectedCustomers.length > 0) {
      return customers.filter(c => selectedCustomers.includes(c.id))
    }
    if (selectedIndustries.length > 0) {
      return customers.filter(c => selectedIndustries.includes(c.industry))
    }
    return customers
  }, [customers, selectedIndustries, selectedCustomers])

  // 计算每日总消耗数据（无消耗日记为0）
  const dailyData = useMemo(() => {
    if (filteredCustomers.length === 0) return []

    // 收集所有日期
    const allDates = new Set<string>()
    filteredCustomers.forEach(customer => {
      customer.dailySpend?.forEach(d => allDates.add(d.date))
    })

    // 按日期排序
    const sortedDates = Array.from(allDates).sort()

    // 计算每日总消耗（无数据视为0）
    const data: DailyDataPoint[] = sortedDates.map(date => {
      let totalSpend = 0
      const activeCustomers: string[] = []

      filteredCustomers.forEach(customer => {
        const dayData = customer.dailySpend?.find(d => d.date === date)
        if (dayData) {
          totalSpend += dayData.amount
          activeCustomers.push(customer.name)
        }
        // 无数据时 totalSpend += 0
      })

      return {
        date,
        totalSpend: parseFloat(totalSpend.toFixed(2)),
        customerCount: activeCustomers.length,
        customers: activeCustomers
      }
    })

    return data
  }, [filteredCustomers])

  // 计算Y轴domain，使折线图占图表的70-80%，且刻度为友好数值
  const yAxisDomain = useMemo(() => {
    if (dailyData.length === 0) return [0, 100]
    const values = dailyData.map(d => d.totalSpend)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min
    // 添加10%的padding
    const padding = range * 0.1

    let adjustedMin = Math.max(0, min - padding)
    let adjustedMax = max + padding

    // 根据最大值决定步长：三位数用10的倍数，两位数用5的倍数
    const step = adjustedMax >= 100 ? 10 : 5

    // 将边界调整为step的整数倍
    adjustedMin = Math.floor(adjustedMin / step) * step
    adjustedMax = Math.ceil(adjustedMax / step) * step

    return [adjustedMin, adjustedMax]
  }, [dailyData])

  // 计算选中日期区间的统计
  const rangeStats = useMemo(() => {
    if (!selectionRange.start || !selectionRange.end) return null

    const startIndex = dailyData.findIndex(d => d.date === selectionRange.start)
    const endIndex = dailyData.findIndex(d => d.date === selectionRange.end)

    if (startIndex === -1 || endIndex === -1) return null

    const rangeData = dailyData.slice(
      Math.min(startIndex, endIndex),
      Math.max(startIndex, endIndex) + 1
    )

    const totalSpend = rangeData.reduce((sum, d) => sum + d.totalSpend, 0)
    const avgDailySpend = totalSpend / rangeData.length

    return {
      days: rangeData.length,
      totalSpend: parseFloat(totalSpend.toFixed(2)),
      avgDailySpend: parseFloat(avgDailySpend.toFixed(2)),
      startDate: selectionRange.start,
      endDate: selectionRange.end
    }
  }, [dailyData, selectionRange])

  // 点击图表处理（确保起始日期 < 结束日期）
  const handleChartClick = (e: { activeLabel?: string }) => {
    if (e && e.activeLabel) {
      const clickedDate = e.activeLabel

      if (!selectionRange.start || (selectionRange.start && selectionRange.end)) {
        // 开始新的选择
        setSelectionRange({ start: clickedDate, end: null })
        // 只有未锁定时才重置基期确认状态
        if (!isPredictionLocked) {
          setUseBasePeriod(null)
        }
      } else {
        // 确保起始日期 < 结束日期
        const startDate = selectionRange.start
        if (clickedDate < startDate) {
          // 如果点击的日期早于起始日期，交换它们
          setSelectionRange({ start: clickedDate, end: startDate })
        } else {
          // 正常完成选择
          setSelectionRange(prev => ({ ...prev, end: clickedDate }))
        }
      }
    }
  }

  // 持久化锁定状态
  useEffect(() => {
    localStorage.setItem('dailyTrend_predictionLocked', JSON.stringify(isPredictionLocked))
  }, [isPredictionLocked])

  // 持久化预测方式
  useEffect(() => {
    if (predictionMode) {
      localStorage.setItem('dailyTrend_predictionMode', predictionMode)
    }
  }, [predictionMode])

  // 当选择新的基期区间时，如果已锁定，需要解锁
  useEffect(() => {
    if (isPredictionLocked && selectionRange.start && selectionRange.end) {
      // 如果选择了新的区间且与保存的不同，自动解锁
      if (savedRangeStats &&
          (savedRangeStats.startDate !== selectionRange.start ||
           savedRangeStats.endDate !== selectionRange.end)) {
        setIsPredictionLocked(false)
      }
    }
  }, [selectionRange, isPredictionLocked, savedRangeStats])

  return (
    <div className="p-6 space-y-6">
      {/* 标题和筛选区 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">每日消耗趋势</h2>
        </div>
        <div className="flex items-center gap-3">
          {/* 行业多选筛选 */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-500" />
              <button
                onClick={() => setShowIndustryDropdown(!showIndustryDropdown)}
                className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500 flex items-center gap-2"
              >
                <span>
                  {selectedIndustries.length === 0 
                    ? '全部行业' 
                    : selectedIndustries.length === 1 
                      ? industries.find(i => i.value === selectedIndustries[0])?.label
                      : `已选 ${selectedIndustries.length} 个行业`
                  }
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            {showIndustryDropdown && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-gray-100 border border-gray-300 rounded-lg shadow-lg z-50">
                {/* 全选选项 */}
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-200 cursor-pointer text-sm text-gray-900 border-b border-gray-300">
                  <div className={`w-4 h-4 rounded border ${selectedIndustries.length === industries.length ? 'bg-blue-500 border-blue-500' : 'border-gray-500'}`}>
                    {selectedIndustries.length === industries.length && <Check className="w-4 h-4 text-gray-900" />}
                  </div>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={selectedIndustries.length === industries.length}
                    onChange={() => {
                      if (selectedIndustries.length === industries.length) {
                        setSelectedIndustries([])
                      } else {
                        setSelectedIndustries(industries.map(i => i.value))
                      }
                      // 清除已选客户（因为行业变了，客户选项会变）
                      setSelectedCustomers([])
                    }}
                  />
                  全选
                </label>
                {industries.map(i => (
                  <label
                    key={i.value}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-200 cursor-pointer text-sm text-gray-700"
                  >
                    <div className={`w-4 h-4 rounded border ${selectedIndustries.includes(i.value) ? 'bg-blue-500 border-blue-500' : 'border-gray-500'}`}>
                      {selectedIndustries.includes(i.value) && <Check className="w-4 h-4 text-gray-900" />}
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={selectedIndustries.includes(i.value)}
                      onChange={() => {
                        if (selectedIndustries.includes(i.value)) {
                          setSelectedIndustries(prev => prev.filter(v => v !== i.value))
                        } else {
                          setSelectedIndustries(prev => [...prev, i.value])
                        }
                        // 清除已选客户（因为行业变了，客户选项会变）
                        setSelectedCustomers([])
                      }}
                    />
                    {i.label}
                  </label>
                ))}
                <div className="border-t border-gray-300 px-3 py-2">
                  <button
                    onClick={() => setShowIndustryDropdown(false)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 客户多选筛选 */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              <button
                onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500 w-48 flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  {selectedCustomers.length === 0 
                    ? '全部客户' 
                    : selectedCustomers.length === 1 
                      ? availableCustomers.find(c => c.id === selectedCustomers[0])?.name
                      : `已选 ${selectedCustomers.length} 个客户`
                  }
                </span>
                <ChevronDown className="w-4 h-4 flex-shrink-0" />
              </button>
            </div>
            {showCustomerDropdown && (
              <div className="absolute top-full right-0 mt-1 w-56 bg-gray-100 border border-gray-300 rounded-lg shadow-lg z-50 max-h-80 overflow-auto">
                <div className="px-3 py-2 border-b border-gray-300 text-xs text-gray-500">
                  {selectedIndustries.length > 0 ? '已按行业筛选' : '全部客户'}
                </div>
                {/* 全选选项 */}
                {availableCustomers.length > 0 && (
                  <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-200 cursor-pointer text-sm text-gray-900 border-b border-gray-300">
                    <div className={`w-4 h-4 rounded border ${selectedCustomers.length === availableCustomers.length ? 'bg-blue-500 border-blue-500' : 'border-gray-500'}`}>
                      {selectedCustomers.length === availableCustomers.length && <Check className="w-4 h-4 text-gray-900" />}
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={selectedCustomers.length === availableCustomers.length}
                      onChange={() => {
                        if (selectedCustomers.length === availableCustomers.length) {
                          setSelectedCustomers([])
                        } else {
                          setSelectedCustomers(availableCustomers.map(c => c.id))
                        }
                      }}
                    />
                    全选
                  </label>
                )}
                {availableCustomers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">无可用客户</div>
                ) : (
                  availableCustomers.map(c => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-200 cursor-pointer text-sm text-gray-700"
                    >
                      <div className={`w-4 h-4 rounded border ${selectedCustomers.includes(c.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-500'}`}>
                        {selectedCustomers.includes(c.id) && <Check className="w-4 h-4 text-gray-900" />}
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={selectedCustomers.includes(c.id)}
                        onChange={() => {
                          if (selectedCustomers.includes(c.id)) {
                            setSelectedCustomers(prev => prev.filter(v => v !== c.id))
                          } else {
                            setSelectedCustomers(prev => [...prev, c.id])
                          }
                        }}
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  ))
                )}
                <div className="border-t border-gray-300 px-3 py-2 flex justify-between">
                  <button
                    onClick={() => setSelectedCustomers([])}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    清空
                  </button>
                  <button
                    onClick={() => setShowCustomerDropdown(false)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 图表区 */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        {dailyData.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {selectedCustomers.length === 1
                  ? customers.find(c => c.id === selectedCustomers[0])?.name
                  : selectedIndustries.length === 1
                    ? industries.find(i => i.value === selectedIndustries[0])?.label
                    : selectedCustomers.length > 1
                      ? `${selectedCustomers.length}个客户`
                      : selectedIndustries.length > 1
                        ? `${selectedIndustries.length}个行业`
                        : '全部客户'}
                每日消耗趋势
              </h3>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>点击图表选择基期区间</span>
                {selectionRange.start && !selectionRange.end && (
                  <span className="text-blue-600">请选择结束日期</span>
                )}
                {selectionRange.start && selectionRange.end && (
                  <button
                    onClick={() => setSelectionRange({ start: null, end: null })}
                    className="text-red-500 hover:text-red-300"
                  >
                    清除选择
                  </button>
                )}
              </div>
            </div>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dailyData}
                  onClick={handleChartClick}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="date"
                    stroke="#9ca3af"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => {
                      const date = new Date(value)
                      return `${date.getMonth() + 1}/${date.getDate()}`
                    }}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `¥${value}万`}
                    domain={yAxisDomain}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as DailyDataPoint
                        return (
                          <div className="bg-gray-100 p-3 rounded-lg border border-gray-300">
                            <p className="text-gray-900 font-medium">{label}</p>
                            <p className="text-blue-600">总消耗: ¥{data.totalSpend}万</p>
                            <p className="text-gray-500 text-sm">活跃客户: {data.customerCount}个</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  {selectionRange.start && selectionRange.end && (
                    <ReferenceArea
                      x1={selectionRange.start}
                      x2={selectionRange.end}
                      stroke="#3B82F6"
                      fill="#3B82F6"
                      fillOpacity={0.1}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="totalSpend"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={{ fill: '#3B82F6', strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 6, fill: '#60A5FA' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="h-80 flex items-center justify-center text-gray-500">
            暂无数据，请先导入客户数据
          </div>
        )}
      </div>

      {/* 统计信息区 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 日均消耗和预测方式选择 */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-medium text-gray-900">日均消耗与预测</h3>
          </div>
          {dailyData.length > 0 ? (
            <div className="space-y-4">
              {/* 显示整体日均消耗（含0） */}
              <div className="flex justify-between items-center p-3 bg-gray-100 rounded-lg">
                <span className="text-gray-500">整体日均消耗</span>
                <span className="text-blue-600 font-medium text-lg">
                  ¥{(dailyData.reduce((sum, d) => sum + d.totalSpend, 0) / dailyData.length).toFixed(2)}万
                </span>
              </div>

              {isPredictionLocked ? (
                // 锁定状态：显示当前预测详情和调整按钮
                <div className="space-y-3">
                  <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <p className="text-sm text-green-600 font-medium">
                      当前预测方式：{predictionMode === 'average' ? '日均平推' : '基期预测'}
                    </p>
                    {predictionMode === 'average' && (
                      <div className="mt-2 space-y-1 text-xs text-gray-500">
                        <p>预测基准：整体日均消耗</p>
                        <p>日均金额：¥{(dailyData.reduce((sum, d) => sum + d.totalSpend, 0) / dailyData.length).toFixed(2)}万</p>
                      </div>
                    )}
                    {predictionMode === 'period_based' && savedRangeStats && (
                      <div className="mt-2 space-y-1 text-xs text-gray-500">
                        <p>基期区间：{savedRangeStats.startDate} 至 {savedRangeStats.endDate}</p>
                        <p>区间天数：{savedRangeStats.days}天</p>
                        <p>基期日均：¥{savedRangeStats.avgDailySpend}万</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setIsPredictionLocked(false)
                      setUseBasePeriod(null)
                      // 清除保存的数据
                      setSavedRangeStats(null)
                      localStorage.removeItem('dailyTrend_rangeStats')
                      localStorage.removeItem('dailyTrend_predictionMode')
                      localStorage.removeItem('dailyTrend_predictionLocked')
                    }}
                    className="w-full px-3 py-2 bg-white text-gray-700 rounded-lg text-sm hover:bg-gray-600 transition-colors"
                  >
                    调整预测方式
                  </button>
                </div>
              ) : (
                // 未锁定状态：显示选择界面
                <>
                  {/* 预测方式选择（日均 vs 基期） */}
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">选择预测方式：</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setPredictionMode('average')
                          setUseBasePeriod(null)
                          setIsPredictionLocked(true)
                          // 清除保存的基期统计
                          setSavedRangeStats(null)
                          localStorage.removeItem('dailyTrend_rangeStats')
                          localStorage.setItem('dailyTrend_predictionMode', 'average')
                          // 应用到所有行业
                          const allIndustries: Industry[] = ['drama', 'game', 'ecommerce', 'education', 'other']
                          const configs: Record<string, IndustryCalculationConfig> = {}
                          allIndustries.forEach(industry => {
                            configs[industry] = {
                              model: 'average',
                              periodStartDate: calculationConfig.industryConfigs[industry]?.periodStartDate,
                              periodEndDate: calculationConfig.industryConfigs[industry]?.periodEndDate,
                              useDefault: false
                            }
                          })
                          setAllIndustriesCalculationConfig(configs)
                        }}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          predictionMode === 'average'
                            ? 'bg-blue-500 text-gray-900'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        日均平推
                      </button>
                      <button
                        onClick={() => {
                          setPredictionMode('period_based')
                          setUseBasePeriod(null)
                        }}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          predictionMode === 'period_based'
                            ? 'bg-purple-500 text-gray-900'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        基期预测
                      </button>
                    </div>
                  </div>

                  {/* 根据选择的预测方式显示不同提示 */}
                  {predictionMode === 'average' && (
                    <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <p className="text-sm text-blue-600">
                        已选择：日均平推预测
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        整体日均消耗 ¥{(dailyData.reduce((sum, d) => sum + d.totalSpend, 0) / dailyData.length).toFixed(2)}万 将作为预测基准
                      </p>
                    </div>
                  )}
                  {predictionMode === 'period_based' && !rangeStats && (
                    <p className="text-sm text-gray-500">
                      请在图表上选择基期区间（点击两个日期）
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className="text-gray-500">暂无数据</p>
          )}
        </div>

        {/* 基期区间统计与确认 */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-medium text-gray-900">基期区间统计</h3>
          </div>
          {rangeStats ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">区间天数</span>
                <span className="text-gray-900 font-medium">{rangeStats.days}天</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">区间总消耗</span>
                <span className="text-green-600 font-medium">¥{rangeStats.totalSpend}万</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">日均消耗</span>
                <span className="text-blue-600 font-medium">¥{rangeStats.avgDailySpend}万</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">起始日期</span>
                <span className="text-gray-900 font-medium">{rangeStats.startDate}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">结束日期</span>
                <span className="text-gray-900 font-medium">{rangeStats.endDate}</span>
              </div>

              {/* 是否使用此基期作为预测 - 锁定时禁用 */}
              {predictionMode === 'period_based' && !isPredictionLocked && (
                <div className="mt-4 p-3 bg-gray-100 rounded-lg border border-gray-300">
                  <p className="text-sm text-gray-500 mb-3">
                    是否将此基期作为预测方式？
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setUseBasePeriod(true)
                        setIsPredictionLocked(true)
                        // 保存基期统计到localStorage
                        const statsToSave = {
                          days: rangeStats.days,
                          totalSpend: rangeStats.totalSpend,
                          avgDailySpend: rangeStats.avgDailySpend,
                          startDate: rangeStats.startDate,
                          endDate: rangeStats.endDate
                        }
                        setSavedRangeStats(statsToSave)
                        localStorage.setItem('dailyTrend_rangeStats', JSON.stringify(statsToSave))
                        localStorage.setItem('dailyTrend_predictionMode', 'period_based')
                        // 应用到所有行业
                        const allIndustries: Industry[] = ['drama', 'game', 'ecommerce', 'education', 'other']
                        const configs: Record<string, IndustryCalculationConfig> = {}
                        allIndustries.forEach(industry => {
                          configs[industry] = {
                            model: 'period_based',
                            periodStartDate: rangeStats.startDate,
                            periodEndDate: rangeStats.endDate,
                            useDefault: false
                          }
                        })
                        setAllIndustriesCalculationConfig(configs)
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        useBasePeriod === true
                          ? 'bg-green-500 text-gray-900'
                          : 'bg-white text-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      是
                    </button>
                    <button
                      onClick={() => setUseBasePeriod(false)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        useBasePeriod === false
                          ? 'bg-red-500 text-gray-900'
                          : 'bg-white text-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      否
                    </button>
                  </div>
                  {useBasePeriod === true && (
                    <p className="text-xs text-green-600 mt-2">
                      已应用基期预测：日均 ¥{rangeStats.avgDailySpend}万
                    </p>
                  )}
                </div>
              )}
              {/* 锁定时显示已应用的基期信息 */}
              {predictionMode === 'period_based' && isPredictionLocked && savedRangeStats && (
                <div className="mt-4 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <p className="text-xs text-green-600">
                    已应用基期预测：{savedRangeStats.startDate} 至 {savedRangeStats.endDate}，日均 ¥{savedRangeStats.avgDailySpend}万
                  </p>
                </div>
              )}
              {predictionMode !== 'period_based' && (
                <p className="text-xs text-gray-500 mt-2">
                  请先选择"基期预测"作为预测方式
                </p>
              )}
            </div>
          ) : (
            <div className="text-gray-500">
              <p>在图表上点击两个日期选择基期区间</p>
              <p className="text-sm mt-2 text-gray-500">建议选择一个消耗趋势相对稳定的区间作为基期</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
