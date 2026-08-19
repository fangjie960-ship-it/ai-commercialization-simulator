import type { Customer, DailySpend, PredictedAction } from '@/types/customer'

/**
 * 生成模拟营业执照号
 * 固定格式：91110000MA01AxxxxX（18位），后四位由 index 决定
 * 保证演示数据可复现，且与 public/sample-spend.csv 的营业执照一致，便于导入匹配
 */
function generateBusinessLicense(index: number): string {
  const seq = String(index + 1).padStart(4, '0')
  return `91110000MA01A${seq}X`
}

/**
 * 生成每日消耗流水数据
 * 生成最近90天的每日数据，最后一天为今天
 * @param monthlyTrend - 月度消耗趋势
 * @param contractAmount - 框架金额（用于计算返点，金额越高返点越高）
 */
function generateDailySpend(
  monthlyTrend: number[],
  contractAmount: number
): DailySpend[] {
  const dailyData: DailySpend[] = []
  const today = new Date()
  
  // 基于月度趋势生成日均基准值
  const avgMonthly = monthlyTrend.reduce((a, b) => a + b, 0) / monthlyTrend.length
  const dailyBase = avgMonthly / 30
  
  // 返点比例计算：基于框架金额，1%-10%，金额越高返点越高
  // 假设框架金额范围 100-2000万，映射到 1%-10%
  const minAmount = 100
  const maxAmount = 2000
  const normalizedAmount = Math.max(0, Math.min(1, (contractAmount - minAmount) / (maxAmount - minAmount)))
  const baseRebateRate = 1 + normalizedAmount * 9 // 1% 到 10%
  
  // 生成90天数据，最后一天是今天
  for (let i = 89; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    
    // 随机波动 ±20%
    const fluctuation = 0.8 + Math.random() * 0.4
    const amount = parseFloat((dailyBase * fluctuation).toFixed(2))
    
    // 目标金额 = 日均消耗 * (1 + 随机增长目标 0-30%)
    const targetAmount = parseFloat((amount * (1 + Math.random() * 0.3)).toFixed(2))
    
    // 返点比例：基于基础返点 ±1% 的随机波动
    const rebateRate = parseFloat((baseRebateRate + (Math.random() * 2 - 1)).toFixed(1))
    const finalRebateRate = Math.max(1, Math.min(10, rebateRate)) // 限制在1%-10%
    
    // 预估动作基于最近趋势
    let predictedAction: PredictedAction
    const trendFactor = monthlyTrend[monthlyTrend.length - 1] / monthlyTrend[0]
    if (trendFactor > 1.2) {
      predictedAction = Math.random() > 0.3 ? 'increase_spend' : 'maintain'
    } else if (trendFactor < 0.8) {
      predictedAction = Math.random() > 0.5 ? 'decrease_spend' : 'churn_risk'
    } else {
      predictedAction = Math.random() > 0.5 ? 'maintain' : 'increase_spend'
    }
    
    dailyData.push({
      date: date.toISOString().split('T')[0],
      amount,
      targetAmount,
      rebateRate: finalRebateRate,
      predictedAction
    })
  }
  
  return dailyData
}

/**
 * 生成随机的到期日期
 * 固定为当年12-31（商业化年度框架到期日），避免写死年份
 */
function generateExpireDate(): string {
  const year = new Date().getFullYear()
  return `${year}-12-31`
}

/**
 * Demo客户数据
 * 覆盖4个行业（短剧/游戏/电商/教育）和4个分层
 */
export const demoCustomers: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>[] = ([
  // 高潜客户 - 短剧行业
  {
    name: '剧好看传媒',
    industry: 'drama' as const,
    contractAmount: 500,
    completedAmount: 420,
    monthlyTrend: [45, 52, 58, 65, 72, 80],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'A',
    remark: '头部短剧客户，增长迅猛'
  },
  {
    name: '热播剧场',
    industry: 'drama' as const,
    contractAmount: 800,
    completedAmount: 680,
    monthlyTrend: [80, 90, 105, 115, 125, 140],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'A'
  },
  // 高潜客户 - 游戏行业
  {
    name: '王者游戏',
    industry: 'game' as const,
    contractAmount: 1000,
    completedAmount: 850,
    monthlyTrend: [100, 120, 135, 150, 165, 180],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'A'
  },
  // 稳定客户 - 电商行业
  {
    name: '优选电商',
    industry: 'ecommerce' as const,
    contractAmount: 600,
    completedAmount: 380,
    monthlyTrend: [55, 58, 60, 62, 65, 68],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'B'
  },
  {
    name: '好物优选',
    industry: 'ecommerce' as const,
    contractAmount: 400,
    completedAmount: 240,
    monthlyTrend: [35, 38, 40, 42, 40, 45],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'B'
  },
  {
    name: '购物狂欢节',
    industry: 'ecommerce' as const,
    contractAmount: 300,
    completedAmount: 180,
    monthlyTrend: [25, 28, 30, 35, 32, 30],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'B'
  },
  // 稳定客户 - 教育行业
  {
    name: '学而思网校',
    industry: 'education' as const,
    contractAmount: 350,
    completedAmount: 210,
    monthlyTrend: [30, 32, 35, 38, 35, 40],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'B'
  },
  // 预警客户 - 短剧行业
  {
    name: '小剧场联盟',
    industry: 'drama' as const,
    contractAmount: 200,
    completedAmount: 90,
    monthlyTrend: [20, 18, 15, 12, 10, 15],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'C'
  },
  // 预警客户 - 游戏行业
  {
    name: '休闲游戏盒',
    industry: 'game' as const,
    contractAmount: 150,
    completedAmount: 60,
    monthlyTrend: [12, 10, 8, 10, 12, 8],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'C'
  },
  // 预警客户 - 电商行业
  {
    name: '特卖商城',
    industry: 'ecommerce' as const,
    contractAmount: 250,
    completedAmount: 100,
    monthlyTrend: [20, 18, 15, 12, 10, 15],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'C'
  },
  // 高风险客户 - 教育行业
  {
    name: '在线教育平台',
    industry: 'education' as const,
    contractAmount: 180,
    completedAmount: 45,
    monthlyTrend: [10, 8, 6, 8, 5, 8],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'D',
    remark: '完成率极低，需重点关注'
  },
  // 高风险客户 - 其他行业
  {
    name: '本地生活通',
    industry: 'other' as const,
    contractAmount: 120,
    completedAmount: 30,
    monthlyTrend: [8, 6, 5, 4, 3, 4],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'D'
  },
  // 更多稳定客户
  {
    name: '手游之家',
    industry: 'game' as const,
    contractAmount: 450,
    completedAmount: 280,
    monthlyTrend: [40, 45, 48, 50, 47, 50],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'B'
  },
  {
    name: '知识付费平台',
    industry: 'education' as const,
    contractAmount: 280,
    completedAmount: 175,
    monthlyTrend: [25, 28, 30, 32, 30, 30],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'B'
  },
  {
    name: '短视频工场',
    industry: 'drama' as const,
    contractAmount: 380,
    completedAmount: 250,
    monthlyTrend: [35, 40, 42, 45, 43, 45],
    dailySpend: [],
    contractDate: '2024-01-01',
    expireDate: generateExpireDate(),
    grade: 'B'
  }
] as const).map((customer, index) => ({
  ...(customer as unknown as Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>),
  // 营业执照确定性生成（与 public/sample-spend.csv 的执照一致）
  businessLicense: generateBusinessLicense(index),
  dailySpend: generateDailySpend([...customer.monthlyTrend], customer.contractAmount)
}))
