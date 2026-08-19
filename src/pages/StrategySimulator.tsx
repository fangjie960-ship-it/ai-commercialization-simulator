import { useEffect, useMemo, useState } from 'react'
import { Target, CheckCircle2, Users, Loader2, Sparkles } from 'lucide-react'
import { useCustomerStore } from '@/store/customerStore'
import { SHORT_TERM_CONFIG, type ShortTermTierConfig } from '@/config/schemeConfig'
import { calcWaiverScheme, calcShortTermScheme, type WaiverResult, type ShortTermResult } from '@/utils/scheme'
import { getSchemeAdvice, type SchemeAdvice, type SchemeAdviceSummary } from '@/api/recommend'
import type { Customer, CustomerAnalysis, Industry, Policy } from '@/types/customer'

const INDUSTRIES: { value: Industry; label: string }[] = [
  { value: 'drama', label: '短剧' },
  { value: 'game', label: '游戏' },
  { value: 'ecommerce', label: '电商' },
  { value: 'education', label: '教育' },
  { value: 'other', label: '其他' },
]

interface RowResult {
  customer: Customer
  analysis: CustomerAnalysis
  baseDaily: number
  waiver?: WaiverResult
  shortTerm?: ShortTermResult
}

/**
 * 策略模拟（批量方案设计）
 * 方案类型与预估完成率筛选解绑；短期政策=按基期日均分档，每档含基础/激励两档增速与返点
 */
export function StrategySimulator() {
  const { customers, analyses, applyPolicy } = useCustomerStore()

  // ---- 筛选：行业 + 预估完成率区间（与方案类型解绑）----
  const [selectedIndustries, setSelectedIndustries] = useState<Industry[]>([])
  // 每个方案类型各自保存一份完成率区间，切换方案互不影响
  const [rateRanges, setRateRanges] = useState<Record<'waiver' | 'short_term', { min: string; max: string }>>({
    waiver: { min: '0', max: '100' },
    short_term: { min: '0', max: '100' },
  })
  const [excludedIds, setExcludedIds] = useState<string[]>([])

  // ---- 方案 ----
  const [scheme, setScheme] = useState<'waiver' | 'short_term'>('short_term')

  // AI 建议与方案类型绑定，切换方案时清空
  useEffect(() => {
    setAiAdvice(null)
    setAiAdviceError(null)
  }, [scheme])
  const rateRange = rateRanges[scheme]
  const rateMin = Number.isFinite(parseFloat(rateRange.min)) ? parseFloat(rateRange.min) : 0
  const rateMax = Number.isFinite(parseFloat(rateRange.max)) ? parseFloat(rateRange.max) : 100
  const setRateRange = (patch: Partial<{ min: string; max: string }>) =>
    setRateRanges(prev => ({ ...prev, [scheme]: { ...prev[scheme], ...patch } }))

  // 免扣方案参数
  const [waiverMode, setWaiverMode] = useState<'target_incremental' | 'target_roi'>('target_roi')
  const [targetIncremental, setTargetIncremental] = useState(50)
  const [targetRoi, setTargetRoi] = useState(3)

  // 短期政策参数
  const [policyDays, setPolicyDays] = useState(SHORT_TERM_CONFIG.policyDays)
  const [tierConfigs, setTierConfigs] = useState<ShortTermTierConfig[]>(SHORT_TERM_CONFIG.tiers.map(t => ({ ...t })))

  const [executedCount, setExecutedCount] = useState<number | null>(null)

  // ---- AI 方案助手 ----
  const [aiAdviceLoading, setAiAdviceLoading] = useState(false)
  const [aiAdviceError, setAiAdviceError] = useState<string | null>(null)
  const [aiAdvice, setAiAdvice] = useState<SchemeAdvice | null>(null)

  // 筛选池
  const pool = useMemo(() => {
    return customers.filter(c => {
      if (selectedIndustries.length > 0 && !selectedIndustries.includes(c.industry)) return false
      const rate = analyses[c.id]?.completionRate
      if (rate === undefined) return false
      if (rate < rateMin || rate > rateMax) return false
      return true
    })
  }, [customers, analyses, selectedIndustries, rateMin, rateMax])

  // 已选客户
  const selected = useMemo(() => pool.filter(c => !excludedIds.includes(c.id)), [pool, excludedIds])

  // 每个客户的计算结果（按基期日均升序）
  const rows: RowResult[] = useMemo(() => {
    const results = selected
      .map(customer => {
        const analysis = analyses[customer.id]
        if (!analysis) return null as unknown as RowResult
        const baseDaily = analysis.completionRateSource === 'period_based'
          ? (analysis.periodBasedData?.periodDailyAverage ?? analysis.currentDailySpend)
          : analysis.currentDailySpend

        if (scheme === 'waiver') {
          const waiver = calcWaiverScheme({
            contractAmount: customer.contractAmount,
            estimatedRate: analysis.completionRate,
            estimatedPenalty: analysis.estimatedPenaltyDeposit,
            mode: waiverMode,
            targetIncremental,
            targetRoi,
          })
          return { customer, analysis, baseDaily, waiver }
        }

        const shortTerm = calcShortTermScheme({
          baseDaily,
          contractAmount: customer.contractAmount,
          estimatedRate: analysis.completionRate,
          policyDays,
          tiers: tierConfigs,
        })
        return { customer, analysis, baseDaily, shortTerm }
      })
      .filter(Boolean) as RowResult[]
    return results.sort((a, b) => a.baseDaily - b.baseDaily)
  }, [selected, analyses, scheme, waiverMode, targetIncremental, targetRoi, policyDays, tierConfigs])

  // 聚合
  const aggregate = useMemo(() => {
    if (rows.length === 0) return null
    if (scheme === 'waiver') {
      const totalIncremental = rows.reduce((s, r) => s + (r.waiver?.incremental ?? 0), 0)
      const totalWaived = rows.reduce((s, r) => s + (r.waiver?.waivedAmount ?? 0), 0)
      return {
        waiver: { count: rows.length, incremental: totalIncremental, cost: totalWaived, roi: totalWaived > 0 ? totalIncremental / totalWaived : 0 },
        shortTermTiers: null,
      }
    }
    // 按档位 × 基础/激励层级聚合
    const shortTermTiers = tierConfigs
      .map((t, ti) => {
        const matched = rows.filter(r => r.shortTerm?.tierIndex === ti)
        if (matched.length === 0) return null
        const levelAgg = (level: 'base' | 'incentive') => {
          const incremental = matched.reduce((s, r) => s + (level === 'base' ? r.shortTerm?.base.incremental ?? 0 : r.shortTerm?.incentive.incremental ?? 0), 0)
          const cost = matched.reduce((s, r) => s + (level === 'base' ? r.shortTerm?.base.cost ?? 0 : r.shortTerm?.incentive.cost ?? 0), 0)
          return { count: matched.length, incremental, cost, roi: cost > 0 ? incremental / cost : 0 }
        }
        return { tierIndex: ti, tier: t, base: levelAgg('base'), incentive: levelAgg('incentive') }
      })
      .filter(Boolean) as { tierIndex: number; tier: ShortTermTierConfig; base: { count: number; incremental: number; cost: number; roi: number }; incentive: { count: number; incremental: number; cost: number; roi: number } }[]
    return { waiver: null, shortTermTiers }
  }, [rows, scheme, tierConfigs])

  const toggleExcluded = (id: string) => {
    setExcludedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  // 构建脱敏汇总（不含客户名/执照/原始金额明细）
  const buildSummary = (): SchemeAdviceSummary | null => {
    if (selected.length === 0) return null
    const baseDailies: number[] = []
    const rates: number[] = []
    const contracts: number[] = []
    const penalties: number[] = []
    const industries: Record<string, number> = {}
    const tiers: Record<string, number> = {}
    let remainingSum = 0

    selected.forEach(c => {
      const a = analyses[c.id]
      if (!a) return
      const baseDaily = a.completionRateSource === 'period_based'
        ? (a.periodBasedData?.periodDailyAverage ?? a.currentDailySpend)
        : a.currentDailySpend
      baseDailies.push(baseDaily)
      rates.push(a.completionRate)
      contracts.push(c.contractAmount)
      penalties.push(a.estimatedPenaltyDeposit)
      remainingSum += a.remainingDays
      industries[c.industry] = (industries[c.industry] || 0) + 1
      tiers[a.tier] = (tiers[a.tier] || 0) + 1
    })
    if (rates.length === 0) return null

    const quantile = (arr: number[], q: number) => {
      const s = [...arr].sort((a, b) => a - b)
      return s[Math.min(s.length - 1, Math.floor(s.length * q))]
    }
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length

    return {
      scheme,
      customerCount: rates.length,
      industryDistribution: industries,
      tierDistribution: tiers,
      completionRate: { min: Math.min(...rates), max: Math.max(...rates), avg: avg(rates) },
      baseDaily: {
        min: Math.min(...baseDailies), max: Math.max(...baseDailies), avg: avg(baseDailies),
        p25: quantile(baseDailies, 0.25), p50: quantile(baseDailies, 0.5), p75: quantile(baseDailies, 0.75),
      },
      contractAmount: { avg: avg(contracts), total: contracts.reduce((s, v) => s + v, 0) },
      avgRemainingDays: remainingSum / rates.length,
      estimatedPenalty: { avg: avg(penalties), total: penalties.reduce((s, v) => s + v, 0) },
    }
  }

  const handleAIAdvice = async () => {
    if (selected.length === 0) {
      setAiAdviceError('请先筛选客户')
      return
    }
    setAiAdviceLoading(true)
    setAiAdviceError(null)
    setAiAdvice(null)
    try {
      const summary = buildSummary()
      if (!summary) return
      const advice = await getSchemeAdvice(summary)
      setAiAdvice(advice)
    } catch (err) {
      setAiAdviceError(err instanceof Error ? err.message : 'AI 方案建议失败，请重试')
    } finally {
      setAiAdviceLoading(false)
    }
  }

  const applyAIAdvice = () => {
    if (!aiAdvice) return
    if (scheme === 'waiver' && aiAdvice.targetRoi) {
      setTargetRoi(aiAdvice.targetRoi)
      setWaiverMode('target_roi')
    } else if (scheme === 'short_term') {
      if (aiAdvice.tiers && aiAdvice.tiers.length > 0) setTierConfigs(aiAdvice.tiers.map(t => ({ ...t })))
      if (aiAdvice.policyDays && aiAdvice.policyDays > 0) setPolicyDays(aiAdvice.policyDays)
    }
  }

  const handleExecute = async () => {
    if (rows.length === 0) return
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + policyDays)
    const endStr = endDate.toISOString().split('T')[0]

    const newPolicies: Policy[] = rows.map((r, i) => {
      if (scheme === 'waiver' && r.waiver) {
        return {
          id: `pol_${Date.now()}_${i}`,
          customerId: r.customer.id,
          schemeType: 'waiver' as const,
          name: '免扣保证金政策',
          startDate: todayStr,
          endDate: r.customer.expireDate,
          baseDaily: r.baseDaily,
          targetDaily: 0,
          requiredIncremental: r.waiver.incremental,
          incrementalRebate: 0,
          annualRebate: 0,
          growth: 0,
          waivedAmount: r.waiver.waivedAmount,
          createdAt: Date.now(),
        }
      }
      const st = r.shortTerm
      const base = st?.base
      return {
        id: `pol_${Date.now()}_${i}`,
        customerId: r.customer.id,
        schemeType: 'short_term' as const,
        name: `短期政策：基础+${base?.growth ?? 0}% / 激励+${st?.incentive.growth ?? 0}%`,
        startDate: todayStr,
        endDate: endStr,
        baseDaily: r.baseDaily,
        targetDaily: base?.requiredDaily ?? 0,
        requiredIncremental: base?.incremental ?? 0,
        incrementalRebate: st?.tier.baseRebate ?? 0,
        annualRebate: 0,
        growth: base?.growth ?? 0,
        waivedAmount: 0,
        // 增速阶梯：达到基础增速给基础返点，达到激励增速给激励返点
        tiers: st?.tier
          ? [
              { growth: st.tier.baseGrowth, incrementalRebate: st.tier.baseRebate },
              { growth: st.tier.incentiveGrowth, incrementalRebate: st.tier.incentiveRebate },
            ]
          : [],
        createdAt: Date.now(),
      }
    })

    for (const p of newPolicies) {
      await applyPolicy(p)
    }
    setExecutedCount(newPolicies.length)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-medium text-gray-900">策略模拟</h2>
          <span className="text-xs text-gray-500">筛选客户 → 配置方案 → 查看聚合 ROI → 执行</span>
        </div>
        {executedCount !== null && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle2 className="w-4 h-4" /> 已为 {executedCount} 个客户执行政策，可在客户列表/详情查看进度
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
          {/* 方案类型 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">方案类型：</span>
              <SchemeChip active={scheme === 'waiver'} label="免扣保证金" onClick={() => setScheme('waiver')} />
              <SchemeChip active={scheme === 'short_term'} label="短期政策" onClick={() => setScheme('short_term')} />
            </div>
            <div className="text-xs text-gray-500">当前筛选 {pool.length} 个客户 · 已选 {selected.length} 个</div>
          </div>

          {/* 客户筛选 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-gray-500" />
              <h4 className="text-sm font-medium text-gray-700">筛选客户</h4>
              <button onClick={() => setExcludedIds([])} className="ml-auto text-xs text-blue-600 hover:text-blue-700">全选</button>
              <button onClick={() => setExcludedIds(pool.map(c => c.id))} className="text-xs text-gray-500 hover:text-gray-900">清空</button>
            </div>
            <div className="flex flex-wrap items-start gap-6">
              <div>
                <p className="text-xs text-gray-500 mb-2">行业</p>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip active={selectedIndustries.length === 0} label="全部" onClick={() => setSelectedIndustries([])} />
                  {INDUSTRIES.map(i => (
                    <FilterChip
                      key={i.value}
                      active={selectedIndustries.includes(i.value)}
                      label={i.label}
                      onClick={() => toggleInList(selectedIndustries, setSelectedIndustries, i.value)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">预估完成率区间（%）</p>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rateRange.min}
                    onChange={(e) => setRateRange({ min: e.target.value })}
                    className="w-20 px-2 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-gray-500">~</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rateRange.max}
                    onChange={(e) => setRateRange({ max: e.target.value })}
                    className="w-20 px-2 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[{ label: '全部', min: '0', max: '100' }, { label: '<70', min: '0', max: '69' }, { label: '70-90', min: '70', max: '90' }, { label: '≥90', min: '90', max: '100' }].map(p => (
                    <button
                      key={p.label}
                      onClick={() => setRateRange({ min: p.min, max: p.max })}
                      className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2">客户（点击移除，默认全选）</p>
              {pool.length === 0 ? (
                <p className="text-sm text-gray-500">当前筛选下没有客户</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {pool.map(c => {
                    const active = !excludedIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleExcluded(c.id)}
                        className={`px-2 py-1 rounded text-xs transition-colors ${
                          active ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-100 text-gray-500 line-through'
                        }`}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 方案配置 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-gray-700">方案配置</h4>
              <button
                onClick={handleAIAdvice}
                disabled={aiAdviceLoading || selected.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" /> AI 建议方案
              </button>
            </div>
            {scheme === 'waiver' ? (
              <div className="grid grid-cols-3 gap-6 max-w-2xl">
                <div>
                  <p className="text-xs text-gray-500 mb-2">测算模式</p>
                  <div className="flex gap-2">
                    <SchemeChip active={waiverMode === 'target_roi'} label="按 ROI 倒推" onClick={() => setWaiverMode('target_roi')} />
                    <SchemeChip active={waiverMode === 'target_incremental'} label="输目标增量" onClick={() => setWaiverMode('target_incremental')} />
                  </div>
                </div>
                {waiverMode === 'target_incremental' ? (
                  <Field label="目标增量（万元）">
                    <NumInput value={targetIncremental} onChange={setTargetIncremental} suffix="万" min={0} />
                  </Field>
                ) : (
                  <Field label="ROI 目标（倍）" hint="先倒推每个客户的增量并取略高整数，再重算 ROI">
                    <NumInput value={targetRoi} onChange={setTargetRoi} suffix="x" min={0} step={0.5} />
                  </Field>
                )}
              </div>
            ) : (
              <div className="space-y-4 max-w-4xl">
                <div className="max-w-xs">
                  <Field label="政策期（天）">
                    <NumInput value={policyDays} onChange={setPolicyDays} suffix="天" min={1} />
                  </Field>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">按基期日均分档，每档含基础/激励两档增速与返点（达到哪档给哪档返点）</p>
                  <div className="grid grid-cols-2 gap-3">
                    {tierConfigs.map((t, idx) => (
                      <div key={idx} className="bg-gray-100 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          {idx === tierConfigs.length - 1 ? (
                            <span className="text-xs text-gray-500">
                              档位{idx + 1}（兜底）：基期日均 &gt; {tierConfigs[idx - 1]?.maxBaseDaily ?? 0}万/天
                            </span>
                          ) : (
                            <>
                              <span className="text-xs text-gray-500">档位{idx + 1}：基期日均 ≤</span>
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={t.maxBaseDaily ?? ''}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value)
                                  updateTier(tierConfigs, setTierConfigs, idx, { maxBaseDaily: Number.isFinite(v) ? v : undefined })
                                }}
                                className="w-16 px-1.5 py-1 bg-white border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:border-blue-500"
                              />
                              <span className="text-xs text-gray-500">万/天</span>
                            </>
                          )}
                          {rows.some(r => r.shortTerm?.tierIndex === idx) && (
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-600 rounded-full">有客户命中</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <MiniField label="基础增速 %">
                            <NumInput value={t.baseGrowth} onChange={(v) => updateTier(tierConfigs, setTierConfigs, idx, { baseGrowth: v })} suffix="%" min={0} />
                          </MiniField>
                          <MiniField label="基础返点 %">
                            <NumInput value={t.baseRebate} onChange={(v) => updateTier(tierConfigs, setTierConfigs, idx, { baseRebate: v })} suffix="%" min={0} step={0.5} />
                          </MiniField>
                          <MiniField label="激励增速 %">
                            <NumInput value={t.incentiveGrowth} onChange={(v) => updateTier(tierConfigs, setTierConfigs, idx, { incentiveGrowth: v })} suffix="%" min={0} />
                          </MiniField>
                          <MiniField label="激励返点 %">
                            <NumInput value={t.incentiveRebate} onChange={(v) => updateTier(tierConfigs, setTierConfigs, idx, { incentiveRebate: v })} suffix="%" min={0} step={0.5} />
                          </MiniField>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI 方案建议 */}
          {aiAdviceLoading && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-3 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> 正在分析这批客户，生成方案建议...
            </div>
          )}
          {aiAdviceError && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between gap-3">
              <p className="text-sm text-red-500">{aiAdviceError}</p>
              <button onClick={handleAIAdvice} className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs rounded-lg transition-colors">
                重试
              </button>
            </div>
          )}
          {aiAdvice && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-purple-700 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> AI 方案建议（推荐指数 {(aiAdvice.confidence * 100).toFixed(0)}%）
                </span>
                <button onClick={applyAIAdvice} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors">
                  应用建议
                </button>
              </div>
              {scheme === 'short_term' && aiAdvice.tiers && (
                <div className="text-xs text-gray-600 mt-2">
                  政策期 {aiAdvice.policyDays} 天 · 档位：
                  {aiAdvice.tiers.map((t, i) => (
                    <span key={i} className="mr-3">
                      档{i + 1}{t.maxBaseDaily !== undefined ? ` ≤${t.maxBaseDaily}万/天` : ' 兜底'}：基础+{t.baseGrowth}%/返点{t.baseRebate}% · 激励+{t.incentiveGrowth}%/返点{t.incentiveRebate}%
                    </span>
                  ))}
                </div>
              )}
              {scheme === 'waiver' && aiAdvice.targetRoi && (
                <div className="text-xs text-gray-600 mt-2">建议 ROI 目标：{aiAdvice.targetRoi}x</div>
              )}
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{aiAdvice.reasoning}</p>
            </div>
          )}

          {/* 聚合 ROI */}
          {aggregate && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-medium text-gray-700 mb-4">聚合 ROI（{rows.length} 个客户）</h4>
              {scheme === 'waiver' && aggregate.waiver ? (
                <div className="flex items-end gap-10">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">整体 ROI</p>
                    <p className="text-4xl font-bold text-gray-900">{aggregate.waiver.roi.toFixed(1)}<span className="text-xl text-gray-500">x</span></p>
                  </div>
                  <div className="w-px h-14 bg-white" />
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-10">
                      <span className="text-gray-500">总要求增量</span>
                      <span className="text-gray-900">¥{aggregate.waiver.incremental.toFixed(0)}万</span>
                    </div>
                    <div className="flex justify-between gap-10">
                      <span className="text-gray-500">总免扣保证金</span>
                      <span className="text-yellow-600">¥{aggregate.waiver.cost.toFixed(0)}万</span>
                    </div>
                  </div>
                </div>
              ) : aggregate.shortTermTiers ? (
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-500">档位</th>
                      <th className="px-4 py-3 text-left text-gray-500">层级</th>
                      <th className="px-4 py-3 text-right text-gray-500">增速</th>
                      <th className="px-4 py-3 text-right text-gray-500">返点</th>
                      <th className="px-4 py-3 text-right text-gray-500">客户数</th>
                      <th className="px-4 py-3 text-right text-gray-500">总增量</th>
                      <th className="px-4 py-3 text-right text-gray-500">总成本</th>
                      <th className="px-4 py-3 text-right text-gray-500">ROI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {aggregate.shortTermTiers.flatMap(x => [
                      { key: `b${x.tierIndex}`, tierIndex: x.tierIndex, label: '基础', growth: x.tier.baseGrowth, rebate: x.tier.baseRebate, agg: x.base },
                      { key: `i${x.tierIndex}`, tierIndex: x.tierIndex, label: '激励', growth: x.tier.incentiveGrowth, rebate: x.tier.incentiveRebate, agg: x.incentive },
                    ]).map(row => (
                      <tr key={row.key}>
                        <td className="px-4 py-3 text-gray-900">档位{row.tierIndex + 1}</td>
                        <td className="px-4 py-3 text-gray-700">{row.label}</td>
                        <td className="px-4 py-3 text-right text-gray-700">+{row.growth}%</td>
                        <td className="px-4 py-3 text-right text-gray-700">{row.rebate}%</td>
                        <td className="px-4 py-3 text-right text-gray-700">{row.agg.count}</td>
                        <td className="px-4 py-3 text-right text-gray-900">¥{row.agg.incremental.toFixed(0)}万</td>
                        <td className="px-4 py-3 text-right text-yellow-600">¥{row.agg.cost.toFixed(0)}万</td>
                        <td className="px-4 py-3 text-right text-green-600">{row.agg.roi.toFixed(1)}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleExecute}
                  disabled={rows.length === 0}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
                >
                  执行政策（{rows.length} 个客户）
                </button>
              </div>
            </div>
          )}

          {/* 明细表（按基期日均升序） */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-sm font-medium text-gray-700 mb-4">客户明细（按基期日均从低到高）</h4>
            {rows.length === 0 ? (
              <p className="text-gray-500 text-sm">当前筛选下没有客户，请调整行业/预估完成率区间</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-3 text-left text-gray-500">客户</th>
                      <th className="px-3 py-3 text-right text-gray-500">预估完成率</th>
                      <th className="px-3 py-3 text-right text-gray-500">基期日均</th>
                      {scheme === 'waiver' ? (
                        <>
                          <th className="px-3 py-3 text-right text-gray-500">免扣额</th>
                          <th className="px-3 py-3 text-right text-gray-500">要求增量</th>
                          <th className="px-3 py-3 text-right text-gray-500">ROI</th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-3 text-right text-gray-500">命中档</th>
                          <th className="px-3 py-3 text-right text-gray-500">基础增速</th>
                          <th className="px-3 py-3 text-right text-gray-500">基础日均</th>
                          <th className="px-3 py-3 text-right text-gray-500">基础增量</th>
                          <th className="px-3 py-3 text-right text-gray-500">基础ROI</th>
                          <th className="px-3 py-3 text-right text-gray-500">激励增速</th>
                          <th className="px-3 py-3 text-right text-gray-500">激励日均</th>
                          <th className="px-3 py-3 text-right text-gray-500">激励增量</th>
                          <th className="px-3 py-3 text-right text-gray-500">激励ROI</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map(r => (
                      <tr key={r.customer.id}>
                        <td className="px-3 py-3 text-gray-900">{r.customer.name}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{r.analysis.completionRate.toFixed(1)}%</td>
                        <td className="px-3 py-3 text-right text-gray-700">¥{r.baseDaily.toFixed(2)}万</td>
                        {scheme === 'waiver' && r.waiver ? (
                          <>
                            <td className="px-3 py-3 text-right text-yellow-600">¥{r.waiver.waivedAmount.toFixed(1)}万</td>
                            <td className="px-3 py-3 text-right text-gray-900">¥{r.waiver.incremental.toFixed(0)}万</td>
                            <td className="px-3 py-3 text-right text-green-600">{r.waiver.roi.toFixed(1)}x</td>
                          </>
                        ) : r.shortTerm ? (
                          <>
                            <td className="px-3 py-3 text-right text-gray-700">档{r.shortTerm.tierIndex + 1}</td>
                            <td className="px-3 py-3 text-right text-gray-700">+{r.shortTerm.base.growth}%</td>
                            <td className="px-3 py-3 text-right text-gray-900">¥{r.shortTerm.base.requiredDaily.toFixed(2)}万</td>
                            <td className="px-3 py-3 text-right text-gray-900">¥{r.shortTerm.base.incremental.toFixed(0)}万</td>
                            <td className="px-3 py-3 text-right text-green-600">{r.shortTerm.base.roi.toFixed(1)}x</td>
                            <td className="px-3 py-3 text-right text-gray-700">+{r.shortTerm.incentive.growth}%</td>
                            <td className="px-3 py-3 text-right text-gray-900">¥{r.shortTerm.incentive.requiredDaily.toFixed(2)}万</td>
                            <td className="px-3 py-3 text-right text-gray-900">¥{r.shortTerm.incentive.incremental.toFixed(0)}万</td>
                            <td className="px-3 py-3 text-right text-green-600">{r.shortTerm.incentive.roi.toFixed(1)}x</td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- 工具 ---------- */

function toggleInList<T>(list: T[], setList: (l: T[]) => void, value: T) {
  setList(list.includes(value) ? list.filter(x => x !== value) : [...list, value])
}

function updateTier(tiers: ShortTermTierConfig[], setTiers: (t: ShortTermTierConfig[]) => void, index: number, patch: Partial<ShortTermTierConfig>) {
  setTiers(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)))
}

function SchemeChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active ? 'bg-blue-500 text-gray-900' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  )
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs transition-colors ${
        active ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-xs text-gray-500">{label}</label>
        {hint && <span className="text-[10px] text-gray-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  )
}

function NumInput({ value, onChange, suffix, min = 0, step = 1 }: { value: number; onChange: (v: number) => void; suffix?: string; min?: number; step?: number }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          onChange(Number.isFinite(v) ? v : 0)
        }}
        className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
      />
      {suffix && <span className="text-xs text-gray-500 whitespace-nowrap">{suffix}</span>}
    </div>
  )
}