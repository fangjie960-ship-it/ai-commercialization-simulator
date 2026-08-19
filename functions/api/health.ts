/**
 * Cloudflare Pages Function - 环境与鉴权诊断
 * 路由：GET /api/health
 * 会真的用当前 Key 给 DeepSeek 发一个 1 token 的最小请求，验证鉴权是否通过（不泄露 Key 本身）
 */
interface FunctionContext {
  request: Request;
  env: { DEEPSEEK_API_KEY?: string; AI_API_KEY?: string; AI_BASE_URL?: string; AI_MODEL?: string };
}

export async function onRequestGet({ env }: FunctionContext): Promise<Response> {
  const apiKey = env.DEEPSEEK_API_KEY || env.AI_API_KEY;
  const baseUrl = (env.AI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
  const model = env.AI_MODEL || 'deepseek-chat';

  // 用当前 Key 给 DeepSeek 发一个最小请求，验证鉴权
  let authTest: { ok: boolean; error?: string } = { ok: false };
  if (apiKey) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });
      if (res.ok) {
        authTest = { ok: true };
      } else {
        const text = (await res.text()).slice(0, 300);
        authTest = { ok: false, error: `HTTP ${res.status}: ${text}` };
      }
    } catch (e) {
      authTest = { ok: false, error: e instanceof Error ? e.message : 'network error' };
    }
  }

  return Response.json({
    ok: true,
    keyConfigured: !!apiKey,
    keySource: env.DEEPSEEK_API_KEY ? 'DEEPSEEK_API_KEY' : env.AI_API_KEY ? 'AI_API_KEY' : null,
    baseUrl,
    model,
    authTest,
  });
}