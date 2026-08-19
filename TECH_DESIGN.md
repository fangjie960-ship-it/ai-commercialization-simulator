# TECH_DESIGN - AI商业化策略模拟器技术设计

**版本：** v1.0  
**作者：** 方杰  
**创建日期：** 2026-04-02  
**关联文档：** PRD.md

---

## 1. 技术栈选择

### 1.1 总体选型原则

- **Vibe Coding 友好**：选主流框架，AI 生成代码质量有保障
- **部署成本低**：MVP 阶段零成本部署
- **开发速度快**：优先选 React 生态，组件库成熟，少造轮子

### 1.2 前端技术栈

| 技术 | 版本 | 用途 | 选型理由 |
|------|------|------|---------|
| **React** | 18.x | 核心框架 | 组件化，生态最成熟，Vibe Coding 生成质量最高 |
| **TypeScript** | 5.x | 类型安全 | 数据结构复杂（客户数据/策略参数），TS 能避免大量运行时错误 |
| **Vite** | 5.x | 构建工具 | 比 CRA 快 10 倍，开发体验好 |
| **Tailwind CSS** | 3.x | 样式 | 原子化 CSS，AI 生成样式代码准确率高 |
| **shadcn/ui** | latest | UI 组件库 | 基于 Tailwind，组件质量高，可直接用 |
| **Recharts** | 2.x | 数据可视化 | React 原生图表库，比 ECharts 更轻量，API 更友好 |
| **React Hook Form** | 7.x | 表单管理 | 性能好，校验逻辑清晰 |
| **Zustand** | 4.x | 状态管理 | 比 Redux 轻量，比 Context 灵活，MVP 阶段够用 |
| **Papa Parse** | 5.x | CSV 解析 | 最成熟的前端 CSV 解析库，支持流式解析 |
| **React Router** | 6.x | 路由管理 | 标准选择 |
| **date-fns** | 3.x | 日期处理 | 比 moment.js 轻量，计算剩余天数等 |

### 1.3 后端技术栈

> MVP 阶段：后端极简，只用来做 LLM API 代理（避免 Key 暴露在前端）

| 技术 | 版本 | 用途 | 选型理由 |
|------|------|------|---------|
| **Vercel Serverless Functions** | - | API 路由 / LLM 代理 | 零配置，与 Vercel 前端部署一体化，免费额度够 Demo 用 |
| **Node.js** | 20.x | 运行时 | Serverless Functions 默认运行时 |
| **OpenAI SDK** | 4.x | LLM 调用 | 兼容 OpenAI / DeepSeek / 月之暗面 API |

**为什么不用独立后端服务器？**  
MVP 阶段不需要。Vercel Functions 可以处理 LLM 代理请求，前端直接调用，不需要维护服务器。等 v1.1 需要数据库时再引入后端框架。

### 1.4 数据存储

| 阶段 | 方案 | 说明 |
|------|------|------|
| **MVP（v1.0）** | localStorage + IndexedDB | 数据存本地，零成本，无隐私顾虑；IndexedDB 存大数据（客户列表），localStorage 存配置 |
| **v1.1** | Supabase（PostgreSQL） | 免费额度慷慨，自带认证，支持实时订阅，部署简单 |

### 1.5 部署方案

| 环境 | 方案 | 域名 |
|------|------|------|
| 开发 | `vite dev` 本地 3000 端口 | localhost:3000 |
| 生产 | Vercel（GitHub 自动部署） | xxx.vercel.app |

---

## 2. 项目结构

```
ai-strategy-simulator/
├── public/
│   ├── favicon.ico
│   └── template.csv              # 客户数据导入模板
│
├── src/
│   ├── api/                      # API 调用层
│   │   ├── llm.ts                # LLM API 封装（策略推荐请求）
│   │   └── types.ts              # API 请求/响应类型定义
│   │
│   ├── components/               # 通用 UI 组件
│   │   ├── ui/                   # shadcn 基础组件（Button, Card, Table 等）
│   │   ├── charts/               # 图表组件
│   │   │   ├── ConsumptionTrendChart.tsx   # 消耗趋势折线图
│   │   │   ├── CustomerBubbleChart.tsx     # 客户分层气泡图
│   │   │   ├── ROICompareChart.tsx         # 多方案ROI对比图
│   │   │   └── DistributionPieChart.tsx    # 分层分布饼图
│   │   ├── CustomerTable.tsx     # 客户列表表格
│   │   ├── CustomerCard.tsx      # 客户信息卡片
│   │   ├── StrategyCard.tsx      # 策略推荐卡片
│   │   ├── ImportModal.tsx       # CSV 导入弹窗
│   │   └── Layout.tsx            # 页面布局（导航栏 + 侧边栏）
│   │
│   ├── pages/                    # 页面组件
│   │   ├── Dashboard.tsx         # 主仪表盘
│   │   ├── CustomerList.tsx      # 客户列表页
│   │   ├── CustomerDetail.tsx    # 客户详情页
│   │   ├── StrategyRecommend.tsx # 策略推荐页
│   │   └── ROISimulator.tsx      # ROI 模拟器页
│   │
│   ├── store/                    # Zustand 状态管理
│   │   ├── customerStore.ts      # 客户数据 store
│   │   ├── strategyStore.ts      # 策略方案 store
│   │   └── settingsStore.ts      # 全局配置 store
│   │
│   ├── utils/                    # 工具函数
│   │   ├── classification.ts     # 客户分层算法
│   │   ├── prediction.ts         # 消耗预测算法（线性回归）
│   │   ├── roi.ts                # ROI 计算函数
│   │   ├── csvParser.ts          # CSV 解析与校验
│   │   └── format.ts             # 数字/日期格式化
│   │
│   ├── config/                   # 配置文件（独立维护，方便调整）
│   │   ├── strategyLibrary.ts    # 策略库（策略类型、描述、适用场景）
│   │   ├── industryCoefficients.ts  # 行业系数配置
│   │   ├── classificationRules.ts  # 分层规则配置
│   │   └── prompts.ts            # LLM Prompt 模板
│   │
│   ├── types/                    # TypeScript 类型定义
│   │   ├── customer.ts           # 客户相关类型
│   │   ├── strategy.ts           # 策略相关类型
│   │   └── roi.ts                # ROI 相关类型
│   │
│   ├── hooks/                    # 自定义 React Hooks
│   │   ├── useCustomers.ts       # 客户数据操作 hooks
│   │   ├── useClassification.ts  # 分层计算 hooks
│   │   └── useStrategy.ts        # 策略推荐 hooks
│   │
│   ├── App.tsx                   # 根组件（路由配置）
│   └── main.tsx                  # 入口文件
│
├── api/                          # Vercel Serverless Functions
│   └── recommend.ts              # LLM 代理接口（/api/recommend）
│
├── .env.local                    # 本地环境变量（LLM API Key，不提交 git）
├── .env.example                  # 环境变量示例（提交 git）
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── vercel.json                   # Vercel 部署配置
├── PRD.md
├── TECH_DESIGN.md
└── AGENTS.md
```

---

## 3. 数据模型

### 3.1 客户数据（Customer）

```typescript
interface Customer {
  id: string;                          // UUID，自动生成
  name: string;                        // 客户名称
  industry: Industry;                  // 行业枚举
  contractAmount: number;              // 框架金额（万元）
  completedAmount: number;             // 已完成消耗（万元）
  monthlyTrend: number[];              // 近6个月月度消耗（万元）
  signDate: string;                    // 签约日期 YYYY-MM-DD
  expiryDate: string;                  // 框架到期日期 YYYY-MM-DD
  customerGrade?: 'A' | 'B' | 'C' | 'D';  // 客户等级（可选）
  notes?: string;                      // 备注
  createdAt: string;                   // 录入时间
  updatedAt: string;                   // 更新时间
}

type Industry = 'drama' | 'game' | 'ecommerce' | 'education' | 'other';
```

### 3.2 客户分析结果（CustomerAnalysis）

```typescript
interface CustomerAnalysis {
  customerId: string;
  completionRate: number;              // 当前完成率 0-1
  predictedCompletionRate: number;     // 预测最终完成率 0-1
  remainingDays: number;               // 距到期天数
  requiredDailyConsumption: number;    // 达成框架所需日均消耗（万元）
  currentDailyConsumption: number;     // 当前日均消耗（万元）
  trendSlope: number;                  // 消耗趋势斜率（正=增长，负=下降）
  predictionData: PredictionPoint[];   // 预测曲线数据点
  tier: CustomerTier;                  // 分层结果
  tierScore: number;                   // 综合评分 0-100
  riskLevel: 'low' | 'medium' | 'high';
}

type CustomerTier = 'high_potential' | 'stable' | 'warning' | 'high_risk';

interface PredictionPoint {
  month: string;                       // YYYY-MM
  amount: number;                      // 预测消耗（万元）
  isHistorical: boolean;               // true=历史，false=预测
  confidenceLow?: number;              // 预测下界
  confidenceHigh?: number;             // 预测上界
}
```

### 3.3 策略推荐（StrategyRecommendation）

```typescript
interface StrategyRecommendation {
  id: string;
  customerId: string;
  createdAt: string;
  roiConstraint: number;               // ROI 约束（最低可接受值）
  strategies: RecommendedStrategy[];   // 推荐策略列表（优先级排序）
  aiReasoning: string;                 // AI 推荐理由（自然语言）
  estimatedIncrementalConsumption: number;  // 预期增量消耗（万元）
  estimatedIncentiveCost: number;      // 预计激励成本（万元）
  estimatedROI: number;                // 预期 ROI
  estimatedCompletionRateImprovement: number;  // 预期完成率提升
}

interface RecommendedStrategy {
  type: StrategyType;
  priority: number;                    // 1=最优先
  description: string;
  parameters: StrategyParameters;
  expectedEffect: string;              // 预期效果描述
}

type StrategyType = 
  | 'deposit_exemption'        // 免扣保证金
  | 'short_term_incentive'     // 短期激励
  | 'tiered_incentive'         // 阶梯激励
  | 'exclusive_service'        // 专属服务
  | 'combo';                   // 组合策略

interface StrategyParameters {
  incentiveRate?: number;      // 返点比例 0-1
  incentiveDuration?: number;  // 激励时长（天）
  thresholds?: number[];       // 阶梯档位（万元）
  depositExemptionAmount?: number;  // 免扣保证金金额
}
```

### 3.4 ROI 方案对比（ROIScenario）

```typescript
interface ROIScenario {
  id: string;
  name: string;                        // 方案名称
  customerId: string;
  strategies: RecommendedStrategy[];
  incentiveCost: number;               // 激励成本（万元）
  incrementalConsumption: number;      // 增量消耗（万元）
  roi: number;                         // ROI
  completionRateChange: number;        // 完成率变化
  createdAt: string;
}
```

### 3.5 应用全局状态（AppState）

```typescript
interface AppState {
  customers: Customer[];
  analyses: Record<string, CustomerAnalysis>;    // customerId -> analysis
  recommendations: Record<string, StrategyRecommendation[]>;  // customerId -> recommendations
  scenarios: ROIScenario[];
  settings: {
    llmProvider: 'openai' | 'deepseek' | 'moonshot';
    defaultROIConstraint: number;
    industryCoefficients: Record<Industry, number>;
  };
}
```

---

## 4. 关键技术点

### 4.1 消耗预测算法

**方法：** 线性回归 + 季节性修正

```typescript
// 核心思路（在 src/utils/prediction.ts 实现）
function predictConsumption(
  historicalData: number[],    // 近6个月消耗
  remainingMonths: number,     // 剩余月数
  industry: Industry
): PredictionPoint[] {
  // 1. 线性回归拟合历史数据，得到趋势斜率
  const { slope, intercept } = linearRegression(historicalData);
  
  // 2. 基于趋势外推未来消耗
  const predictions = extrapolate(slope, intercept, remainingMonths);
  
  // 3. 乘以行业季节性系数（如短剧Q4消费旺季系数1.2）
  const adjusted = applyIndustryCoefficients(predictions, industry);
  
  // 4. 计算置信区间（±1个标准差）
  return withConfidenceInterval(adjusted, historicalData);
}
```

**注意事项：**
- 数据点 < 3 个时不做预测，提示"数据不足"
- 预测值不能为负数，设置下限为 0
- 置信区间随预测时长增加而扩大

### 4.2 客户分层算法

**方法：** 多维度加权评分

```typescript
// 在 src/utils/classification.ts 实现
function classifyCustomer(analysis: Partial<CustomerAnalysis>): CustomerTier {
  // 维度1：当前完成率（权重 40%）
  // 维度2：完成趋势斜率（权重 30%）
  // 维度3：剩余时间充裕度（权重 20%）
  // 维度4：行业基准完成率偏差（权重 10%）
  
  const score = 
    completionRateScore * 0.4 +
    trendScore * 0.3 +
    timeAdequacyScore * 0.2 +
    industryDeviationScore * 0.1;
  
  if (score >= 75) return 'high_potential';
  if (score >= 50) return 'stable';
  if (score >= 25) return 'warning';
  return 'high_risk';
}
```

**分层规则独立配置**（在 `src/config/classificationRules.ts`），方便后期调整阈值不改核心代码。

### 4.3 LLM 策略推荐

**架构：** 前端 → Vercel Serverless Function → LLM API

**Prompt 设计关键点（在 `src/config/prompts.ts` 维护）：**

```
System Prompt 包含：
1. 角色定义：资深商业化运营策略专家
2. 策略知识库：完整的策略类型说明、适用场景、效果描述
3. 输出格式规范：JSON Schema（强制结构化输出，避免 LLM 自由发挥）
4. 约束条件：ROI 不能低于输入的约束值

User Prompt 包含（脱敏处理）：
- 客户分层：{tier}
- 行业：{industry}
- 框架金额区间（脱敏为大/中/小体量）
- 当前完成率：{completionRate}%
- 预测完成率：{predictedRate}%
- 剩余天数：{remainingDays}
- ROI 约束：≥ {roiConstraint}
```

**关键实现：**
- 使用 `response_format: { type: 'json_object' }` 强制 JSON 输出
- 前端接收到 JSON 后二次校验格式，避免 LLM 返回不符合 Schema 的内容
- 超时设置 15 秒，超时给用户明确提示

**客户数据脱敏规则（重要）：**
- 客户名称 → 不发送，用 `客户ID_{tier}` 替代
- 框架金额 → 分桶处理（<500万="小体量"，500-2000万="中体量"，>2000万="大体量"）
- 月度消耗 → 只发趋势（增长/平稳/下降）+ 幅度，不发原始数值

### 4.4 数据持久化（MVP）

MVP 阶段使用 IndexedDB（通过 `idb` 库封装）：

```typescript
// src/store/customerStore.ts
// 客户数据在以下时机持久化：
// - 新增/编辑/删除客户时，立即同步到 IndexedDB
// - 应用启动时，从 IndexedDB 恢复数据到 Zustand store
// - 策略推荐结果同样持久化，避免重复请求 LLM
```

**为什么不用 localStorage？**  
客户数据可能较大（几十个客户 + 月度数据 + 分析结果），IndexedDB 没有 5MB 限制，更安全。

### 4.5 CSV 解析与校验

```typescript
// src/utils/csvParser.ts
// 校验流程：
// 1. Papa Parse 解析原始 CSV
// 2. 检查必填列是否存在（列名匹配模板）
// 3. 逐行校验：数值类型、日期格式、范围合理性
// 4. 返回：{ valid: ValidRow[], invalid: { row, errors }[] }
// 5. 前端展示：valid 行准备导入，invalid 行高亮显示错误原因
```

### 4.6 性能优化注意事项

- **大数据量渲染**：客户列表超过 100 条时，启用虚拟列表（`@tanstack/react-virtual`）
- **图表性能**：气泡图客户数量 > 200 时，考虑对 Recharts 做 memo 优化
- **LLM 请求**：加请求防抖，避免用户频繁点击导致重复请求；推荐结果本地缓存（相同输入 24 小时内不重复请求）
- **CSV 大文件**：Papa Parse 启用流式解析（worker 模式），避免阻塞主线程

---

## 5. 环境变量

```bash
# .env.local（本地开发，不提交 git）
VITE_LLM_API_KEY=sk-xxxxxxxx          # LLM API Key（仅服务端用，前端不能直接访问）
VITE_LLM_BASE_URL=https://api.deepseek.com  # API Base URL
VITE_LLM_MODEL=deepseek-chat          # 模型名称

# .env.example（提交 git，供参考）
VITE_LLM_API_KEY=your_api_key_here
VITE_LLM_BASE_URL=https://api.openai.com
VITE_LLM_MODEL=gpt-4o-mini
```

> **安全说明**：`VITE_` 前缀的变量会被 Vite 暴露在前端 bundle 中。LLM API Key 必须通过 Vercel Serverless Function 代理调用，不能直接在前端代码里使用。部署到 Vercel 后，在 Vercel 控制台的 Environment Variables 里配置，不要放在代码里。

---

## 6. 开发启动步骤

```bash
# 1. 创建项目
npm create vite@latest ai-strategy-simulator -- --template react-ts

# 2. 安装依赖
cd ai-strategy-simulator
npm install tailwindcss @tailwindcss/vite
npm install recharts zustand react-hook-form react-router-dom
npm install papaparse date-fns idb
npm install @types/papaparse
npm install openai  # 兼容 DeepSeek/月之暗面

# 3. 初始化 shadcn/ui
npx shadcn@latest init

# 4. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入 API Key

# 5. 启动开发服务器
npm run dev
```
