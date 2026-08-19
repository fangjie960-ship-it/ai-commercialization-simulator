import { useMemo, useState } from 'react'
import { X, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { useCustomerStore } from '@/store/customerStore'
import { parseCSV, downloadCSVTemplate, type ParseError } from '@/utils/csvParser'
import {
  parseSpendCSV,
  guessSpendMapping,
  SPEND_COLUMN_ALIASES,
  type SpendColumnMapping,
  type SpendParseResult,
} from '@/utils/spendParser'

interface ImportModalProps {
  open: boolean
  onClose: () => void
}

type ImportTab = 'customers' | 'spend'
type SpendStep = 'mapping' | 'preview' | 'done'
type OverwriteMode = 'replace' | 'skip' | 'merge'

const OVERWRITE_OPTIONS: { value: OverwriteMode; label: string; desc: string }[] = [
  { value: 'replace', label: '覆盖当日', desc: '以本次导入为准（推荐，处理数据回刷修正）' },
  { value: 'skip', label: '跳过已存在', desc: '已有数据的日期不更新' },
  { value: 'merge', label: '累加当日', desc: '同一客户同一天多条累加' },
]

/**
 * 导入中心
 * 两个入口：
 * 1. 客户主数据导入（CSV，按营业执照 upsert，可分步灌入）
 * 2. 消耗流水导入（列映射 → 聚合预览 → 确认，支持真实 SQL 拉数的字段差异）
 */
export function ImportModal({ open, onClose }: ImportModalProps) {
  const { importCustomers, importDailySpend, customers } = useCustomerStore()
  const [tab, setTab] = useState<ImportTab>('customers')

  // ---- 客户主数据 tab ----
  const [parseErrors, setParseErrors] = useState<ParseError[]>([])
  const [importSummary, setImportSummary] = useState<string | null>(null)

  // ---- 消耗流水 tab ----
  const [spendStep, setSpendStep] = useState<SpendStep>('mapping')
  const [spendFile, setSpendFile] = useState<File | null>(null)
  const [spendHeaders, setSpendHeaders] = useState<string[]>([])
  const [spendMapping, setSpendMapping] = useState<SpendColumnMapping>({ date: '', license: '', amount: '' })
  const [spendPreview, setSpendPreview] = useState<SpendParseResult | null>(null)
  const [overwrite, setOverwrite] = useState<OverwriteMode>('replace')
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState<{ importedCustomers: number; importedDays: number } | null>(null)

  const knownLicenses = useMemo(() => new Set(customers.map(c => c.businessLicense)), [customers])

  if (!open) return null

  // ---------- 客户主数据导入 ----------
  const handleCustomerFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setParseErrors([])
    setImportSummary(null)

    const result = await parseCSV(file)
    setParseErrors(result.errors)

    if (result.customers.length > 0) {
      await importCustomers(result.customers)
      setImportSummary(`成功导入 ${result.successCount} 条，失败 ${result.errors.length} 条（按营业执照 upsert）`)
      toast.success(`客户主数据导入完成：成功 ${result.successCount} 条，失败 ${result.errors.length} 条`)
    } else {
      setImportSummary(`没有可导入的数据，失败 ${result.errors.length} 条`)
    }
  }

  // ---------- 消耗流水导入 ----------
  const handleSpendFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 读取表头用于列映射
    const headers = await readCSVHeaders(file)
    setSpendFile(file)
    setSpendHeaders(headers)
    setSpendMapping(guessSpendMapping(headers))
    setSpendPreview(null)
    setDone(null)
    setSpendStep('mapping')
  }

  const goPreview = async () => {
    if (!spendFile) return
    setImporting(true)
    try {
      const preview = await parseSpendCSV(spendFile, spendMapping, knownLicenses)
      setSpendPreview(preview)
      setSpendStep('preview')
    } finally {
      setImporting(false)
    }
  }

  const confirmImport = async () => {
    if (!spendPreview) return
    setImporting(true)
    try {
      // 只导入主数据中已存在的客户（未匹配的执照跳过并在预览中提示）
      const matchedRows = spendPreview.aggregatedRows.filter(r => knownLicenses.has(r.license))
      const res = await importDailySpend(matchedRows, overwrite)
      setDone({ importedCustomers: res.importedCustomers, importedDays: res.importedDays })
      toast.success(`消耗流水导入完成：更新 ${res.importedCustomers} 个客户 / ${res.importedDays} 天`)
      setSpendStep('done')
    } finally {
      setImporting(false)
    }
  }

  const resetSpend = () => {
    setSpendStep('mapping')
    setSpendFile(null)
    setSpendHeaders([])
    setSpendMapping({ date: '', license: '', amount: '' })
    setSpendPreview(null)
    setDone(null)
  }

  const mappingReady = spendMapping.date && spendMapping.license && spendMapping.amount

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[720px] max-h-[85vh] overflow-auto border border-gray-200">
        {/* 头部 */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">导入中心</h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 标签切换 */}
        <div className="px-6 pt-4 flex gap-2">
          <TabButton active={tab === 'customers'} label="客户主数据" onClick={() => setTab('customers')} />
          <TabButton active={tab === 'spend'} label="消耗流水" onClick={() => setTab('spend')} />
        </div>

        {/* 客户主数据 */}
        {tab === 'customers' && <div className="p-6">
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-3">
              支持字段：营业执照、客户名称、行业、框架金额、已完成消耗、月度消耗趋势、签约日期、到期日期。按营业执照 upsert，可分多次导入补全。
            </p>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={handleCustomerFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              <button
                onClick={() => downloadCSVTemplate()}
                className="px-4 py-2 text-gray-500 hover:text-gray-900 transition-colors text-sm whitespace-nowrap"
              >
                下载模板
              </button>
            </div>
          </div>

          {importSummary && (
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-sm text-green-600 mb-3">
              {importSummary}
            </div>
          )}

          {parseErrors.length > 0 && (
            <div className="mt-2">
              <p className="text-red-500 text-sm font-medium mb-2">发现 {parseErrors.length} 个错误：</p>
              <div className="bg-gray-100 rounded-lg p-3 max-h-40 overflow-auto">
                {parseErrors.map((error, index) => (
                  <p key={index} className="text-xs text-red-500 mb-1">
                    第{error.row}行：{error.message}
                    {error.value && `（值：${error.value}）`}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>}

        {/* 消耗流水 */}
        {tab === 'spend' && <div className="p-6 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-medium text-gray-900">消耗流水导入</h4>
          </div>

          {spendStep === 'mapping' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                支持 SQL 拉出的日消耗报表：字段名可不同（自动识别，可手动修正），同一客户同一天多条会自动按日聚合。
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleSpendFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              <div className="flex justify-end">
                <a
                  href="/sample-spend.csv"
                  download
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  下载示例流水 CSV（与演示数据匹配）
                </a>
              </div>

              {spendHeaders.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <MappingSelect
                      label="日期列"
                      headers={spendHeaders}
                      value={spendMapping.date}
                      aliases={SPEND_COLUMN_ALIASES.date}
                      onChange={(v) => setSpendMapping(m => ({ ...m, date: v }))}
                    />
                    <MappingSelect
                      label="营业执照列"
                      headers={spendHeaders}
                      value={spendMapping.license}
                      aliases={SPEND_COLUMN_ALIASES.license}
                      onChange={(v) => setSpendMapping(m => ({ ...m, license: v }))}
                    />
                    <MappingSelect
                      label="消耗金额列"
                      headers={spendHeaders}
                      value={spendMapping.amount}
                      aliases={SPEND_COLUMN_ALIASES.amount}
                      onChange={(v) => setSpendMapping(m => ({ ...m, amount: v }))}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={goPreview}
                      disabled={!mappingReady || importing}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
                    >
                      下一步：匹配与预览 <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {spendStep === 'preview' && spendPreview && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3 text-center">
                <PreviewStat label="CSV 总行数" value={spendPreview.totalRows} />
                <PreviewStat label="有效行" value={spendPreview.rawValidRows} />
                <PreviewStat label="聚合后条数" value={spendPreview.aggregatedRows.length} />
                <PreviewStat
                  label="日期范围"
                  value={spendPreview.dateRange ? `${spendPreview.dateRange.start} ~ ${spendPreview.dateRange.end}` : '—'}
                />
              </div>

              {spendPreview.unmatchedLicenses.length > 0 && (
                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  <div className="flex items-center gap-2 text-red-500 text-sm font-medium mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    {spendPreview.unmatchedLicenses.length} 个营业执照不在客户主数据中，这些行不会导入
                  </div>
                  <p className="text-xs text-gray-500">
                    {spendPreview.unmatchedLicenses.slice(0, 5).join('、')}
                    {spendPreview.unmatchedLicenses.length > 5 && ` 等 ${spendPreview.unmatchedLicenses.length} 个`}
                    。请先在左侧导入客户主数据（含营业执照）后重新导入。
                  </p>
                </div>
              )}

              {spendPreview.invalidRows.length > 0 && (
                <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <div className="flex items-center gap-2 text-yellow-600 text-sm font-medium mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    {spendPreview.invalidRows.length} 行数据有误，已跳过
                  </div>
                  <div className="max-h-28 overflow-auto">
                    {spendPreview.invalidRows.slice(0, 8).map((err, i) => (
                      <p key={i} className="text-xs text-yellow-600/80 mb-0.5">
                        第{err.row}行：{err.reason}
                        {err.value !== undefined && `（值：${err.value}）`}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm text-gray-500 mb-2">已存在日期的处理方式</p>
                <div className="space-y-2">
                  {OVERWRITE_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-start gap-2 p-2 bg-gray-100 rounded-lg cursor-pointer">
                      <input
                        type="radio"
                        name="overwrite"
                        checked={overwrite === opt.value}
                        onChange={() => setOverwrite(opt.value)}
                        className="mt-1 accent-blue-500"
                      />
                      <div>
                        <span className="text-sm text-gray-900">{opt.label}</span>
                        <span className="block text-xs text-gray-500">{opt.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setSpendStep('mapping')}
                  className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-gray-900 transition-colors text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> 返回
                </button>
                <button
                  onClick={confirmImport}
                  disabled={importing}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
                >
                  {importing ? '导入中...' : '确认导入'}
                </button>
              </div>
            </div>
          )}

          {spendStep === 'done' && done && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="text-gray-900 font-medium mb-1">导入完成</p>
              <p className="text-sm text-gray-500 mb-4">
                更新 {done.importedCustomers} 个客户，{done.importedDays} 条日期记录
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={resetSpend}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm rounded-lg transition-colors"
                >
                  再导一份
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
                >
                  完成
                </button>
              </div>
            </div>
          )}
        </div>}
      </div>
    </div>
  )
}

/** 读取 CSV 第一行作为表头 */
function readCSVHeaders(file: File): Promise<string[]> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      preview: 1,
      complete: (res) => {
        const firstRow = (res.data[0] || []) as unknown[]
        resolve(firstRow.map(cell => String(cell)))
      },
    })
  })
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
        active ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  )
}

interface MappingSelectProps {
  label: string
  headers: string[]
  value: string
  aliases: string[]
  onChange: (value: string) => void
}

function MappingSelect({ label, headers, value, aliases, onChange }: MappingSelectProps) {
  // 未手动选择时，显示自动识别结果
  const autoMatched = value || headers.find(h => aliases.some(a => h.trim().toLowerCase().includes(a.toLowerCase()))) || ''
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select
        value={autoMatched}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-500"
      >
        <option value="">请选择列</option>
        {headers.map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  )
}

function PreviewStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-100 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm text-gray-900 font-medium truncate">{value}</p>
    </div>
  )
}