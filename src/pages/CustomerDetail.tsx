import { useCallback, useMemo, useState } from 'react'
import { ArrowLeft, Target, Loader2, Sparkles } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useCustomerStore } from '@/store/customerStore'
import { TierBadge } from '@/components/TierBadge'
import { IndustryBadge } from '@/components/IndustryBadge'
import { calcPolicyProgress } from '@/utils/policy'
import { getAIRecommendation } from '@/api/recommend'
import { getStrategyName } from '@/config/strategyLibrary'
import type { CustomerAnalysis, StrategyRecommendation } from '@/types/customer'

/**
 * 客户详情页
 * @description 点开客户 = 看现状：基本信息、完成率、消耗趋势、政策进度
 * 策略设计在「策略模拟」页（批量）完成，这里只做展示
 */
export function CustomerDetail() {
  const { customers, analyses, selectedCustomerId, policies, setPage, setSelectedCustomer } = useCustomerStore()
  const [showAI, setShowAI] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [recommendation, setRecommendation] = useState<StrategyRecommendation | null>(null)

  const customer = selectedCustomerId ? customers.find(c => c.id === selectedCustomerId) : null
  const analysis: CustomerAnalysis | null = customer ? analyses[customer.id] : null
  const policy = customer ? policies[customer.id] : undefined
  const policyProgress = customer && policy ? calcPolicyProgress(policy, customer) : null

  // 短期政策的两档达标线（基础/激励），从政策里存的增速阶梯还原
  const shortTermLevels = useMemo(() => {
    if (!policy || policy.schemeType !== 'short_term' || !policyProgress) return [] as { growth: number; rebate: number; requiredDaily: number; requiredIncremental: number }[]
    const tiers = policy.tiers && policy.tiers.length > 0
      ? policy.tiers
      : [{ growth: policy.growth, incrementalRebate: policy.incrementalRebate }]
    return tiers.map(t => ({
      growth: t.growth,
      rebate: t.incrementalRebate,
      requiredDaily: policy.baseDaily * (1 + t.growth / 100),
      requiredIncremental: policy.baseDaily * (t.growth / 100) * policyProgress.totalDays,
    }))
  }, [policy, policyProgress])

  // 基期日均：跟随预估方式
  const baseDaily = useMemo(() => {
    if (!analysis) return 0
    return analysis.completionRateSource === 'period_based'
      ? (analysis.periodBasedData?.periodDailyAverage ?? analysis.currentDailySpend)
      : analysis.currentDailySpend
  }, [analysis])

  // 月趋势数据
  const monthlyData = useMemo(() => {
    if (!customer) return []
    return customer.monthlyTrend.map((v, i) => ({ month: `M${i + 1}`, value: v }))
  }, [customer])

  // 日消耗数据（最近 90 天，从旧到新）
  const dailyData = useMemo(() => {
    if (!customer) return []
    return customer.dailySpend
      .slice(-90)
      .map(d => ({ date: d.date.slice(5), value: d.amount }))
  }, [customer])

  const fetchAI = useCallback(async () => {
    if (!customer || !analysis) return
    setShowAI(true)
    setAiLoading(true)
    setAiError(null)
    setRecommendation(null)
    try {
      const rec = await getAIRecommendation(customer, analysis)
      setRecommendation(rec)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 分析失败，请重试')
    } finally {
      setAiLoading(false)
    }
  }, [customer, analysis])

  if (!customer || !analysis) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">请先选择一个客户</p>
          <button
            onClick={() => setPage('customers')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            前往客户列表
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
        <button
          onClick={() => {
            setSelectedCustomer(null)
            setPage('customers')
          }}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回客户列表</span>
        </button>
        <h2 className="text-lg font-medium text-gray-900">客户详情</h2>
        <button
          onClick={() => setPage('strategy')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
        >
          <Target className="w-4 h-4" />
          去策略模拟
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
          {/* 基本信息 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-xl font-semibold text-gray-900">{customer.name}</h3>
              <TierBadge tier={analysis.tier} size="md" />
              <IndustryBadge industry={customer.industry} />
              {customer.grade && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">等级 {customer.grade}</span>
              )}
              {policy && <PolicyBadge schemeType={policy.schemeType} />}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
              <InfoItem label="营业执照" value={customer.businessLicense} mono />
              <InfoItem label="框架金额" value={`¥${customer.contractAmount}万`} />
              <InfoItem label="签约日期" value={customer.contractDate} />
              <InfoItem label="到期日期" value={customer.expireDate} />
            </div>
            {customer.remark && <p className="text-xs text-gray-500 mt-3">备注：{customer.remark}</p>}
          </div>

          {/* 完成率卡片 */}
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard label="当前完成率" value={`${analysis.currentCompletionRate.toFixed(1)}%`} color="text-gray-700" />
            <MetricCard label="预估完成率" value={`${analysis.completionRate.toFixed(1)}%`} color="text-blue-600" />
            <MetricCard label="预估消耗达成" value={`¥${analysis.estimatedYearlySpend.toFixed(1)}万`} color="text-gray-700" />
            <MetricCard label="预估扣罚保证金" value={`¥${analysis.estimatedPenaltyDeposit.toFixed(1)}万`} color="text-red-500" />
            <MetricCard label="剩余天数" value={`${analysis.remainingDays}天`} color="text-gray-700" />
            <MetricCard label="需日均 / 基期日均" value={`${analysis.requiredDailySpend.toFixed(1)} / ${baseDaily.toFixed(1)}`} color="text-gray-700" />
          </div>

          {/* 消耗趋势 */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-medium text-gray-700 mb-3">月度消耗趋势</h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="month" stroke="#9CA3AF" fontSize={11} />
                    <YAxis stroke="#9CA3AF" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: 8 }} itemStyle={{ color: '#111827' }} />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-medium text-gray-700 mb-3">每日消耗（近90天）</h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} />
                    <YAxis stroke="#9CA3AF" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: 8 }} itemStyle={{ color: '#111827' }} />
                    <Area type="monotone" dataKey="value" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 政策进度 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-sm font-medium text-gray-700 mb-4">政策进度</h4>
            {policy && policyProgress ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <PolicyBadge schemeType={policy.schemeType} />
                    <span className="text-sm text-gray-700">{policy.name}</span>
                    <span className="text-xs text-gray-500">{policy.startDate} ~ {policy.endDate}</span>
                  </div>
                  <StatusBadge status={policyProgress.status} />
                </div>
                <ProgressRow label="政策时间进度" value={policyProgress.timeProgress} display={`${policyProgress.elapsedDays} / ${policyProgress.totalDays} 天`} color="#3b82f6" />
                {policy.schemeType === 'short_term' && shortTermLevels.length > 0 ? (
                  <>
                    <div className="text-xs text-gray-500">
                      基期日均 ¥{policy.baseDaily.toFixed(2)}万/天 · 政策期 {policy.startDate} ~ {policy.endDate}（{policyProgress.totalDays} 天）
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-500">档位</th>
                            <th className="px-3 py-2 text-right text-gray-500">增速</th>
                            <th className="px-3 py-2 text-right text-gray-500">返点</th>
                            <th className="px-3 py-2 text-right text-gray-500">目标日均</th>
                            <th className="px-3 py-2 text-right text-gray-500">要求增量</th>
                            <th className="px-3 py-2 text-right text-gray-500">当前增量</th>
                            <th className="px-3 py-2 text-center text-gray-500">达成情况</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {shortTermLevels.map((l, i) => {
                            const achieved = policyProgress.actualIncremental >= l.requiredIncremental
                            const pct = l.requiredIncremental > 0 ? (policyProgress.actualIncremental / l.requiredIncremental) * 100 : 0
                            return (
                              <tr key={i} className={achieved ? 'bg-green-500/5' : ''}>
                                <td className="px-3 py-2 text-gray-900">{i === 0 ? '基础档' : '激励档'}</td>
                                <td className="px-3 py-2 text-right text-gray-700">+{l.growth}%</td>
                                <td className="px-3 py-2 text-right text-gray-700">{l.rebate}%</td>
                                <td className="px-3 py-2 text-right text-gray-900">¥{l.requiredDaily.toFixed(2)}万</td>
                                <td className="px-3 py-2 text-right text-gray-900">¥{l.requiredIncremental.toFixed(1)}万</td>
                                <td className="px-3 py-2 text-right text-gray-900">¥{policyProgress.actualIncremental.toFixed(1)}万</td>
                                <td className="px-3 py-2 text-center">
                                  {achieved ? <span className="text-green-600">✅ 已达成</span> : <span className="text-yellow-600">{Math.min(100, pct).toFixed(0)}%</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-gray-500">
                      当前实际增量 ¥{policyProgress.actualIncremental.toFixed(1)}万：
                      {(() => {
                        const achievedCount = shortTermLevels.filter(l => policyProgress.actualIncremental >= l.requiredIncremental).length
                        if (achievedCount >= shortTermLevels.length) return '已达成最高档，返点按最高档兑现'
                        if (achievedCount > 0) return `已达成基础档（${shortTermLevels[achievedCount - 1].rebate}% 返点），继续冲激励档`
                        return '尚未达成基础档，需加快投放'
                      })()}
                    </div>
                  </>
                ) : (
                  <ProgressRow
                    label="增量进度（实际/要求增量）"
                    value={Math.min(1, policyProgress.incrementalProgress)}
                    display={`¥${policyProgress.actualIncremental.toFixed(1)}万 / ¥${policy.requiredIncremental.toFixed(1)}万`}
                    color="#22c55e"
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-gray-500">该客户暂未参加政策</p>
                <button
                  onClick={() => setPage('strategy')}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors"
                >
                  去策略模拟页设计政策
                </button>
              </div>
            )}
          </div>

          {/* AI 现状分析（按需） */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" /> AI 现状分析
              </h4>
              {!showAI && (
                <button
                  onClick={fetchAI}
                  className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-600 text-xs rounded-lg transition-colors"
                >
                  生成分析
                </button>
              )}
            </div>
            {aiLoading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> 正在分析客户现状...
              </div>
            ) : aiError ? (
              <div className="text-sm text-red-500">{aiError}</div>
            ) : recommendation ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  {recommendation.strategies.map(s => (
                    <span key={s} className="px-2 py-0.5 bg-blue-500/20 text-blue-600 rounded text-xs">{getStrategyName(s)}</span>
                  ))}
                  <span className="text-xs text-green-600">推荐指数 {(recommendation.confidence * 100).toFixed(0)}%</span>
                </div>
                {recommendation.explanation && <p className="text-sm text-gray-700 leading-relaxed">{recommendation.explanation}</p>}
                <ul className="space-y-1 text-sm text-gray-500">
                  {recommendation.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-sm text-gray-700 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-medium ${color}`}>{value}</p>
    </div>
  )
}

function PolicyBadge({ schemeType }: { schemeType: 'waiver' | 'short_term' }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${schemeType === 'waiver' ? 'bg-yellow-500/20 text-yellow-600' : 'bg-green-500/20 text-green-600'}`}>
      {schemeType === 'waiver' ? '免扣保证金' : '短期政策'}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    done: { text: '政策期已结束', cls: 'bg-gray-100 text-gray-500' },
    ahead: { text: '已达标', cls: 'bg-green-500/20 text-green-600' },
    on_track: { text: '正常推进', cls: 'bg-blue-500/20 text-blue-600' },
    behind: { text: '进度落后', cls: 'bg-red-500/20 text-red-500' },
  }
  const cfg = map[status] ?? map.on_track
  return <span className={`px-2 py-0.5 rounded text-xs ${cfg.cls}`}>{cfg.text}</span>
}

function ProgressRow({ label, value, display, color }: { label: string; value: number; display: string; color: string }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-700">{display}（{pct.toFixed(0)}%）</span>
      </div>
      <div className="h-2 bg-white rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}