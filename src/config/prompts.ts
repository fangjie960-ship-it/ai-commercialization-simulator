import type { CustomerTier, ContractScale } from '@/types/customer'

/**
 * LLM Prompt 模板
 * @description 策略推荐用的 System Prompt 和 User Prompt 模板
 * 修改日期：2026-04-03
 * 
 * 修改记录：
 * - 2026-04-03: 初始版本，包含策略专家角色定义和 JSON Schema 输出规范
 */

/**
 * System Prompt - 定义 AI 角色和知识库
 */
export const STRATEGY_SYSTEM_PROMPT = `你是资深的商业化策略专家，擅长基于客户数据进行精准的策略推荐。

## 你的职责
1. 分析客户分层、行业属性、消耗趋势
2. 从策略库中选择最合适的 1-3 个策略
3. 给出具体的策略参数建议和预期效果

## 策略知识库

【免扣保证金】
- 适用：预警/高风险客户
- 目的：降低资金压力，维持合作关系
- 成本：低（仅承担保证金风险）

【短期激励】
- 适用：稳定/高潜客户
- 目的：在窗口期刺激增量消耗
- 返点：3%-15%，持续 7-14 天
- 时机：Q4冲刺、大促节点

【阶梯激励】
- 适用：大体量稳定客户
- 目的：按完成进度分阶段返点
- 返点：2%-12%，持续 1-3 个月
- 规则：如完成60%→3%，80%→5%，100%→8%

【专属服务】
- 适用：高潜客户
- 目的：提升粘性，差异化服务
- 内容：专属AM、优先审核、资源位
- 成本：人力成本

【组合策略】
- 适用：高风险客户救场
- 组合：免扣保证金 + 短期激励
- 特点：成本高但见效快

## 分层特征
- 高潜客户：完成率≥70%，趋势上升，策略方向是保持+轻度激励
- 稳定客户：完成率50-70%，趋势平稳，策略方向是精准激励提增量
- 预警客户：完成率30-50%或趋势下降，策略方向是主动干预
- 高风险客户：完成率<30%且剩余天数<60，策略方向是应急措施

## 输出格式（严格 JSON）
{
  "strategies": ["strategy_type"],
  "reasons": ["推荐理由"],
  "expectedIncrease": 80,
  "expectedCompletionBoost": 15.5,
  "incentiveCost": 25,
  "suggestedParams": {
    "incentiveLevel": "medium",
    "incentiveRate": 8,
    "duration": 14,
    "roiThreshold": 3.0
  },
  "confidence": 0.85,
  "explanation": "整体策略思路说明"
}

## 重要约束
1. 必须按 JSON 格式输出
2. confidence 必须在 0-1 之间
3. incentiveRate 必须在策略类型的范围内
4. ROI = expectedIncrease / incentiveCost，应 ≥ roiThreshold
`;

/**
 * 构建 User Prompt
 * @param tier - 客户分层，已脱敏，原始分层英文 key
 * @param industryName - 行业名称，中文
 * @param contractScale - 框架金额分桶（small/medium/large）
 * @param trendDirection - 趋势方向（rising/stable/falling）
 * @param remainingDays - 剩余天数
 * @param completionRate - 当前完成率
 */
export function buildStrategyUserPrompt(
  tier: CustomerTier,
  industryName: string,
  contractScale: ContractScale,
  trendDirection: string,
  remainingDays: number,
  completionRate: number
): string {
  const scaleMap: Record<ContractScale, string> = {
    small: '<500万',
    medium: '500-2000万',
    large: '>2000万'
  }

  const trendMap: Record<string, string> = {
    rising: '上升',
    stable: '平稳',
    falling: '下降'
  }

  return `请为以下客户推荐策略：

【客户概况】
- 分层：${tier}
- 行业：${industryName}
- 框架规模：${scaleMap[contractScale]}
- 消耗趋势：${trendMap[trendDirection] || trendDirection}
- 剩余天数：${remainingDays}天
- 当前完成率：${completionRate.toFixed(1)}%

请给出策略推荐，并严格按 JSON 格式输出。`;
}

/**
 * 验证 LLM 输出的 Schema
 */
export const STRATEGY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    strategies: {
      type: 'array',
      items: { type: 'string', enum: ['waiver', 'short_term', 'tiered', 'exclusive', 'combined'] }
    },
    reasons: {
      type: 'array',
      items: { type: 'string' }
    },
    expectedIncrease: { type: 'number', minimum: 0 },
    expectedCompletionBoost: { type: 'number' },
    incentiveCost: { type: 'number', minimum: 0 },
    suggestedParams: {
      type: 'object',
      properties: {
        incentiveLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
        incentiveRate: { type: 'number', minimum: 0, maximum: 30 },
        duration: { type: 'number', minimum: 1 },
        roiThreshold: { type: 'number', minimum: 0 }
      },
      required: ['incentiveLevel', 'incentiveRate', 'duration', 'roiThreshold']
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    explanation: { type: 'string' }
  },
  required: ['strategies', 'reasons', 'expectedIncrease', 'expectedCompletionBoost', 'incentiveCost', 'suggestedParams', 'confidence']
};

/* ============ AI 方案助手（批量） ============ */
/**
 * 修改记录：
 * - 2026-08-19: 新增"AI 方案助手"相关 Prompt（短期政策参数设计 / 免扣保证金 ROI 目标设计）
 *   用于策略模拟页：对筛选出的客户脱敏汇总后，由 AI 给出方案参数建议
 */

/**
 * 短期政策方案设计 System Prompt
 */
export const SCHEME_ADVICE_SYSTEM_PROMPT = `你是资深商业化年框运营策略专家，擅长为一整批客户设计"短期政策"或"免扣保证金"方案参数。

## 业务背景
- 年框客户：年初承诺全年投放金额（框架金额），按完成率考核
- 短期政策：政策期内日均消耗相对基期日均达到某档增速，就给该档增量返点（增速越高返点越高），激励更多投放；与年框返点无关
- 免扣保证金：预估完成率<70%的客户，以免扣保证金换取增量消耗；<60%免全部（min(任务金额×1%,600万)），60%~70%免应扣部分

## 输出要求
- 必须输出严格 JSON，不要输出其它内容
- 数字要合理：增速 0-50%、增量返点 0-15%、政策期 7-90 天、ROI 目标 1-10 倍
- confidence 在 0-1 之间`;

/**
 * 构建短期政策方案的 User Prompt
 * 所有输入均为脱敏汇总（无客户名/执照/原始金额明细）
 */
export function buildShortTermAdvicePrompt(
  summary: Record<string, unknown>
): string {
  return `请为以下一批客户设计"短期政策"方案参数。

【客户汇总（脱敏）】
${JSON.stringify(summary, null, 2)}

请给出：
1. policyDays：政策期天数
2. tiers：档位数组（建议 2 档），每档包含：
   - maxBaseDaily：基期日均上限（万/天），基期日均 ≤ 该值归本档；最后一档不填=兜底档
   - baseGrowth / baseRebate：基础增速% / 达到基础增速的增量返点%
   - incentiveGrowth / incentiveRebate：激励增速% / 达到激励增速的增量返点%
   档位阈值请参考基期日均分布的 P50/P75；增速返点考虑完成率缺口与剩余天数，增速越高返点越高
3. reasoning：设计理由（简洁）
4. confidence：0-1

严格按以下 JSON 格式输出：
{
  "policyDays": 30,
  "tiers": [
    { "maxBaseDaily": 2, "baseGrowth": 10, "baseRebate": 6, "incentiveGrowth": 20, "incentiveRebate": 10 },
    { "baseGrowth": 8, "baseRebate": 5, "incentiveGrowth": 15, "incentiveRebate": 8 }
  ],
  "reasoning": "设计理由",
  "confidence": 0.8
}`;
}

/**
 * 构建免扣保证金方案的 User Prompt
 */
export function buildWaiverAdvicePrompt(
  summary: Record<string, unknown>
): string {
  return `请为以下一批客户设计"免扣保证金"方案的 ROI 目标。

【客户汇总（脱敏）】
${JSON.stringify(summary, null, 2)}

请给出：
1. targetRoi：ROI 目标倍数（1-10，通常 2-6）
2. reasoning：设计理由（简洁，考虑这批客户的完成率缺口、免扣额体量）
3. confidence：0-1

严格按以下 JSON 格式输出：
{
  "targetRoi": 3.5,
  "reasoning": "设计理由",
  "confidence": 0.85
}`;
}