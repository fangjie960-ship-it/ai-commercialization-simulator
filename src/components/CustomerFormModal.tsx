import { useEffect, useState } from 'react'
import { X, UserPlus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomerStore } from '@/store/customerStore'
import type { Customer, Industry } from '@/types/customer'

interface CustomerFormModalProps {
  open: boolean
  customer?: Customer | null // 传入则进入编辑模式
  onClose: () => void
}

const INDUSTRY_OPTIONS: { value: Industry; label: string }[] = [
  { value: 'drama', label: '短剧' },
  { value: 'game', label: '游戏' },
  { value: 'ecommerce', label: '电商' },
  { value: 'education', label: '教育' },
  { value: 'other', label: '其他' },
]

interface FormState {
  name: string
  businessLicense: string
  industry: Industry
  contractAmount: string
  completedAmount: string
  monthlyTrend: string[]
  contractDate: string
  expireDate: string
  grade: string
  remark: string
}

const EMPTY_FORM: FormState = {
  name: '',
  businessLicense: '',
  industry: 'drama',
  contractAmount: '',
  completedAmount: '',
  monthlyTrend: ['', '', '', '', '', ''],
  contractDate: '',
  expireDate: '',
  grade: '',
  remark: '',
}

/** 从客户对象预填表单（编辑模式） */
function toForm(c: Customer): FormState {
  return {
    name: c.name,
    businessLicense: c.businessLicense,
    industry: c.industry,
    contractAmount: String(c.contractAmount),
    completedAmount: String(c.completedAmount),
    monthlyTrend: c.monthlyTrend.length === 6 ? c.monthlyTrend.map(String) : ['', '', '', '', '', ''],
    contractDate: c.contractDate,
    expireDate: c.expireDate,
    grade: c.grade || '',
    remark: c.remark || '',
  }
}

/**
 * 客户录入/编辑表单
 * 新增与编辑共用：传入 customer 即为编辑模式
 */
export function CustomerFormModal({ open, customer, onClose }: CustomerFormModalProps) {
  const { addCustomer, updateCustomer, customers } = useCustomerStore()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // 打开时按模式预填：编辑=客户数据，新增=空表单
  useEffect(() => {
    if (!open) return
    setForm(customer ? toForm(customer) : EMPTY_FORM)
    setErrors([])
  }, [open, customer])

  if (!open) return null

  const setField = (key: keyof FormState, value: string | string[]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const validate = (): string[] => {
    const errs: string[] = []

    if (!form.name.trim()) errs.push('客户名称不能为空')
    if (!form.businessLicense.trim()) errs.push('营业执照不能为空')
    // 编辑时排除自身，允许保留原执照
    if (customers.some(c => c.businessLicense === form.businessLicense.trim() && c.id !== customer?.id)) {
      errs.push(`营业执照 ${form.businessLicense.trim()} 已存在，请勿重复录入`)
    }

    const contractAmount = parseFloat(form.contractAmount)
    if (isNaN(contractAmount) || contractAmount <= 0) errs.push('框架金额必须是大于 0 的数字（万元）')

    const completedAmount = parseFloat(form.completedAmount)
    if (isNaN(completedAmount) || completedAmount < 0) errs.push('已完成消耗必须是大于等于 0 的数字（万元）')
    if (!isNaN(contractAmount) && !isNaN(completedAmount) && completedAmount > contractAmount) {
      errs.push('已完成消耗不能超过框架金额')
    }

    const trend = form.monthlyTrend.map(v => parseFloat(v))
    if (trend.some(v => isNaN(v))) errs.push('月度消耗趋势必须填满 6 个月的数值')
    if (trend.some(v => v < 0)) errs.push('月度消耗趋势不能为负数')

    if (!form.contractDate) errs.push('签约日期不能为空')
    if (!form.expireDate) errs.push('到期日期不能为空')
    if (form.contractDate && form.expireDate && form.expireDate <= form.contractDate) {
      errs.push('到期日期必须晚于签约日期')
    }

    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    setErrors(errs)
    if (errs.length > 0) return

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        businessLicense: form.businessLicense.trim(),
        industry: form.industry,
        contractAmount: parseFloat(form.contractAmount),
        completedAmount: parseFloat(form.completedAmount),
        monthlyTrend: form.monthlyTrend.map(v => parseFloat(v)),
        contractDate: form.contractDate,
        expireDate: form.expireDate,
        grade: (form.grade || undefined) as 'A' | 'B' | 'C' | 'D' | undefined,
        remark: form.remark.trim() || undefined,
      }
      if (customer) {
        await updateCustomer(customer.id, payload)
        toast.success('客户已更新')
      } else {
        await addCustomer({ ...payload, dailySpend: [] })
        toast.success('客户已新增')
      }
      setErrors([])
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[640px] max-h-[90vh] overflow-auto border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            {customer ? <Pencil className="w-5 h-5 text-blue-600" /> : <UserPlus className="w-5 h-5 text-blue-600" />}
            {customer ? '编辑客户' : '新增客户'}
          </h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="客户名称 *">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                placeholder="如：剧好看传媒"
              />
            </FormField>
            <FormField label="营业执照（唯一标识）*">
              <input
                type="text"
                value={form.businessLicense}
                onChange={(e) => setField('businessLicense', e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                placeholder="统一社会信用代码 18 位"
              />
            </FormField>

            <FormField label="行业 *">
              <select
                value={form.industry}
                onChange={(e) => setField('industry', e.target.value as Industry)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
              >
                {INDUSTRY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="客户等级（可选）">
              <select
                value={form.grade}
                onChange={(e) => setField('grade', e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
              >
                <option value="">未设置</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </FormField>

            <FormField label="框架金额（万元）*">
              <input
                type="number"
                min="0"
                value={form.contractAmount}
                onChange={(e) => setField('contractAmount', e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                placeholder="如：500"
              />
            </FormField>
            <FormField label="已完成消耗（万元）*">
              <input
                type="number"
                min="0"
                value={form.completedAmount}
                onChange={(e) => setField('completedAmount', e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                placeholder="如：200"
              />
            </FormField>

            <FormField label="签约日期 *">
              <input
                type="date"
                value={form.contractDate}
                onChange={(e) => setField('contractDate', e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
              />
            </FormField>
            <FormField label="到期日期 *">
              <input
                type="date"
                value={form.expireDate}
                onChange={(e) => setField('expireDate', e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
              />
            </FormField>
          </div>

          <FormField label="月度消耗趋势（近 6 个月，万元，从左到右为旧到新）*">
            <div className="flex gap-2">
              {form.monthlyTrend.map((v, i) => (
                <input
                  key={i}
                  type="number"
                  min="0"
                  value={v}
                  onChange={(e) => {
                    const next = [...form.monthlyTrend]
                    next[i] = e.target.value
                    setField('monthlyTrend', next)
                  }}
                  className="w-full px-2 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500 text-center"
                  placeholder={`M${i + 1}`}
                />
              ))}
            </div>
          </FormField>

          <FormField label="备注（可选）">
            <textarea
              value={form.remark}
              onChange={(e) => setField('remark', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
              placeholder="客户背景、合作注意事项等"
            />
          </FormField>

          {errors.length > 0 && (
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-red-500 mb-1">• {err}</p>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-500 hover:text-gray-900 transition-colors text-sm"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
            >
              {saving ? '保存中...' : '保存客户'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}