/**
 * Cloudflare Pages Function - 环境诊断
 * 路由：GET /api/health
 * 返回函数是否能读到 Key、以及将要使用的模型/地址（不泄露 Key 本身）
 */
interface FunctionContext {
  request: Request;
  env: { DEEPSEEK_API_KEY?: string; AI_API_KEY?: string; AI_BASE_URL?: string; AI_MODEL?: string };
}

export function onRequestGet({ env }: FunctionContext): Response {
  const apiKey = env.DEEPSEEK_API_KEY || env.AI_API_KEY;
  return Response.json({
    ok: true,
    keyConfigured: !!apiKey,
    keySource: env.DEEPSEEK_API_KEY ? 'DEEPSEEK_API_KEY' : env.AI_API_KEY ? 'AI_API_KEY' : null,
    baseUrl: env.AI_BASE_URL || 'https://api.deepseek.com/v1',
    model: env.AI_MODEL || 'deepseek-chat',
  });
}