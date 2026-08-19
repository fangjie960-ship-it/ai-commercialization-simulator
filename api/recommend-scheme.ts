import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SCHEME_ADVICE_SYSTEM_PROMPT, buildShortTermAdvicePrompt, buildWaiverAdvicePrompt } from '../src/config/prompts';

/**
 * AI 方案助手 - Vercel Serverless Function
 * 输入：一批客户的脱敏汇总 + 方案类型
 * 输出：短期政策参数（政策期/档位）或 免扣保证金 ROI 目标
 * API Key 仅在服务端使用，不暴露到前端
 */

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

/**
 * 校验并规范化 LLM 返回
 * 档位按 maxBaseDaily 升序，最后一档作为兜底档（去掉上限）
 */
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
    const baseGrowth = Number(tier.baseGrowth);
    const baseRebate = Number(tier.baseRebate);
    const incentiveGrowth = Number(tier.incentiveGrowth);
    const incentiveRebate = Number(tier.incentiveRebate);
    const maxBaseDaily = tier.maxBaseDaily === undefined ? undefined : Number(tier.maxBaseDaily);
    return {
      maxBaseDaily: maxBaseDaily !== undefined && Number.isFinite(maxBaseDaily) && maxBaseDaily > 0 ? maxBaseDaily : undefined,
      baseGrowth: Number.isFinite(baseGrowth) ? Math.min(50, Math.max(0, baseGrowth)) : 0,
      baseRebate: Number.isFinite(baseRebate) ? Math.min(15, Math.max(0, baseRebate)) : 0,
      incentiveGrowth: Number.isFinite(incentiveGrowth) ? Math.min(50, Math.max(0, incentiveGrowth)) : 0,
      incentiveRebate: Number.isFinite(incentiveRebate) ? Math.min(15, Math.max(0, incentiveRebate)) : 0,
    };
  });

  // 按上限升序；最后一档作为兜底（去掉上限）
  normalized.sort((a, b) => (a.maxBaseDaily ?? Infinity) - (b.maxBaseDaily ?? Infinity));
  if (normalized.length > 1) {
    normalized[normalized.length - 1].maxBaseDaily = undefined;
  }

  return { policyDays, tiers: normalized, reasoning, confidence };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key not configured' });
  }

  try {
    const data = req.body as SchemeAdviceRequest;
    if (!data?.summary || (data.scheme !== 'waiver' && data.scheme !== 'short_term')) {
      return res.status(400).json({ error: '方案类型或客户汇总不完整' });
    }

    const userPrompt = data.scheme === 'waiver'
      ? buildWaiverAdvicePrompt(data.summary)
      : buildShortTermAdvicePrompt(data.summary);

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
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
    } catch {
      return res.status(502).json({ error: 'AI 响应格式不正确，请重试' });
    }

    const advice = validateAndNormalize(parsed, data.scheme);
    if (!advice) {
      return res.status(502).json({ error: 'AI 响应格式不正确，请重试' });
    }

    return res.status(200).json(advice);
  } catch (error) {
    console.error('Scheme advice error:', error);
    return res.status(500).json({ error: '服务内部错误，请稍后重试' });
  }
}