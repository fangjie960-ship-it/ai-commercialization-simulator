import type { Customer, CustomerAnalysis, CustomerTier, TrendDirection, IndustryCalculationConfig } from '@/types/customer'

/**
 * 全局默认计算配置
 */
let globalCalculationConfig: Record<string, IndustryCalculationConfig> = {};

/**
 * 设置全局计算配置
 * @param config 行业计算配置映射
 */
export function setCalculationConfig(config: Record<string, IndustryCalculationConfig>) {
  globalCalculationConfig = { ...config };
}

/**
 * 获取行业的计算配置
 * @param industry 行业类型
 * @returns 行业计算配置
 */
function getIndustryConfig(industry: string): IndustryCalculationConfig {
  const config = globalCalculationConfig[industry];
  if (config && !config.useDefault) {
    return config;
  }
  // 默认使用日均平推模式
  return {
    model: 'average',
    useDefault: true
  };
}

/**
 * 客户分层评分算法
 * 支持双模式预测：
 * - 模式 A（日均平推）：完成率 = (当前日均消耗 * 365) / 框架任务金额
 * - 模式 B（基期线性预测）：预估全年消耗 = 截止日累计已消耗 + (基期内日均消耗 * 当年剩余天数)
 * 
 * 加权规则：完成率(40%) + 趋势(30%) + 时间充裕度(20%) + 行业偏差(10%)
 * 评分 >= 75 → 高潜，50-75 → 稳定，25-50 → 预警，<25 → 高风险
 */
export function analyzeCustomer(
  customer: Customer, 
  config?: IndustryCalculationConfig
): CustomerAnalysis {
  // 获取该行业的计算配置
  const industryConfig = config || getIndustryConfig(customer.industry);
  const isPeriodBased = industryConfig.model === 'period_based';
  // 框架到期日：统一使用客户 expireDate，不写死年份
  const frameworkEnd = new Date(customer.expireDate);

  // 计算当前日均消耗（基于近3个月趋势）
  const recentTrend = customer.monthlyTrend.slice(-3);
  const currentDailySpend = recentTrend.length > 0
    ? recentTrend.reduce((sum, v) => sum + v, 0) / (recentTrend.length * 30)
    : 0;

  let completionRate: number;
  let completionRateSource: 'average' | 'period_based' = 'average';
  let periodBasedData: CustomerAnalysis['periodBasedData'] = undefined;
  let estimatedYearlySpend = 0;

  if (isPeriodBased && industryConfig.periodStartDate && industryConfig.periodEndDate) {
    // 模式 B：基期线性预测（含消耗累计日）
    // 语义：
    //   - 累计日 = 消耗数据截至日（已发生的消耗视为确定；缺省取该客户日流水的最后一天）
    //   - 基期   = 累计日前一段能代表当前消耗节奏的稳定区间，用于推算日均
    //   - 预估全年消耗 = 累计日前的实际累计 + 基期日均 × (框架到期日 - 累计日)
    const periodStart = new Date(industryConfig.periodStartDate);
    const periodEnd = new Date(industryConfig.periodEndDate);
    // 累计日：显式配置优先；缺省取已知日消耗的最新日期（数据截至日），保证基期预测不因漏填而失效
    const effectiveCutoff = industryConfig.consumptionCutoffDate
      || (customer.dailySpend.length > 0 ? customer.dailySpend[customer.dailySpend.length - 1].date : industryConfig.periodEndDate);
    const consumptionCutoff = new Date(effectiveCutoff);
    
    // 1. 计算累计日前的实际累计消耗
    //    注意：不能只依赖 dailySpend 求和 —— 日流水可能只覆盖部分时间段（如最近90天），
    //    直接求和会严重低估全年累计（如 YTD=420 但流水只累到 190）。
    //    因此取 max(主数据 YTD 已完成消耗, 累计日前的流水求和)：
    //    - 流水覆盖不全时，以主数据 YTD 为准（权威值）
    //    - 流水覆盖更全/更新时，以流水求和为准
    const spendsBeforeCutoff = customer.dailySpend.filter(d => {
      const dDate = new Date(d.date);
      return dDate <= consumptionCutoff;
    });
    const cumulativeFromSpend = spendsBeforeCutoff.reduce((sum, d) => sum + d.amount, 0);
    const cumulativeBeforeCutoff = Math.max(customer.completedAmount, cumulativeFromSpend);
    
    // 2. 过滤基期内的 dailySpend 数据（基期起始日 -> 基期截止日）
    const periodSpends = customer.dailySpend.filter(d => {
      const dDate = new Date(d.date);
      return dDate >= periodStart && dDate <= periodEnd;
    });
    
    // 3. 计算基期内日均消耗：按自然日计算，而不是"有记录的天数"
    //    （否则基期内漏报的天会被忽略，导致日均被高估）
    const calendarDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const periodTotalSpend = periodSpends.reduce((sum, d) => sum + d.amount, 0);
    const periodDailyAverage = periodTotalSpend / calendarDays;
    
    // 4. 计算累计日后到框架到期的剩余天数
    const remainingDaysAfterCutoff = Math.max(0,
      Math.ceil((frameworkEnd.getTime() - consumptionCutoff.getTime()) / (1000 * 60 * 60 * 24))
    );
    
    // 5. 预估全年消耗 = 累计日累计已消耗 + (基期内日均消耗 * 累计日后剩余天数)
    estimatedYearlySpend = cumulativeBeforeCutoff + (periodDailyAverage * remainingDaysAfterCutoff);
    
    // 6. 完成率 = 预估全年消耗 / 框架任务金额
    completionRate = (estimatedYearlySpend / customer.contractAmount) * 100;
    completionRateSource = 'period_based';
    
    periodBasedData = {
      consumptionCutoffDate: effectiveCutoff,
      periodStartDate: industryConfig.periodStartDate,
      periodEndDate: industryConfig.periodEndDate,
      periodDailyAverage: parseFloat(periodDailyAverage.toFixed(2)),
      cumulativeBeforeCutoff: parseFloat(cumulativeBeforeCutoff.toFixed(2))
    };
  } else {
    // 模式 A：日均平推
    // 完成率 = (当前日均消耗 * 365) / 框架任务金额
    estimatedYearlySpend = currentDailySpend * 365;
    completionRate = (estimatedYearlySpend / customer.contractAmount) * 100;
    completionRateSource = 'average';
  }

  // 当前实际完成率（已完成消耗 / 框架金额），与预估完成率分开展示
  const currentCompletionRate = customer.contractAmount > 0 ? (customer.completedAmount / customer.contractAmount) * 100 : 0
  // 计算剩余天数（从最新消耗日期到框架到期日）
  const lastSpendDate = customer.dailySpend && customer.dailySpend.length > 0
    ? new Date(customer.dailySpend[customer.dailySpend.length - 1].date)
    : new Date()
  const remainingDays = Math.max(0, Math.ceil((frameworkEnd.getTime() - lastSpendDate.getTime()) / (1000 * 60 * 60 * 24)))

  // 计算所需日均消耗
  const remainingAmount = customer.contractAmount - customer.completedAmount
  const requiredDailySpend = remainingDays > 0 ? remainingAmount / remainingDays : 0

  // 计算趋势方向和斜率
  const { direction: trendDirection, slope: trendSlope } = calculateTrend(customer.monthlyTrend)

  // 6. 预测完成率
  const predictedCompletionRate = predictCompletionRate(
    completionRate,
    remainingDays,
    customer.monthlyTrend,
    customer.contractAmount,
    customer.completedAmount
  )

  // 7. 综合评分（0-100）
  const score = calculateScore(
    completionRate,
    trendDirection,
    remainingDays,
    customer.industry
  )

  // 8. 分层判断
  const tier = determineTier(score, completionRate, remainingDays, trendDirection)

  // 9. 预估扣罚保证金计算
  // 规则：完成率>=100%为0，<=70%为任务金额1%（封顶600万），之间为(任务金额-预估消耗达成)/100（同样封顶）
  const fullPenalty = Math.min(customer.contractAmount * 0.01, 600)
  let estimatedPenaltyDeposit = 0
  if (completionRate >= 100) {
    estimatedPenaltyDeposit = 0
  } else if (completionRate <= 70) {
    estimatedPenaltyDeposit = fullPenalty
  } else {
    estimatedPenaltyDeposit = Math.min((customer.contractAmount - estimatedYearlySpend) / 100, fullPenalty)
  }

  return {
    customerId: customer.id,
    completionRate: parseFloat(completionRate.toFixed(1)),
    currentCompletionRate: parseFloat(currentCompletionRate.toFixed(1)),
    completionRateSource,
    estimatedYearlySpend: parseFloat(estimatedYearlySpend.toFixed(1)),
    completedAmount: parseFloat(customer.completedAmount.toFixed(1)),
    estimatedPenaltyDeposit: parseFloat(estimatedPenaltyDeposit.toFixed(2)),
    remainingDays,
    requiredDailySpend,
    currentDailySpend,
    periodBasedData,
    predictedCompletionRate,
    trendDirection,
    trendSlope,
    tier,
    score
  }
}

/**
 * 计算消耗趋势
 * 使用线性回归计算斜率
 */
function calculateTrend(monthlyTrend: number[]): { direction: TrendDirection; slope: number } {
  if (monthlyTrend.length < 2) {
    return { direction: 'stable', slope: 0 }
  }

  const n = monthlyTrend.length
  const x = Array.from({ length: n }, (_, i) => i)
  const y = monthlyTrend

  // 线性回归计算斜率
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)

  // 判断趋势方向
  let direction: TrendDirection = 'stable'
  if (slope > 0.1) direction = 'rising'
  else if (slope < -0.1) direction = 'falling'

  return { direction, slope }
}

/**
 * 预测最终完成率
 * 基于线性回归外推
 */
function predictCompletionRate(
  _currentRate: number,
  remainingDays: number,
  monthlyTrend: number[],
  contractAmount: number,
  completedAmount: number
): number | null {
  if (monthlyTrend.length < 3) return null

  const n = monthlyTrend.length
  const x = Array.from({ length: n }, (_, i) => i)
  const y = monthlyTrend

  // 线性回归
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // 预测剩余月份数
  const remainingMonths = remainingDays / 30

  // 预测未来消耗（线性外推）
  let predictedAdditionalSpend = 0
  for (let i = 0; i < remainingMonths; i++) {
    const predictedMonthSpend = slope * (n + i) + intercept
    predictedAdditionalSpend += Math.max(0, predictedMonthSpend)
  }

  const predictedTotal = completedAmount + predictedAdditionalSpend
  const predictedRate = (predictedTotal / contractAmount) * 100

  return Math.min(100, Math.max(0, predictedRate))
}

/**
 * 综合评分计算
 * 加权规则：完成率(40%) + 趋势(30%) + 时间充裕度(20%) + 行业系数(10%)
 */
function calculateScore(
  completionRate: number,
  trendDirection: TrendDirection,
  remainingDays: number,
  industry: string
): number {
  // 完成率得分（0-40）
  const completionScore = Math.min(40, (completionRate / 100) * 40)

  // 趋势得分（0-30）
  let trendScore = 15 // 稳定状态基础分
  if (trendDirection === 'rising') trendScore = 30
  else if (trendDirection === 'falling') trendScore = 5

  // 时间充裕度得分（0-20）
  const timeScore = Math.min(20, (remainingDays / 180) * 20)

  // 行业系数得分（0-10）- 简化为固定值，实际应从配置文件读取
  const industryScores: Record<string, number> = {
    drama: 8,
    game: 7,
    ecommerce: 6,
    education: 5,
    other: 5
  }
  const industryScore = industryScores[industry] || 5

  return completionScore + trendScore + timeScore + industryScore
}

/**
 * 分层判断
 * 评分 >= 75 → 高潜，50-75 → 稳定，25-50 → 预警，<25 → 高风险
 */
function determineTier(
  score: number,
  completionRate: number,
  remainingDays: number,
  trendDirection: TrendDirection
): CustomerTier {
  // 高风险强制条件
  if (completionRate < 30 && remainingDays < 60) {
    return 'high_risk'
  }

  // 预警条件
  if (completionRate < 50 || trendDirection === 'falling') {
    return 'warning'
  }

  // 基于评分分层
  if (score >= 75) return 'high_potential'
  if (score >= 50) return 'stable'
  if (score >= 25) return 'warning'
  return 'high_risk'
}

/**
 * 批量分析客户
 * @param customers 客户列表
 * @param config 可选的全局计算配置，不传则使用已设置的配置
 */
export function analyzeAllCustomers(
  customers: Customer[], 
  config?: Record<string, IndustryCalculationConfig>
): Record<string, CustomerAnalysis> {
  // 如果传入了配置，先设置
  if (config) {
    setCalculationConfig(config);
  }
  
  const analyses: Record<string, CustomerAnalysis> = {}
  customers.forEach(customer => {
    analyses[customer.id] = analyzeCustomer(customer)
  })
  return analyses
}