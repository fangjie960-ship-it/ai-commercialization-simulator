import { STRATEGY_SYSTEM_PROMPT, buildStrategyUserPrompt } from '../../src/config/prompts';
import { getIndustryName } from '../../src/config/industryCoefficients';
import type { Customer, CustomerAnalysis, ContractScale, StrategyType, TrendDirection } from '../../src/types/customer';

/**
 * Cloudflare Pages Function - AI 策略推荐
 * 路由：POST /api/recommend
 * API Key 通过 Pages 项目环境变量 DEEPSEEK_API_KEY 注入（context.env），不暴露到前端
 */

/** Pages Function 上下文（最小类型，避免额外依赖） */
interface FunctionContext {
  request: Request;
  env: { DEEPSEEK_API_KEY?: string; AI_API_KEY?: string; AI_BASE_URL?: string; AI_MODEL?: string };
}

interface RecommendRequest {
  customer: Customer;
  analysis: CustomerAnalysis;
}

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
 * 脱敏规则（AGENTS.md §3.3）：
 * - 客户名称 → 不发送，使用分层 key 替代
 * - 框架金额 → 分桶（<500万=small，500-2000万=medium，>2000万=large）
 * - 月度消耗原始值 → 不发送，只发趋势方向
 */
function buildSanitizedPrompt(data: RecommendRequest): string {
  const { customer, analysis } = data;

  const contractScale: ContractScale =
    customer.contractAmount < 500 ? 'small'
    : customer.contractAmount <= 2000 ? 'medium'
    : 'large';

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

/** 近6个月消耗线性回归斜率分档：>0.1 上升，<-0.1 下降，否则平稳 */
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

/** 校验 LLM 返回结构，LLM 输出不可信，必须逐字段校验 */
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

export async function onRequestPost({ request, env }: FunctionContext): Promise<Response> {
  const apiKey = env.DEEPSEEK_API_KEY || env.AI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'API Key not configured' }, { status: 500 });
  }

  try {
    const baseUrl = (env.AI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
    const model = env.AI_MODEL || 'deepseek-chat';

    let data: RecommendRequest;
    try {
      data = (await request.json()) as RecommendRequest;
    } catch {
      return Response.json({ error: '客户数据或分析结果不完整' }, { status: 400 });
    }

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
      return Response.json({ error: '客户数据或分析结果不完整' }, { status: 400 });
    }

    const userPrompt = buildSanitizedPrompt(data);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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
      // 把 DeepSeek 的真实错误透传给前端，便于排查（如 Key 无效/模型不存在）
      return Response.json({ error: 'AI 服务调用失败：' + (error || '未知错误').slice(0, 300) }, { status: 502 });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      const raw = JSON.stringify(result)?.slice(0, 300) || '';
      console.error('AI 响应内容为空，模型:', model, '原始返回:', raw);
      return Response.json({ error: 'AI 响应为空，请重试（模型 ' + model + '）' }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return Response.json({ error: 'AI 响应格式不正确，请重试' }, { status: 502 });
    }

    const recommendation = validateRecommendation(parsed);
    if (!recommendation) {
      return Response.json({ error: 'AI 响应格式不正确，请重试' }, { status: 502 });
    }

    return Response.json(recommendation, { status: 200 });
  } catch (error) {
    console.error('Recommendation error:', error);
    return Response.json({ error: '服务内部错误，请稍后重试' }, { status: 500 });
  }
}