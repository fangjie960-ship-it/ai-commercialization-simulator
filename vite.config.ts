import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { ServerResponse } from 'node:http'
import { onRequestPost as recommendOnRequest } from './functions/api/recommend'
import { onRequestPost as recommendSchemeOnRequest } from './functions/api/recommend-scheme'
import { onRequestGet as healthOnRequest } from './functions/api/health'

/**
 * 本地开发中间件：让 `npm run dev` 也能访问 /api/recommend 和 /api/recommend-scheme
 * 生产环境由 Cloudflare Pages 直接运行 functions/ 目录下的 Pages Function，此插件不生效
 * （vite.config.ts 的静态 import 会被 esbuild 打包进配置文件，因此可复用 handler）
 */
function apiDevMiddleware(): Plugin {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const routeHandlers: Record<string, (request: Request) => Promise<Response>> = {
          '/api/health': (request) => healthOnRequest({ request, env: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, AI_API_KEY: process.env.AI_API_KEY, AI_BASE_URL: process.env.AI_BASE_URL, AI_MODEL: process.env.AI_MODEL } }),
          '/api/recommend': (request) =>
            recommendOnRequest({ request, env: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, AI_API_KEY: process.env.AI_API_KEY, AI_BASE_URL: process.env.AI_BASE_URL, AI_MODEL: process.env.AI_MODEL } }),
          '/api/recommend-scheme': (request) =>
            recommendSchemeOnRequest({ request, env: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY } }),
        }
        const routeHandler = routeHandlers[url]
        if (!routeHandler) return next()

        // /api/health 允许 GET，其余只允许 POST
        if (req.method !== 'POST' && url !== '/api/health') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        // 读取请求体
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const raw = Buffer.concat(chunks).toString('utf8')

        // 组装成 Web Request（Cloudflare Pages Function 的入参形态）
        const headers = new Headers()
        Object.entries(req.headers).forEach(([key, value]) => {
          if (typeof value === 'string') headers.set(key, value)
        })
        const request = new Request(`http://localhost${req.url || '/'}`, {
          method: req.method,
          headers,
          body: raw ? raw : undefined,
        })

        try {
          const response = await routeHandler(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(await response.text())
        } catch (err) {
          console.error('api dev handler error:', err)
          if (!res.writableEnded) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: '服务内部错误，请稍后重试' }))
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // 加载 .env / .env.local，让 dev 中间件里的接口能读到 DEEPSEEK_API_KEY
  const env = loadEnv(mode, process.cwd(), '')
  if (!process.env.DEEPSEEK_API_KEY && env.DEEPSEEK_API_KEY) {
    process.env.DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY
  }

  return {
    plugins: [react(), apiDevMiddleware()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  }
})