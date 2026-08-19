import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Customer, Policy, StrategyRecommendation } from '@/types/customer'

/**
 * IndexedDB 数据库配置
 * @description 使用 idb 库封装 IndexedDB 操作
 * 修改日期：2026-04-03
 */

/**
 * 数据库 Schema 定义
 */
interface CustomerDB extends DBSchema {
  customers: {
    key: string
    value: Customer
    indexes: {
      'by-industry': string
      'by-tier': string
    }
  }
  recommendations: {
    key: string
    value: StrategyRecommendation & { savedAt: number }
  }
  policies: {
    key: string
    value: Policy
  }
}

const DB_NAME = 'ai-commercialization-db'
const DB_VERSION = 3  // v3 新增 policies 表（客户政策）

/**
 * 获取数据库实例
 */
async function getDB(): Promise<IDBPDatabase<CustomerDB>> {
  return openDB<CustomerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 客户表
      if (!db.objectStoreNames.contains('customers')) {
        const customerStore = db.createObjectStore('customers', { keyPath: 'id' })
        customerStore.createIndex('by-industry', 'industry')
        // tier 不直接存储在 customer 中，而是存在 analysis 中
      }

      // 推荐策略表
      if (!db.objectStoreNames.contains('recommendations')) {
        db.createObjectStore('recommendations', { keyPath: 'customerId' })
      }

      // 客户政策表
      if (!db.objectStoreNames.contains('policies')) {
        db.createObjectStore('policies', { keyPath: 'id' })
      }
    }
  })
}

/**
 * 保存客户数据
 */
export async function saveCustomersToDB(customers: Customer[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('customers', 'readwrite')
  const store = tx.objectStore('customers')

  for (const customer of customers) {
    await store.put(customer)
  }

  await tx.done
}

/**
 * 获取所有客户
 */
export async function getAllCustomersFromDB(): Promise<Customer[]> {
  const db = await getDB()
  return db.getAll('customers')
}

/**
 * 删除客户
 */
export async function deleteCustomerFromDB(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('customers', id)
}

/**
 * 清空所有客户数据
 */
export async function clearAllCustomersFromDB(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('customers', 'readwrite')
  await tx.objectStore('customers').clear()
  await tx.done
}

/**
 * 保存策略推荐
 */
export async function saveRecommendationToDB(
  recommendation: StrategyRecommendation
): Promise<void> {
  const db = await getDB()
  await db.put('recommendations', {
    ...recommendation,
    savedAt: Date.now()
  })
}

/**
 * 获取策略推荐
 */
export async function getRecommendationFromDB(
  customerId: string
): Promise<(StrategyRecommendation & { savedAt: number }) | undefined> {
  const db = await getDB()
  return db.get('recommendations', customerId)
}

/**
 * 导出数据库状态（用于调试）
 */
export async function exportDBState(): Promise<{
  customers: Customer[]
  recommendations: Array<StrategyRecommendation & { savedAt: number }>
}> {
  const db = await getDB()
  return {
    customers: await db.getAll('customers'),
    recommendations: await db.getAll('recommendations')
  }
}


/**
 * 保存客户政策（按 id upsert）
 */
export async function savePoliciesToDB(policies: Policy[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('policies', 'readwrite')
  const store = tx.objectStore('policies')
  for (const policy of policies) {
    await store.put(policy)
  }
  await tx.done
}

/**
 * 获取所有客户政策
 */
export async function getAllPoliciesFromDB(): Promise<Policy[]> {
  const db = await getDB()
  return db.getAll('policies')
}