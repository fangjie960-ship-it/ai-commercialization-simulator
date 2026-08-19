# 部署教程（Cloudflare Pages）

> 本文件命名与代码保持一致：项目名 / 环境变量 / API 路由全部对齐。

## 一、命名对照表（部署时照抄）

| 项 | 名称 |
|----|------|
| package.json 项目名 | `ai-commercialization-simulator` |
| GitHub 仓库名（建议同名） | `ai-commercialization-simulator` |
| Cloudflare Pages 项目名（建议同名） | `ai-commercialization-simulator` |
| 部署后域名 | `https://ai-commercialization-simulator.pages.dev` |
| 环境变量（Key 名二选一） | `DEEPSEEK_API_KEY` 或 `AI_API_KEY`（推荐 `AI_API_KEY`） |
| API 路由 | `/api/recommend`、`/api/recommend-scheme` |
| 本地启动 | `npm run dev`（默认 5173 端口） |

> 说明：代码优先读 `DEEPSEEK_API_KEY`，也兼容 `AI_API_KEY`；可选 `AI_BASE_URL`（默认 https://api.deepseek.com/v1）与 `AI_MODEL`（默认 deepseek-chat）。
> 前端不碰 Key；本地开发时 Key 来自 `.env.local`（已 gitignore，不会推送到 GitHub）。

## 二、第一步：把本地代码推到 GitHub

1. 在 GitHub 网页新建一个**空仓库**，命名 `ai-commercialization-simulator`（不要勾选初始化 README，避免冲突）。
2. 在项目目录打开终端，执行：

```bash
# 添加远程仓库（把 <用户名> 换成你的 GitHub 用户名）
git remote add origin https://github.com/<用户名>/ai-commercialization-simulator.git

# 推送（当前分支是 master）
git push -u origin master
```

> 本地已经是 git 仓库（已有提交），推完即可。`.env.local`、`node_modules/`、`dist/` 都在 `.gitignore` 里，不会上传。

## 三、第二步：Cloudflare Pages 连接部署

1. 登录 Cloudflare 控制台 → 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 授权 GitHub，选择仓库 `ai-commercialization-simulator`。
3. 构建设置（框架预设选 **Vite**，会自动填好）：

| 配置项 | 值 |
|--------|-----|
| 框架预设 | Vite |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| Functions 目录 | `functions`（Cloudflare 自动识别，无需配置） |

4. **环境变量**：在项目设置 → **Variables** 里添加：

```
AI_API_KEY = 你本地 .env.local 里的那串值

可选：
AI_BASE_URL = https://api.deepseek.com/v1
AI_MODEL = deepseek-chat（按你实际用的模型填）
```

5. 点 **Save and Deploy**，等一两分钟完成。

> 部署后 `functions/api/` 里的两个接口自动生效为 `/api/recommend` 和 `/api/recommend-scheme`。

## 四、第三步：首次打开

1. 访问 `https://ai-commercialization-simulator.pages.dev`。
2. 两种方式准备数据：
   - **加载演示数据**：客户列表空状态点「加载演示数据」；
   - **恢复本地数据**：先在本地客户列表点「备份数据」导出 JSON → 在线上客户列表点「恢复数据」导入。
3. AI 功能按需使用（没配 Key 或不用 AI，其它功能不受影响）。

## 五、日常使用

- **改代码后重新部署**：push 到 GitHub 的 `master`，Cloudflare 会自动触发重新构建部署。
- **数据多端/防丢失**：浏览器本地数据用「备份数据 / 恢复数据」迁移；跨设备需手动备份恢复（如需多端同步，需要后端数据库，见 TECH_DESIGN v1.1）。
- **本地预览**：`npm run dev` 即可，接口走 vite 中间件，与线上同行为。

## 六、常见问题

| 问题 | 处理 |
|------|------|
| AI 报"API Key not configured" | 检查 Cloudflare 项目环境变量 `DEEPSEEK_API_KEY` 是否已添加且拼写一致 |
| 换浏览器看不到数据 | 这是浏览器本地存储的正常表现，用「备份/恢复」迁移 |
| `.pages.dev` 域名被占用 | 项目名加后缀（如 `ai-commercialization-simulator-x`），其它不变 |