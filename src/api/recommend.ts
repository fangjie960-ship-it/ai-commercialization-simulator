import type { Customer, CustomerAnalysis, StrategyRecommendation, StrategyType } from '@/types/customer'
import type { ShortTermTierConfig } from '@/config/schemeConfig'

/**
 * 前端 LLM 调用封装
 * 只负责调用服务端 /api/recommend（Vercel Serverless Function），
 * 绝不直接调用 LLM API —— API Key 只存在于服务端环境变量
 */

interface AIRecommendationResponse {
  strategies: StrategyType[]
  reasons: string[]
  expectedIncrease: number
  expectedCompletionBoost: number
  incentiveCost: number
  suggestedParams: {
    incentiveLevel: 'low' | 'medium' | 'high'
    incentiveRate: number
    duration: number
    roiThreshold: number
  }
  confidence: number
  explanation?: string
}

// LLM 请求超时时间（毫秒），超时后提示用户重试
const REQUEST_TIMEOUT_MS = 15_000

/**
 * 获取 AI 策略推荐
 * @param customer 客户数据（浏览器 → 服务端，服务端脱敏后再转发给 LLM）
 * @param analysis 客户分析结果
 * @throws Error 超时 / 网络 / 服务异常时抛出带用户可读信息的错误
 */
export async function getAIRecommendation(
  customer: Customer,
  analysis: CustomerAnalysis
): Promise<StrategyRecommendation> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer, analysis }),
        signal: controller.signal,
      })
    } catch (error) {
      // 超时或网络异常
      if (controller.signal.aborted) {
        throw new Error('AI 推荐超时，请重试')
      }
      throw new Error('网络请求失败，请检查网络连接后重试')
    }

    if (!response.ok) {
      let message = `AI 服务异常（HTTP ${response.status}）`
      try {
        const data = await response.json()
        if (data && typeof data.error === 'string') message = data.error
      } catch {
        // 解析失败则使用默认错误信息
      }
      throw new Error(message)
    }

    const data = (await response.json()) as AIRecommendationResponse
    return validateAndMap(data, customer.id)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 校验服务端返回并映射为 StrategyRecommendation
 * 服务端已对 LLM 输出做过逐字段校验，这里再做一次防御性校验，避免把不可信数据直接交给 UI
 */
function validateAndMap(data: AIRecommendationResponse, customerId: string): StrategyRecommendation {
  const { strategies, reasons, suggestedParams } = data
  if (
    !Array.isArray(strategies) ||
    strategies.length === 0 ||
    !Array.isArray(reasons) ||
    !suggestedParams ||
    typeof suggestedParams !== 'object'
  ) {
    throw new Error('AI 响应格式不正确，请重试')
  }

  return {
    customerId,
    strategies,
    reasons,
    expectedIncrease: Number.isFinite(data.expectedIncrease) ? data.expectedIncrease : 0,
    expectedCompletionBoost: Number.isFinite(data.expectedCompletionBoost) ? data.expectedCompletionBoost : 0,
    incentiveCost: Number.isFinite(data.incentiveCost) ? data.incentiveCost : 0,
    suggestedParams: {
      incentiveLevel: suggestedParams.incentiveLevel,
      incentiveRate: Number.isFinite(suggestedParams.incentiveRate) ? suggestedParams.incentiveRate : 0,
      duration: Number.isFinite(suggestedParams.duration) ? suggestedParams.duration : 0,
      roiThreshold: Number.isFinite(suggestedParams.roiThreshold) ? suggestedParams.roiThreshold : 0,
    },
    confidence: Number.isFinite(data.confidence) ? data.confidence : 0.8,
    ...(typeof data.explanation === 'string' ? { explanation: data.explanation } : {}),
  }
}
/* ============ AI 方案助手（批量） ============ */

/**
 * 客户脱敏汇总（发送给 AI 方案助手的输入，不含客户名/执照/原始金额明细）
 */
export interface SchemeAdviceSummary {
  scheme: 'waiver' | 'short_term'
  customerCount: number
  industryDistribution: Record<string, number>
  tierDistribution: Record<string, number>
  completionRate: { min: number; max: number; avg: number }
  baseDaily: { min: number; max: number; avg: number; p25: number; p50: number; p75: number }
  contractAmount: { avg: number; total: number }
  avgRemainingDays: number
  estimatedPenalty: { avg: number; total: number }
}

/** AI 方案建议 */
export interface SchemeAdvice {
  targetRoi?: number // 免扣保证金：ROI 目标
  policyDays?: number // 短期政策：政策期天数
  tiers?: ShortTermTierConfig[] // 短期政策：档位（阈值/增速/返点）
  reasoning: string
  confidence: number
}

/**
 * 获取 AI 方案建议（批量）
 * @param summary 客户脱敏汇总
 * @throws Error 超时 / 网络 / 服务异常时抛出带用户可读信息的错误
 */
export async function getSchemeAdvice(summary: SchemeAdviceSummary): Promise<SchemeAdvice> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await fetch('/api/recommend-scheme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('AI 方案建议超时，请重试')
      }
      throw new Error('网络请求失败，请检查网络连接后重试')
    }

    if (!response.ok) {
      let message = `AI 服务异常（HTTP ${response.status}）`
      try {
        const data = await response.json()
        if (data && typeof data.error === 'string') message = data.error
      } catch {
        // 默认错误信息
      }
      throw new Error(message)
    }

    const data = (await response.json()) as SchemeAdvice
    if (!data || typeof data.reasoning !== 'string') {
      throw new Error('AI 响应格式不正确，请重试')
    }
    return data
  } finally {
    clearTimeout(timeoutId)
  }
}