import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Customer, CustomerAnalysis, Policy, StrategyRecommendation, FilterState, DashboardStats, CalculationConfigState, IndustryCalculationConfig, Industry } from '@/types/customer'
import { analyzeAllCustomers, analyzeCustomer, setCalculationConfig } from '@/utils/classification'
import { saveCustomersToDB, getAllCustomersFromDB, deleteCustomerFromDB, saveRecommendationToDB, savePoliciesToDB, getAllPoliciesFromDB } from '@/utils/indexedDB'
import type { AggregatedSpendRow } from '@/utils/spendParser'

interface CustomerState {
  customers: Customer[]
  analyses: Record<string, CustomerAnalysis>
  recommendations: Record<string, StrategyRecommendation>
  policies: Record<string, Policy> // 客户政策（按 customerId 索引，取最新）
  filter: FilterState
  calculationConfig: CalculationConfigState
  isLoading: boolean
  currentPage: 'dashboard' | 'customers' | 'strategy' | 'daily_trend' | 'customer_detail' | 'policy_review'
  selectedCustomerId: string | null
  
  // Actions
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>
  deleteCustomer: (id: string) => Promise<void>
  importCustomers: (customers: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>[]) => Promise<void>
  importDailySpend: (rows: AggregatedSpendRow[], overwrite: 'replace' | 'skip' | 'merge') => Promise<{ importedCustomers: number; importedDays: number }>
  setFilter: (filter: Partial<FilterState>) => void
  setCalculationConfig: (config: Partial<CalculationConfigState>) => void
  setIndustryCalculationConfig: (industry: Industry, config: IndustryCalculationConfig) => void
  setAllIndustriesCalculationConfig: (configs: Record<string, IndustryCalculationConfig>) => void
  resetFilter: () => void
  setPage: (page: 'dashboard' | 'customers' | 'strategy' | 'daily_trend' | 'customer_detail' | 'policy_review') => void
  applyPolicy: (policy: Policy) => Promise<void>
  setSelectedCustomer: (id: string | null) => void
  loadCustomers: () => Promise<void>
  saveRecommendation: (recommendation: StrategyRecommendation) => Promise<void>
  recalculateAll: () => void
  
  // Computed
  getFilteredCustomers: () => Customer[]
  getDashboardStats: () => DashboardStats
  getHighRiskCustomers: () => Customer[]
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set, get) => ({
      customers: [],
      analyses: {},
      recommendations: {},
      policies: {},
      filter: {
        industry: 'all',
        estimatedAction: 'all',
        completionRateMin: 0,
        completionRateMax: 200,  // 改为200以支持>100%的完成率
        searchQuery: ''
      },
      calculationConfig: {
        defaultModel: 'average',
        industryConfigs: {
          drama: { model: 'average', useDefault: true },
          game: { model: 'average', useDefault: true },
          ecommerce: { model: 'average', useDefault: true },
          education: { model: 'average', useDefault: true },
          other: { model: 'average', useDefault: true }
        }
      },
      isLoading: false,
      currentPage: 'dashboard',
      selectedCustomerId: null,
      
      addCustomer: async (customer) => {
        const now = Date.now()
        const newCustomer: Customer = {
          ...customer,
          id: `cust_${now}`,
          createdAt: now,
          updatedAt: now
        }
        
        set(state => ({
          customers: [...state.customers, newCustomer],
          analyses: {
            ...state.analyses,
            [newCustomer.id]: analyzeCustomer(newCustomer)
          }
        }))
        
        await saveCustomersToDB([newCustomer])
      },
      
      updateCustomer: async (id, updates) => {
        const updatedCustomers = get().customers.map(c =>
          c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
        )
        const updatedCustomer = updatedCustomers.find(c => c.id === id)
        
        set(state => ({
          customers: updatedCustomers,
          analyses: updatedCustomer ? {
            ...state.analyses,
            [id]: analyzeCustomer(updatedCustomer)
          } : state.analyses
        }))
        
        if (updatedCustomer) {
          await saveCustomersToDB([updatedCustomer])
        }
      },
      
      deleteCustomer: async (id) => {
        set(state => ({
          customers: state.customers.filter(c => c.id !== id),
          analyses: Object.fromEntries(
            Object.entries(state.analyses).filter(([key]) => key !== id)
          )
        }))
        await deleteCustomerFromDB(id)
      },
      
      importCustomers: async (customers) => {
        const now = Date.now()
        const { customers: existingCustomers } = get()
        const existingByLicense = new Map(existingCustomers.map(c => [c.businessLicense, c]))

        const toSave: Customer[] = []
        const updatedAnalyses: Record<string, CustomerAnalysis> = {}

        customers.forEach((incoming, i) => {
          const existing = incoming.businessLicense ? existingByLicense.get(incoming.businessLicense) : undefined
          if (existing) {
            // 按营业执照 upsert：合并字段，保留 id / createdAt / 已导入的每日流水
            const merged: Customer = {
              ...existing,
              ...incoming,
              id: existing.id,
              createdAt: existing.createdAt,
              updatedAt: now,
              dailySpend: incoming.dailySpend && incoming.dailySpend.length > 0 ? incoming.dailySpend : existing.dailySpend,
            }
            toSave.push(merged)
            updatedAnalyses[merged.id] = analyzeCustomer(merged)
          } else {
            const created: Customer = {
              ...incoming,
              id: `cust_${now}_${i}`,
              createdAt: now,
              updatedAt: now,
            }
            toSave.push(created)
            updatedAnalyses[created.id] = analyzeCustomer(created)
          }
        })

        const saveIds = new Set(toSave.map(c => c.id))
        set(state => ({
          customers: [...state.customers.filter(c => !saveIds.has(c.id)), ...toSave],
          analyses: { ...state.analyses, ...updatedAnalyses },
        }))

        await saveCustomersToDB(toSave)
      },

      // 消耗流水导入：只更新主数据中已存在的客户（按营业执照匹配），不新建客户
      importDailySpend: async (rows, overwrite) => {
        const { customers } = get()
        const byLicense = new Map(customers.map(c => [c.businessLicense, c]))
        const updatedCustomers: Customer[] = []
        let importedCustomers = 0
        let importedDays = 0

        rows.forEach(row => {
          const customer = byLicense.get(row.license)
          if (!customer) return

          const existingIndex = customer.dailySpend.findIndex(d => d.date === row.date)
          const updated: Customer = { ...customer, dailySpend: [...customer.dailySpend] }

          if (existingIndex >= 0) {
            if (overwrite === 'skip') return
            const existing = updated.dailySpend[existingIndex]
            if (overwrite === 'replace') {
              // 覆盖当日：以本次导入为准（处理数据回刷修正）
              updated.dailySpend[existingIndex] = { ...existing, amount: row.amount }
            } else {
              // 累加当日：同一客户同一天多条合并
              updated.dailySpend[existingIndex] = {
                ...existing,
                amount: parseFloat((existing.amount + row.amount).toFixed(2)),
              }
            }
            importedDays++
          } else {
            updated.dailySpend.push({
              date: row.date,
              amount: row.amount,
              targetAmount: 0,
              rebateRate: 0,
              predictedAction: 'maintain',
            })
            importedDays++
          }

          // 按日期升序，保证 DailyTrend / 剩余天数计算基于有序数据
          updated.dailySpend.sort((a, b) => a.date.localeCompare(b.date))
          updated.updatedAt = Date.now()
          updatedCustomers.push(updated)
          importedCustomers++
        })

        if (updatedCustomers.length === 0) {
          return { importedCustomers: 0, importedDays: 0 }
        }

        const updatedIds = new Set(updatedCustomers.map(c => c.id))
        const newAnalyses = analyzeAllCustomers(updatedCustomers)

        set(state => ({
          customers: [...state.customers.filter(c => !updatedIds.has(c.id)), ...updatedCustomers],
          analyses: { ...state.analyses, ...newAnalyses },
        }))

        await saveCustomersToDB(updatedCustomers)
        return { importedCustomers, importedDays }
      },
      
      setFilter: (filter) => {
        set(state => ({
          filter: { ...state.filter, ...filter }
        }))
      },
      
      setCalculationConfig: (config) => {
        set(state => {
          const newConfig = { ...state.calculationConfig, ...config }
          // 更新 classification.ts 的全局配置
          setCalculationConfig(newConfig.industryConfigs)
          return { calculationConfig: newConfig }
        })
      },
      
      setIndustryCalculationConfig: (industry, config) => {
        let newIndustryConfigs: Record<string, IndustryCalculationConfig> = {}
        set(state => {
          newIndustryConfigs = {
            ...state.calculationConfig.industryConfigs,
            [industry]: config
          }
          const newConfig = {
            ...state.calculationConfig,
            industryConfigs: newIndustryConfigs
          }
          // 更新 classification.ts 的全局配置
          setCalculationConfig(newIndustryConfigs)
          return { calculationConfig: newConfig }
        })
        // 重新计算所有客户分析，传入更新后的配置
        const { customers } = get()
        const newAnalyses = analyzeAllCustomers(customers, newIndustryConfigs)
        set({ analyses: newAnalyses })
      },

      setAllIndustriesCalculationConfig: (configs) => {
        set(state => {
          const newConfig = {
            ...state.calculationConfig,
            industryConfigs: configs
          }
          // 更新 classification.ts 的全局配置
          setCalculationConfig(configs)
          return { calculationConfig: newConfig }
        })
        // 重新计算所有客户分析
        const { customers } = get()
        const newAnalyses = analyzeAllCustomers(customers, configs)
        set({ analyses: newAnalyses })
      },

      resetFilter: () => {
        set({
          filter: {
            industry: 'all',
            estimatedAction: 'all',
            completionRateMin: 0,
            completionRateMax: 200,
            searchQuery: ''
          }
        })
      },
      
      recalculateAll: () => {
        const { customers, calculationConfig } = get()
        // 使用当前配置重新计算所有客户
        const newAnalyses = analyzeAllCustomers(customers, calculationConfig.industryConfigs)
        set({ analyses: newAnalyses })
      },
      
      setPage: (page) => {
        set({ currentPage: page })
      },
      
      setSelectedCustomer: (id) => {
        set({ selectedCustomerId: id })
      },
      
      loadCustomers: async () => {
        set({ isLoading: true })
        try {
          const customers = await getAllCustomersFromDB()
          const policies = await getAllPoliciesFromDB()
          const analyses = analyzeAllCustomers(customers)
          set({
            customers,
            analyses,
            policies: Object.fromEntries(policies.map(p => [p.customerId, p]))
          })
        } finally {
          set({ isLoading: false })
        }
      },
      
      saveRecommendation: async (recommendation) => {
        set(state => ({
          recommendations: {
            ...state.recommendations,
            [recommendation.customerId]: recommendation
          }
        }))
        await saveRecommendationToDB(recommendation)
      },
      // 执行政策：挂到客户上（同客户重复执行时覆盖为最新），并持久化
      applyPolicy: async (policy) => {
        set(state => ({
          policies: {
            ...state.policies,
            [policy.customerId]: policy
          }
        }))
        await savePoliciesToDB([policy])
      },
      
      getFilteredCustomers: () => {
        const { customers, analyses, filter } = get()
        return customers.filter(c => {
          const analysis = analyses[c.id]
          
          if (filter.industry !== 'all' && c.industry !== filter.industry) return false
          
          // 根据预估动作筛选（基于完成率）
          if (filter.estimatedAction !== 'all' && analysis) {
            const rate = analysis.completionRate
            let action: string
            if (rate >= 120) {
              action = 'upgrade'  // 可能升框
            } else if (rate > 80) {
              action = 'complete'  // 努力完框
            } else if (rate < 50) {
              action = 'abandon'  // 可能弃框
            } else {
              action = 'downgrade'  // 可能降档位
            }
            if (action !== filter.estimatedAction) return false
          }
          
          if (filter.searchQuery && 
              !c.name.toLowerCase().includes(filter.searchQuery.toLowerCase()) &&
              !c.businessLicense?.toLowerCase().includes(filter.searchQuery.toLowerCase())) return false
          
          if (analysis) {
            if (analysis.completionRate < filter.completionRateMin) return false
            if (analysis.completionRate > filter.completionRateMax) return false
          }
          
          return true
        })
      },
      
      getDashboardStats: () => {
        const { customers, analyses } = get()
        
        const stats: DashboardStats = {
          totalCustomers: customers.length,
          highRiskCount: 0,
          warningCount: 0,
          averageCompletionRate: 0,
          totalContractAmount: customers.reduce((sum, c) => sum + c.contractAmount, 0),
          tierDistribution: {
            high_potential: 0,
            stable: 0,
            warning: 0,
            high_risk: 0
          }
        }
        
        let totalCompletionRate = 0
        
        customers.forEach(c => {
          const analysis = analyses[c.id]
          if (analysis) {
            stats.tierDistribution[analysis.tier]++
            totalCompletionRate += analysis.currentCompletionRate
            
            if (analysis.tier === 'high_risk') stats.highRiskCount++
            if (analysis.tier === 'warning') stats.warningCount++
          }
        })
        
        stats.averageCompletionRate = customers.length > 0
          ? parseFloat((totalCompletionRate / customers.length).toFixed(1))
          : 0
        
        return stats
      },
      
      getHighRiskCustomers: () => {
        const { customers, analyses } = get()
        return customers
          .filter(c => analyses[c.id]?.tier === 'high_risk')
          .sort((a, b) => {
            const aDays = analyses[a.id]?.remainingDays ?? Infinity
            const bDays = analyses[b.id]?.remainingDays ?? Infinity
            return aDays - bDays
          })
          .slice(0, 5)
      }
    }),
    {
      name: 'customer-store',
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = (persistedState || {}) as Record<string, unknown>
        // 强制重置 filter 以修复 completionRateMax 问题
        return {
          ...state,
          filter: {
            industry: 'all',
            estimatedAction: 'all',
            completionRateMin: 0,
            completionRateMax: 200,
            searchQuery: ''
          }
        }
      },
      partialize: (state) => ({ 
        filter: state.filter,
        currentPage: state.currentPage,
        selectedCustomerId: state.selectedCustomerId
      })
    }
  )
)
