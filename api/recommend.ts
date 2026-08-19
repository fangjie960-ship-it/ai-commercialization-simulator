import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Customer, CustomerAnalysis, ContractScale, StrategyType, TrendDirection } from '../src/types/customer';
import { STRATEGY_SYSTEM_PROMPT, buildStrategyUserPrompt } from '../src/config/prompts';
import { getIndustryName } from '../src/config/industryCoefficients';

/**
 * 策略推荐请求体
 * 前端只发送客户数据和分析结果，LLM 脱敏在服务端完成
 */
interface RecommendRequest {
  customer: Customer;
  analysis: CustomerAnalysis;
}

/**
 * 策略推荐响应体
 * 与 src/config/prompts.ts 中 STRATEGY_RESPONSE_SCHEMA 的字段保持一致
 */
interface RecommendResponse {
  strategies: StrategyType[];
  reasons: string[];
  expectedIncrease: number;
  expectedCompletionBoost: number;
  incentiveCost: number;
  suggestedParams: {
    incentiveLevel: 'low' | 'medium' | 'high';
    incentiveRate: number;
    duration: number;
    roiThreshold: number;
  };
  confidence: number;
  explanation?: string;
}

const VALID_STRATEGY_TYPES: StrategyType[] = ['waiver', 'short_term', 'tiered', 'exclusive', 'combined'];
const VALID_INCENTIVE_LEVELS: readonly string[] = ['low', 'medium', 'high'];

/**
 * 构建脱敏后的 User Prompt
 *
 * 脱敏规则（AGENTS.md §3.3）：
 * - 客户名称 → 不发送，buildStrategyUserPrompt 使用客户分层 key 替代
 * - 框架金额 → 分桶（<500万=small，500-2000万=medium，>2000万=large）
 * - 月度消耗原始值 → 不发送，只发趋势方向（rising/stable/falling）
 */
function buildSanitizedPrompt(data: RecommendRequest): string {
  const { customer, analysis } = data;

  // 框架金额分桶，不发送原始金额
  const contractScale: ContractScale =
    customer.contractAmount < 500 ? 'small'
    : customer.contractAmount <= 2000 ? 'medium'
    : 'large';

  // 趋势方向由近6个月消耗线性回归斜率分档，不发送原始消耗值
  const trendDirection = getTrendBucket(customer.monthlyTrend);

  return buildStrategyUserPrompt(
    analysis.tier,
    getIndustryName(customer.industry),
    contractScale,
    trendDirection,
    analysis.remainingDays,
    analysis.currentCompletionRate
  );
}

/**
 * 计算月度消耗趋势方向
 * 对近6个月消耗做线性回归求斜率：>0.1 上升，<-0.1 下降，否则平稳
 */
function getTrendBucket(monthlyTrend: number[]): TrendDirection {
  if (monthlyTrend.length < 2) return 'stable';

  const n = monthlyTrend.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = monthlyTrend.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * monthlyTrend[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  if (slope > 0.1) return 'rising';
  if (slope < -0.1) return 'falling';
  return 'stable';
}

/**
 * 校验 LLM 返回结构
 * LLM 输出不可信，必须逐字段校验后才能返回给前端
 */
function validateRecommendation(raw: unknown): RecommendResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const { strategies, reasons } = data;
  if (!Array.isArray(strategies) || strategies.length < 1 || strategies.length > 3) return null;
  if (!strategies.every((s) => VALID_STRATEGY_TYPES.includes(s as StrategyType))) return null;
  if (!Array.isArray(reasons) || reasons.some((r) => typeof r !== 'string')) return null;

  const expectedIncrease = Number(data.expectedIncrease);
  const expectedCompletionBoost = Number(data.expectedCompletionBoost);
  const incentiveCost = Number(data.incentiveCost);
  const confidence = Number(data.confidence);
  if (!Number.isFinite(expectedIncrease) || expectedIncrease < 0) return null;
  if (!Number.isFinite(incentiveCost) || incentiveCost < 0) return null;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;

  const suggestedParams = data.suggestedParams;
  if (!suggestedParams || typeof suggestedParams !== 'object') return null;
  const sp = suggestedParams as Record<string, unknown>;
  const incentiveLevel = sp.incentiveLevel;
  if (typeof incentiveLevel !== 'string' || !VALID_INCENTIVE_LEVELS.includes(incentiveLevel)) return null;
  const incentiveRate = Number(sp.incentiveRate);
  const duration = Number(sp.duration);
  const roiThreshold = Number(sp.roiThreshold);
  if (!Number.isFinite(incentiveRate) || !Number.isFinite(duration) || !Number.isFinite(roiThreshold)) return null;

  return {
    strategies: strategies as StrategyType[],
    reasons: reasons as string[],
    expectedIncrease,
    expectedCompletionBoost,
    incentiveCost,
    suggestedParams: {
      incentiveLevel: incentiveLevel as 'low' | 'medium' | 'high',
      incentiveRate,
      duration,
      roiThreshold,
    },
    confidence,
    ...(typeof data.explanation === 'string' ? { explanation: data.explanation } : {}),
  };
}

/**
 * Vercel Serverless Function - AI 策略推荐
 * API Key 仅在服务端使用，不会暴露到前端
 * 前端只调用 /api/recommend，绝不能直接调用 LLM API
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 仅允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key not configured' });
  }

  try {
    const data = req.body as RecommendRequest;
    // 校验请求体包含客户分析所需的完整字段（空对象 {} 也要拦截）
    if (
      !data?.customer ||
      !data?.analysis ||
      typeof data.customer.contractAmount !== 'number' ||
      !Array.isArray(data.customer.monthlyTrend) ||
      typeof data.analysis.tier !== 'string' ||
      typeof data.analysis.remainingDays !== 'number' ||
      typeof data.analysis.currentCompletionRate !== 'number'
    ) {
      return res.status(400).json({ error: '客户数据或分析结果不完整' });
    }

    // 构建脱敏后的 prompt（System Prompt 来自 src/config/prompts.ts）
    const userPrompt = buildSanitizedPrompt(data);

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: STRATEGY_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('DeepSeek API error:', error);
      return res.status(502).json({ error: 'AI 服务暂时不可用，请稍后重试' });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'AI 响应为空，请重试' });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return res.status(502).json({ error: 'AI 响应格式不正确，请重试' });
    }

    const recommendation = validateRecommendation(parsed);
    if (!recommendation) {
      return res.status(502).json({ error: 'AI 响应格式不正确，请重试' });
    }

    return res.status(200).json(recommendation);
  } catch (error) {
    console.error('Recommendation error:', error);
    return res.status(500).json({ error: '服务内部错误，请稍后重试' });
  }
}