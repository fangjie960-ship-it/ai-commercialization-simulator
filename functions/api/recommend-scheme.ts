import { SCHEME_ADVICE_SYSTEM_PROMPT, buildShortTermAdvicePrompt, buildWaiverAdvicePrompt } from '../../src/config/prompts';

/**
 * Cloudflare Pages Function - AI 方案助手
 * 路由：POST /api/recommend-scheme
 * 输入：一批客户的脱敏汇总 + 方案类型；输出：短期政策参数或免扣保证金 ROI 目标
 */

interface FunctionContext {
  request: Request;
  env: { DEEPSEEK_API_KEY?: string; AI_API_KEY?: string; AI_BASE_URL?: string; AI_MODEL?: string };
}

interface SchemeAdviceRequest {
  scheme: 'waiver' | 'short_term';
  summary: Record<string, unknown>;
}

interface TierSuggestion {
  maxBaseDaily?: number;
  baseGrowth: number;
  baseRebate: number;
  incentiveGrowth: number;
  incentiveRebate: number;
}

interface SchemeAdviceResponse {
  targetRoi?: number;
  policyDays?: number;
  tiers?: TierSuggestion[];
  reasoning: string;
  confidence: number;
}

/** 校验并规范化 LLM 返回：档位升序，最后一档作为兜底档 */
function validateAndNormalize(raw: unknown, scheme: string): SchemeAdviceResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const reasoning = typeof d.reasoning === 'string' ? d.reasoning : '';
  const confidence = Number(d.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;

  if (scheme === 'waiver') {
    const targetRoi = Number(d.targetRoi);
    if (!Number.isFinite(targetRoi) || targetRoi < 1 || targetRoi > 10) return null;
    return { targetRoi, reasoning, confidence };
  }

  const policyDays = Number(d.policyDays);
  const tiers = d.tiers;
  if (!Number.isFinite(policyDays) || policyDays < 1 || policyDays > 90) return null;
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 4) return null;

  const normalized: TierSuggestion[] = tiers.map((t) => {
    const tier = t as Record<string, unknown>;
    const maxBaseDaily = tier.maxBaseDaily === undefined ? undefined : Number(tier.maxBaseDaily);
    return {
      maxBaseDaily: maxBaseDaily !== undefined && Number.isFinite(maxBaseDaily) && maxBaseDaily > 0 ? maxBaseDaily : undefined,
      baseGrowth: Number.isFinite(Number(tier.baseGrowth)) ? Math.min(50, Math.max(0, Number(tier.baseGrowth))) : 0,
      baseRebate: Number.isFinite(Number(tier.baseRebate)) ? Math.min(15, Math.max(0, Number(tier.baseRebate))) : 0,
      incentiveGrowth: Number.isFinite(Number(tier.incentiveGrowth)) ? Math.min(50, Math.max(0, Number(tier.incentiveGrowth))) : 0,
      incentiveRebate: Number.isFinite(Number(tier.incentiveRebate)) ? Math.min(15, Math.max(0, Number(tier.incentiveRebate))) : 0,
    };
  });

  normalized.sort((a, b) => (a.maxBaseDaily ?? Infinity) - (b.maxBaseDaily ?? Infinity));
  if (normalized.length > 1) {
    normalized[normalized.length - 1].maxBaseDaily = undefined;
  }

  return { policyDays, tiers: normalized, reasoning, confidence };
}

export async function onRequestPost({ request, env }: FunctionContext): Promise<Response> {
  const apiKey = env.DEEPSEEK_API_KEY || env.AI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'API Key not configured' }, { status: 500 });
  }

  try {
    const baseUrl = (env.AI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
    const model = env.AI_MODEL || 'deepseek-chat';

    let data: SchemeAdviceRequest;
    try {
      data = (await request.json()) as SchemeAdviceRequest;
    } catch {
      return Response.json({ error: '方案类型或客户汇总不完整' }, { status: 400 });
    }

    if (!data?.summary || (data.scheme !== 'waiver' && data.scheme !== 'short_term')) {
      return Response.json({ error: '方案类型或客户汇总不完整' }, { status: 400 });
    }

    const userPrompt = data.scheme === 'waiver'
      ? buildWaiverAdvicePrompt(data.summary)
      : buildShortTermAdvicePrompt(data.summary);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SCHEME_ADVICE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 1200,
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
      // 防御：有些模型会包一层 ```json 代码块，先剥离再解析
      const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: 'AI 响应格式不正确（JSON解析失败）：' + content.slice(0, 300) }, { status: 502 });
    }

    const advice = validateAndNormalize(parsed, data.scheme);
    if (!advice) {
      return Response.json({ error: 'AI 响应格式不正确（字段校验未通过）：' + content.slice(0, 300) }, { status: 502 });
    }

    return Response.json(advice, { status: 200 });
  } catch (error) {
    console.error('Scheme advice error:', error);
    return Response.json({ error: '服务内部错误，请稍后重试' }, { status: 500 });
  }
}