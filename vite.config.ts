import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { ServerResponse } from 'node:http'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import recommendHandler from './api/recommend'
import recommendSchemeHandler from './api/recommend-scheme'

/**
 * 本地开发中间件：让 `npm run dev` 也能访问 /api/recommend
 * 生产环境由 Vercel 直接运行 api/ 目录下的 Serverless Function，此插件不生效
 * （vite.config.ts 的静态 import 会被 esbuild 打包进配置文件，因此可复用 handler）
 */
function apiDevMiddleware(): Plugin {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const handler: { [path: string]: (req: VercelRequest, res: VercelResponse) => Promise<void> } = {
          '/api/recommend': recommendHandler,
          '/api/recommend-scheme': recommendSchemeHandler,
        }
        const routeHandler = handler[url]
        if (!routeHandler) return next()

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        // 读取并解析请求体
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const raw = Buffer.concat(chunks).toString('utf8')
        let body: unknown = {}
        try {
          body = raw ? JSON.parse(raw) : {}
        } catch {
          body = {}
        }

        const vercelReq = req as VercelRequest
        vercelReq.body = body

        try {
          await routeHandler(vercelReq, toVercelResponse(res))
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

/**
 * 给 Node 原生 ServerResponse 补充 VercelResponse 的 status/json 方法
 */
function toVercelResponse(res: ServerResponse): VercelResponse {
  const wrapped = res as VercelResponse
  wrapped.status = (code: number) => {
    res.statusCode = code
    return wrapped
  }
  wrapped.json = (body: unknown) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
    return wrapped
  }
  return wrapped
}

export default defineConfig(({ mode }) => {
  // 加载 .env / .env.local，让 dev 中间件里的 /api/recommend 能读到 DEEPSEEK_API_KEY
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