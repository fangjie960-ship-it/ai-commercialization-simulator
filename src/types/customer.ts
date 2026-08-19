/**
 * 客户类型定义
 * @description 商业化客户的核心数据结构
 */

export type Industry = 'drama' | 'game' | 'ecommerce' | 'education' | 'other';

export type CustomerTier = 'high_potential' | 'stable' | 'warning' | 'high_risk';

export type TrendDirection = 'rising' | 'stable' | 'falling';

export type ContractScale = 'small' | 'medium' | 'large';

export type PredictedAction = 'increase_spend' | 'maintain' | 'decrease_spend' | 'churn_risk';

export type EstimatedAction = 'complete' | 'abandon' | 'downgrade' | 'upgrade';

/**
 * 预测模型类型
 */
export type PredictionModel = 'average' | 'period_based';

/**
 * 行业计算配置
 */
export interface IndustryCalculationConfig {
  model: PredictionModel;              // 预测模型类型
  consumptionCutoffDate?: string;  // 消耗累计日（模式B用，在基期起始日之前）
  periodStartDate?: string;       // 基期起始日（模式B用）
  periodEndDate?: string;         // 截止消耗日（模式B用）
  useDefault: boolean;            // 是否使用默认配置
}

/**
 * 每日消耗流水记录
 */
export interface DailySpend {
  date: string;              // 日期（ISO格式 YYYY-MM-DD）
  amount: number;            // 当日消耗金额（万元）
  targetAmount: number;      // 当日框架任务金额（万元）
  rebateRate: number;        // 返点比例 %
  predictedAction: PredictedAction;  // 预估客户动作
}

/**
 * 客户基础信息
 */
export interface Customer {
  id: string;
  businessLicense: string;         // 客户营业执照（唯一标识）
  name: string;                    // 客户名称（显示用）
  industry: Industry;               // 行业
  contractAmount: number;           // 框架金额（万元）
  completedAmount: number;          // 已完成消耗（万元）
  monthlyTrend: number[];         // 近6个月消耗趋势（万元）
  dailySpend: DailySpend[];        // 每日消耗流水数据
  contractDate: string;            // 签约日期（ISO）
  expireDate: string;              // 到期日期（ISO）
  grade?: 'A' | 'B' | 'C' | 'D';    // 客户等级（可选）
  remark?: string;                 // 备注（可选）
  createdAt: number;               // 创建时间戳
  updatedAt: number;               // 更新时间戳
}

/**
 * 客户分析结果（计算派生）
 */
export interface CustomerAnalysis {
  customerId: string;
  completionRate: number;         // 预估完成率 %
  currentCompletionRate: number;      // 当前实际完成率 %（已完成消耗/框架金额）
  completionRateSource: 'average' | 'period_based';  // 计算来源
  estimatedYearlySpend: number;   // 预估消耗达成（万元）
  completedAmount: number;        // YTD消耗 - 已完成消耗（万元）
  estimatedPenaltyDeposit: number;  // 预估扣罚保证金（万元）
  remainingDays: number;            // 剩余天数
  requiredDailySpend: number;       // 所需日均消耗
  currentDailySpend: number;        // 当前日均消耗
  periodBasedData?: {               // 基期模式数据
    consumptionCutoffDate: string;  // 消耗累计日
    periodStartDate: string;
    periodEndDate: string;
    periodDailyAverage: number;
    cumulativeBeforeCutoff: number; // 消耗累计日前的累计消耗
  };
  predictedCompletionRate: number | null;  // 预测完成率
  trendDirection: TrendDirection;   // 趋势方向
  trendSlope: number;               // 趋势斜率
  tier: CustomerTier;               // 分层结果
  score: number;                    // 综合评分 0-100
}

/**
 * 策略类型
 */
export type StrategyType = 'waiver' | 'short_term' | 'tiered' | 'exclusive' | 'combined';

/**
 * 策略推荐
 */
export interface StrategyRecommendation {
  customerId: string;
  strategies: StrategyType[];
  reasons: string[];
  expectedIncrease: number;       // 预期增量消耗（万元）
  expectedCompletionBoost: number; // 预期完成率提升 %
  incentiveCost: number;          // 激励成本（万元）
  suggestedParams: StrategyParams;
  confidence: number;               // 推荐置信度 0-1
  explanation?: string;           // AI 整体策略思路说明（可选）
}

/**
 * 客户政策（已执行到客户身上的策略方案）
 */
export interface Policy {
  id: string
  customerId: string
  schemeType: 'waiver' | 'short_term'
  name: string
  startDate: string
  endDate: string
  baseDaily: number          // 基期日均（万/天）
  targetDaily: number        // 政策期目标日均（短期政策用）
  requiredIncremental: number // 要求增量（万）
  incrementalRebate: number  // 增量返点 %
  annualRebate: number       // 年框返点 %
  growth: number             // 采用的增速 %（短期政策）
  waivedAmount: number       // 免扣额（免扣方案）
  tiers?: { growth: number; incrementalRebate: number }[] // 增速阶梯（短期政策：达到哪档给哪档返点）
  createdAt: number
}

/**
 * 策略参数
 */
export interface StrategyParams {
  incentiveLevel: 'low' | 'medium' | 'high';
  incentiveRate: number;            // 返点比例 %
  duration: number;                 // 持续天数
  roiThreshold: number;             // ROI 阈值
}

/**
 * ROI 模拟结果
 */
export interface ROISimulation {
  customerId: string;
  strategyType: StrategyType;
  incentiveCost: number;            // 激励成本
  incrementalSpend: number;         // 增量消耗
  roi: number;                      // ROI = 增量 / 成本
  breakEvenDays: number;            // 回本周期
  completionRateAfter: number;      // 实施后完成率
}

/**
 * 全局筛选状态
 */
export interface FilterState {
  industry: Industry | 'all';
  estimatedAction: EstimatedAction | 'all';
  completionRateMin: number;
  completionRateMax: number;
  searchQuery: string;
}

/**
 * 计算配置状态
 */
export interface CalculationConfigState {
  defaultModel: PredictionModel;
  industryConfigs: Record<Industry, IndustryCalculationConfig>;
}

/**
 * 全局统计数据
 */
export interface DashboardStats {
  totalCustomers: number;
  highRiskCount: number;
  warningCount: number;
  averageCompletionRate: number;
  totalContractAmount: number;
  tierDistribution: Record<CustomerTier, number>;
}