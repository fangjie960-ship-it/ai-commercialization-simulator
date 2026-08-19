# AGENTS.md - AI 开发指令手册

**项目：** AI商业化策略模拟器  
**版本：** v1.0  
**作者：** 方杰  
**更新日期：** 2026-04-02

> 这是一份写给 AI（Cursor / Windsurf / WorkBuddy 等）的项目开发指令文件。
> AI 在参与本项目开发时，必须完整阅读并严格遵守本文件中的所有规范。

---

## 1. 项目概述

### 1.1 产品定位

面向商业化运营团队的 AI 策略辅助 Web 工具。核心功能：

1. **客户分层**：基于消耗完成率、趋势、行业等多维度自动分层
2. **消耗预测**：基于历史数据的趋势外推，预测框架完成率
3. **AI 策略推荐**：调用 LLM，根据分层结果推荐差异化追框策略
4. **ROI 模拟**：模拟不同策略下的 ROI 与增量消耗

### 1.2 核心文档

在开始任何开发任务前，必须先读这两个文档：

- `PRD.md`：产品需求，所有功能以此为准
- `TECH_DESIGN.md`：技术架构，所有技术决策以此为准

**如果 PRD 和代码实现有冲突，以 PRD 为准；如果 TECH_DESIGN 和 PRD 有冲突，先提出，不要自作主张修改架构。**

### 1.3 技术栈速查

- 前端：React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- 图表：Recharts
- 状态管理：Zustand
- 数据持久化：IndexedDB（通过 `idb`）
- CSV 解析：Papa Parse
- LLM：DeepSeek / OpenAI API（通过 Vercel Serverless Function 代理）
- 部署：Vercel

---

## 2. 开发规范

### 2.1 代码风格

**TypeScript：**
- 所有组件、函数、接口必须有完整的 TypeScript 类型，禁止使用 `any`
- 接口优先于 type（除非需要联合类型）
- 枚举用 `const` 枚举或联合类型字符串，避免普通枚举（影响 tree-shaking）

```typescript
// ✅ 正确
type Industry = 'drama' | 'game' | 'ecommerce' | 'education' | 'other';
interface Customer { id: string; industry: Industry; ... }

// ❌ 禁止
const customer: any = {...};
enum Industry { drama, game }  // 普通枚举，避免使用
```

**命名规范：**
- 组件文件：`PascalCase.tsx`（如 `CustomerCard.tsx`）
- 工具函数文件：`camelCase.ts`（如 `classification.ts`）
- 组件名：`PascalCase`
- 函数名：`camelCase`
- 常量：`SCREAMING_SNAKE_CASE`
- CSS 类名：Tailwind 原子类，不写自定义 CSS（除非 Tailwind 实现不了）

**React 规范：**
- 函数组件 + Hooks，禁止使用 Class 组件
- 复杂状态逻辑抽离为自定义 Hook（`src/hooks/`）
- 避免 `useEffect` 里做数据获取，用自定义 Hook 封装
- 列表渲染必须有唯一 `key`，不能用 `index` 作为 key（数据有 id 的情况下）
- 组件 props 超过 3 个必须定义 interface

```typescript
// ✅ 正确
interface CustomerCardProps {
  customer: Customer;
  analysis: CustomerAnalysis;
  onSelectStrategy: (customerId: string) => void;
}
export function CustomerCard({ customer, analysis, onSelectStrategy }: CustomerCardProps) {...}

// ❌ 禁止
export function CustomerCard(props: any) {...}
```

### 2.2 文件组织规范

- 严格按照 `TECH_DESIGN.md` 第 2 节的项目结构放置文件
- 不要在 `pages/` 里写业务逻辑，业务逻辑放 `hooks/` 或 `utils/`
- 不要在 `components/` 里直接访问 Zustand store，通过 props 传入或在 `hooks/` 里封装
- 配置数据（策略库、行业系数、分层规则）必须放在 `src/config/` 目录，不要硬编码在组件里

### 2.3 注释规范

以下情况**必须**写注释，不写的代码我会打回去重写：

```typescript
// 1. 算法/计算逻辑：解释为什么这么算，而不是描述在做什么
/**
 * 客户分层评分
 * 加权规则：完成率(40%) + 趋势(30%) + 时间充裕度(20%) + 行业偏差(10%)
 * 评分 >= 75 → 高潜，50-75 → 稳定，25-50 → 预警，<25 → 高风险
 */
function classifyCustomer(analysis: CustomerAnalysis): CustomerTier {...}

// 2. Prompt 模板：必须注释每个变量的含义和脱敏方式
// {tier}: 客户分层，已脱敏，原始分层英文 key
// {industryName}: 行业名称，中文，直接传
// {contractScale}: 框架金额分桶（小/中/大），不传原始金额

// 3. 非直觉的边界处理
// 历史数据 < 3 个月时，线性回归不可靠，直接返回 null 表示无法预测
if (historicalData.length < 3) return null;
```

不需要注释的情况：
- 变量名/函数名已经自解释的
- shadcn 组件的标准用法
- 简单的 JSX 结构

---

## 3. 关键模块开发指引

### 3.1 客户分层算法（`src/utils/classification.ts`）

- 分层规则**只能**从 `src/config/classificationRules.ts` 读取，不能硬编码阈值
- 评分维度和权重在注释里写清楚
- 必须有单元测试（`classification.test.ts`），覆盖4个分层的边界情况

### 3.2 消耗预测算法（`src/utils/prediction.ts`）

- 使用线性回归实现，不要引入外部 ML 库（太重了）
- 历史数据 < 3 个月时返回 null，不强行预测
- 预测值必须设置下限（不能为负数）
- 置信区间使用 ±1 个标准差
- 行业系数从 `src/config/industryCoefficients.ts` 读取

### 3.3 LLM 策略推荐（`api/recommend.ts` + `src/api/llm.ts`）

**这是最重要的模块，有严格的安全要求：**

- API Key **只能**在 Vercel Serverless Function（`api/recommend.ts`）里使用
- 前端（`src/api/llm.ts`）只负责调用 `/api/recommend`，绝不能直接调用 LLM API
- 发给 LLM 的数据必须脱敏，规则：
  - 客户名称 → 不发送，用 `customer_{tier}` 替代
  - 框架金额 → 分桶（<500万=small，500-2000万=medium，>2000万=large）
  - 月度消耗原始值 → 不发送，只发趋势方向（rising/stable/falling）+ 斜率档位
- LLM 输出必须指定 JSON 格式（`response_format: { type: 'json_object' }`）
- 接收到 LLM 返回后，**必须**用 TypeScript 校验结构，不要直接使用未校验的数据
- 超时设置为 15 秒，超时后给用户提示"AI 推荐超时，请重试"

**Prompt 模板维护：**
- 所有 Prompt 统一放在 `src/config/prompts.ts`
- System Prompt 包含：策略专家角色 + 完整策略知识库 + JSON Schema 输出规范
- 修改 Prompt 时需要在同文件记录修改原因和日期（注释形式）

### 3.4 数据持久化（Zustand + IndexedDB）

- IndexedDB 操作全部封装在 `src/store/` 里，组件和 hooks 不直接操作 IndexedDB
- Store 初始化时从 IndexedDB 恢复数据（`rehydrate`），完成前显示 loading 状态
- 增删改操作同步更新 Zustand state 和 IndexedDB（不等 IndexedDB 写完再更新 UI，乐观更新）
- IndexedDB 写入失败时，回滚 Zustand state 并提示用户

### 3.5 CSV 导入（`src/utils/csvParser.ts` + `src/components/ImportModal.tsx`）

- 解析逻辑在 `csvParser.ts`，UI 交互在 `ImportModal.tsx`，两者解耦
- 校验错误必须显示具体原因（"第5行：框架金额不能为空"而不是"数据格式错误"）
- 导入成功后显示摘要：总行数 / 成功导入数 / 失败行数

---

## 4. 测试要求

### 4.1 必须有单元测试的模块

| 模块 | 测试文件 | 最低覆盖要求 |
|------|---------|-----------|
| `utils/classification.ts` | `classification.test.ts` | 4个分层的边界值，共8个用例 |
| `utils/prediction.ts` | `prediction.test.ts` | 正常预测、数据不足、全零数据 |
| `utils/roi.ts` | `roi.test.ts` | 基础计算、边界值（ROI=0、极高ROI） |
| `utils/csvParser.ts` | `csvParser.test.ts` | 正常CSV、缺字段、数值超范围、空文件 |

### 4.2 测试框架

使用 **Vitest**（Vite 生态，配置简单）：

```bash
npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```

```typescript
// vite.config.ts 添加
import { defineConfig } from 'vite';
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

### 4.3 测试规范

- 测试文件和源文件放同一目录，命名为 `*.test.ts`
- 每个测试用例描述要说清楚测什么场景
- 不 mock 纯函数（classification、prediction、roi 都是纯函数，直接测）
- LLM 调用必须 mock，不在测试中真实调用 API

```typescript
// ✅ 正确的测试用例描述
it('should classify as high_risk when completion rate < 30% and remaining days < 60', () => {...})

// ❌ 不够具体
it('should work correctly', () => {...})
```

---

## 5. 代码提交规范

### 5.1 Commit Message 格式

```
<type>(<scope>): <subject>

[optional body]
```

**type 类型：**
- `feat`：新功能
- `fix`：Bug 修复
- `refactor`：重构（不影响功能）
- `style`：样式调整
- `test`：测试相关
- `docs`：文档更新
- `chore`：构建/工具配置

**示例：**
```
feat(classification): add industry coefficient adjustment to tier scoring
fix(csv): handle empty rows in uploaded file without throwing error
refactor(store): extract IndexedDB sync logic from customerStore
```

### 5.2 禁止提交的内容

- `.env.local`（包含 API Key）
- `node_modules/`
- 构建产物（`dist/`）
- 任何硬编码的 API Key、密钥、真实客户数据

`.gitignore` 必须包含：

```
.env.local
.env.*.local
node_modules/
dist/
*.log
```

---

## 6. UI/UX 开发注意事项

### 6.1 设计规范

- 深色主题，背景色 `#0F1117`（Tailwind: `bg-gray-950`）
- 强调色蓝色 `#3B82F6`（Tailwind: `text-blue-500` / `bg-blue-500`）
- 分层标签颜色：高潜=绿（`green-500`）、稳定=蓝（`blue-500`）、预警=黄（`yellow-500`）、高风险=红（`red-500`）
- 卡片背景 `#1C1E26`（Tailwind: `bg-gray-900`），圆角 `rounded-xl`

### 6.2 交互规范

- 所有按钮点击后有 loading 状态（特别是 AI 推荐按钮）
- 表单提交、数据导入的成功/失败状态必须有 Toast 提示（用 shadcn 的 Sonner）
- 空状态（数据为空时）必须有引导性文案和操作按钮，不能是空白页
- 错误状态必须有具体说明，不能只显示"出错了"

### 6.3 响应式要求

- 仅适配 PC 端（≥ 1280px），不做移动端
- 最小宽度 1280px，低于此宽度出现横向滚动条而非自适应

---

## 7. 重要约束与禁止事项

以下是**绝对禁止**的行为，AI 开发时不得违反：

1. **禁止在前端代码里使用 API Key**，无论是 `process.env`、`import.meta.env` 还是硬编码
2. **禁止将真实客户数据（即使是 Demo 数据）发送给 LLM**，必须脱敏
3. **禁止修改 `src/config/` 目录下的配置文件**，除非 PRD 明确要求更新配置
4. **禁止绕过 TypeScript 类型系统**（`as any`、`// @ts-ignore`）
5. **禁止在组件里直接操作 IndexedDB**，所有持久化操作通过 Store
6. **禁止引入未在 TECH_DESIGN.md 中列出的大型依赖**（如 moment.js、lodash、数据库 ORM），小型工具库需在代码注释里说明引入原因

如果遇到现有约束无法满足需求的情况，**先提出问题，等待确认，不要自作主张修改架构**。

---

## 8. Demo 数据准备

项目需要一套演示用的假数据，用于展示所有功能：

- 数量：15-20个客户
- 覆盖4个行业（短剧/游戏/电商/教育）
- 覆盖4个分层（每层至少3个客户）
- 数据存放位置：`public/demo-data.json`
- Demo 数据加载：应用首次打开且无本地数据时，提示用户"是否加载演示数据"

Demo 数据字段要合理（完成率、消耗趋势、行业匹配），**不能出现明显不合逻辑的数据**（如已完成消耗 > 框架金额）。
