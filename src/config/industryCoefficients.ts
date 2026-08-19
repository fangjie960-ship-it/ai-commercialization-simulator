import type { Industry } from '@/types/customer'

/**
 * 行业系数配置
 * @description 各行业的季节性系数和基准评分系数
 * 修改日期：2026-04-03
 */

export interface IndustryConfig {
  name: string
  score: number // 行业基准评分 0-10
  seasonality: {
    q1: number // 第一季度系数
    q2: number
    q3: number
    q4: number
  }
  description: string
}

export const INDUSTRY_CONFIG: Record<Industry, IndustryConfig> = {
  drama: {
    name: '短剧',
    score: 8,
    seasonality: {
      q1: 0.9,
      q2: 1.0,
      q3: 1.0,
      q4: 1.3 // Q4 短剧旺季
    },
    description: '短剧行业，Q4旺季系数上调'
  },
  game: {
    name: '游戏',
    score: 7,
    seasonality: {
      q1: 0.8,
      q2: 1.1, // 暑期档
      q3: 1.0,
      q4: 1.1 // 年末冲量
    },
    description: '游戏行业，暑期和年末为旺季'
  },
  ecommerce: {
    name: '电商',
    score: 6,
    seasonality: {
      q1: 0.8,
      q2: 1.0,
      q3: 0.9,
      q4: 1.4 // Q4 电商大促
    },
    description: '电商行业，Q4大促旺季'
  },
  education: {
    name: '教育',
    score: 5,
    seasonality: {
      q1: 1.2, // 开学季
      q2: 0.9,
      q3: 1.1, // 开学季
      q4: 0.8
    },
    description: '教育行业，开学季为旺季'
  },
  other: {
    name: '其他',
    score: 5,
    seasonality: {
      q1: 1.0,
      q2: 1.0,
      q3: 1.0,
      q4: 1.0
    },
    description: '其他行业，无特殊季节性'
  }
}

/**
 * 获取行业名称
 */
export function getIndustryName(industry: Industry): string {
  return INDUSTRY_CONFIG[industry].name
}

/**
 * 获取当前季度的季节性系数
 */
export function getCurrentSeasonality(industry: Industry): number {
  const quarter = Math.floor((new Date().getMonth()) / 3) + 1
  const key = `q${quarter}` as keyof typeof INDUSTRY_CONFIG[Industry]['seasonality']
  return INDUSTRY_CONFIG[industry].seasonality[key]
}

/**
 * 获取行业基准评分
 */
export function getIndustryScore(industry: Industry): number {
  return INDUSTRY_CONFIG[industry].score
}
