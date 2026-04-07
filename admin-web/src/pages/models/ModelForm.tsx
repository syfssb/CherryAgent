import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import { X, Save, Plus, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  modelsService,
  type ModelDetail,
  type CreateModelRequest,
  type UpdateModelRequest,
} from '@/services/models'
import type { ChannelProvider } from '@/constants/providers'
import { useProviders } from '@/constants/providers'
import { ApiError } from '@/services/api'

// ============================================================
// 类型定义
// ============================================================

interface ModelFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  model?: ModelDetail | null
}

interface FormState {
  id: string
  displayName: string
  provider: ChannelProvider
  inputCreditsPerMtok: number
  outputCreditsPerMtok: number
  cacheReadCreditsPerMtok: number
  cacheWriteCreditsPerMtok: number
  longContextInputPrice: number
  longContextOutputPrice: number
  longContextThreshold: number
  maxTokens: number
  maxContextLength: number
  isEnabled: boolean
  isHidden: boolean
  sortOrder: number
  description: string
  features: string[]
  useCases: string[]
  tags: string[]
}

interface FormErrors {
  id?: string
  displayName?: string
  provider?: string
  [key: string]: string | undefined
}

// ============================================================
// 辅助函数
// ============================================================

function createInitialFormState(): FormState {
  return {
    id: '',
    displayName: '',
    provider: 'openai',
    inputCreditsPerMtok: 0,
    outputCreditsPerMtok: 0,
    cacheReadCreditsPerMtok: 0,
    cacheWriteCreditsPerMtok: 0,
    longContextInputPrice: 0,
    longContextOutputPrice: 0,
    longContextThreshold: 0,
    maxTokens: 4096,
    maxContextLength: 128000,
    isEnabled: true,
    isHidden: false,
    sortOrder: 0,
    description: '',
    features: [],
    useCases: [],
    tags: [],
  }
}

function createFormStateFromModel(model: ModelDetail): FormState {
  const c = model.creditsPricing
  return {
    id: model.id,
    displayName: model.displayName,
    provider: model.provider,
    inputCreditsPerMtok: c?.inputCreditsPerMtok || 0,
    outputCreditsPerMtok: c?.outputCreditsPerMtok || 0,
    cacheReadCreditsPerMtok: c?.cacheReadCreditsPerMtok || 0,
    cacheWriteCreditsPerMtok: c?.cacheWriteCreditsPerMtok || 0,
    longContextInputPrice: model.pricing.longContextInputPrice,
    longContextOutputPrice: model.pricing.longContextOutputPrice,
    longContextThreshold: model.pricing.longContextThreshold,
    maxTokens: model.limits.maxTokens,
    maxContextLength: model.limits.maxContextLength,
    isEnabled: model.isEnabled,
    isHidden: model.isHidden,
    sortOrder: model.sortOrder,
    description: model.description || '',
    features: model.features || [],
    useCases: model.useCases || [],
    tags: model.tags || [],
  }
}

function validateForm(form: FormState, isEditMode: boolean): FormErrors {
  const errors: FormErrors = {}

  if (!isEditMode && !form.id.trim()) {
    errors.id = '请输入模型 ID'
  }

  if (!form.displayName.trim()) {
    errors.displayName = '请输入模型显示名称'
  }

  if (!form.provider) {
    errors.provider = '请选择提供商'
  }

  return errors
}

// ============================================================
// 组件
// ============================================================

export default function ModelForm({ open, onClose, onSuccess, model }: ModelFormProps) {
  const isEditMode = Boolean(model)
  const { providers } = useProviders()
  const overlayRef = useRef<HTMLDivElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(createInitialFormState)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (open) {
      if (model) {
        setForm(createFormStateFromModel(model))
      } else {
        setForm(createInitialFormState())
      }
      setErrors({})
      setSubmitError('')
      setSubmitting(false)
    }
  }, [open, model])

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        firstInputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, submitting, onClose])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current && !submitting) {
        onClose()
      }
    },
    [submitting, onClose]
  )

  const updateField = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => {
        if (prev[field as string]) {
          const next = { ...prev }
          delete next[field as string]
          return next
        }
        return prev
      })
      setSubmitError('')
    },
    []
  )

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()

      const validationErrors = validateForm(form, isEditMode)
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors)
        return
      }

      setSubmitting(true)
      setSubmitError('')

      try {
        if (isEditMode && model) {
          const data: UpdateModelRequest = {
            displayName: form.displayName.trim(),
            inputCreditsPerMtok: form.inputCreditsPerMtok,
            outputCreditsPerMtok: form.outputCreditsPerMtok,
            cacheReadCreditsPerMtok: form.cacheReadCreditsPerMtok,
            cacheWriteCreditsPerMtok: form.cacheWriteCreditsPerMtok,
            longContextInputPrice: form.longContextInputPrice,
            longContextOutputPrice: form.longContextOutputPrice,
            longContextThreshold: form.longContextThreshold,
            maxTokens: form.maxTokens,
            maxContextLength: form.maxContextLength,
            isEnabled: form.isEnabled,
            isHidden: form.isHidden,
            sortOrder: form.sortOrder,
            description: form.description.trim(),
            features: form.features,
            useCases: form.useCases,
            tags: form.tags,
          }
          await modelsService.updateModel(model.id, data)
        } else {
          const data: CreateModelRequest = {
            id: form.id.trim(),
            displayName: form.displayName.trim(),
            provider: form.provider,
            inputCreditsPerMtok: form.inputCreditsPerMtok,
            outputCreditsPerMtok: form.outputCreditsPerMtok,
            cacheReadCreditsPerMtok: form.cacheReadCreditsPerMtok,
            cacheWriteCreditsPerMtok: form.cacheWriteCreditsPerMtok,
            longContextInputPrice: form.longContextInputPrice,
            longContextOutputPrice: form.longContextOutputPrice,
            longContextThreshold: form.longContextThreshold,
            maxTokens: form.maxTokens,
            maxContextLength: form.maxContextLength,
            isEnabled: form.isEnabled,
            isHidden: form.isHidden,
            sortOrder: form.sortOrder,
            description: form.description.trim(),
            features: form.features,
            useCases: form.useCases,
            tags: form.tags,
          }
          await modelsService.createModel(data)
        }

        onSuccess()
      } catch (error) {
        if (error instanceof ApiError) {
          setSubmitError(error.message)
        } else {
          setSubmitError(error instanceof Error ? error.message : '操作失败')
        }
      } finally {
        setSubmitting(false)
      }
    },
    [form, isEditMode, model, onSuccess]
  )

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={isEditMode ? '编辑模型' : '创建模型'}
    >
      <div className="bg-background rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">
            {isEditMode ? '编辑模型' : '创建模型'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* 全局错误提示 */}
        {submitError && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
            <AlertCircle size={18} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 基本信息 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">基本信息</h3>

            {!isEditMode && (
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">
                  模型 ID <span className="text-destructive">*</span>
                </label>
                <Input
                  ref={firstInputRef}
                  placeholder="例如：gpt-4o-mini"
                  value={form.id}
                  onChange={(e) => updateField('id', e.target.value)}
                  disabled={submitting}
                  required
                />
                {errors.id && <p className="text-sm text-destructive">{errors.id}</p>}
                <p className="text-sm text-muted-foreground">模型的唯一标识符，创建后不可修改</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">
                显示名称 <span className="text-destructive">*</span>
              </label>
              <Input
                ref={isEditMode ? firstInputRef : undefined}
                placeholder="例如：GPT-4o Mini"
                value={form.displayName}
                onChange={(e) => updateField('displayName', e.target.value)}
                disabled={submitting}
                required
              />
              {errors.displayName && <p className="text-sm text-destructive">{errors.displayName}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  提供商 <span className="text-destructive">*</span>
                </label>
                <select
                  value={form.provider}
                  onChange={(e) => updateField('provider', e.target.value as ChannelProvider)}
                  disabled={submitting || isEditMode}
                  className={cn(
                    'w-full px-4 py-2.5 bg-background border rounded-lg text-foreground',
                    'focus:outline-none focus:ring-2 transition-all duration-200',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'border-border focus:ring-primary/50 focus:border-primary'
                  )}
                >
                  {providers.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">排序权重</label>
                <Input
                  type="number"
                  value={String(form.sortOrder)}
                  onChange={(e) => updateField('sortOrder', Number(e.target.value))}
                  disabled={submitting}
                />
                <p className="text-sm text-muted-foreground">数值越小越靠前</p>
              </div>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border" />

          {/* 价格设置 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              价格设置（积分/百万 Token）
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">输入价格</label>
                <Input
                  type="number"
                  step="any"
                  value={String(form.inputCreditsPerMtok)}
                  onChange={(e) => updateField('inputCreditsPerMtok', Number(e.target.value))}
                  disabled={submitting}
                  min={0}
                />
                <p className="text-sm text-muted-foreground">每百万输入 Token 的积分价格</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">输出价格</label>
                <Input
                  type="number"
                  step="any"
                  value={String(form.outputCreditsPerMtok)}
                  onChange={(e) => updateField('outputCreditsPerMtok', Number(e.target.value))}
                  disabled={submitting}
                  min={0}
                />
                <p className="text-sm text-muted-foreground">每百万输出 Token 的积分价格</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">缓存读取价格</label>
                <Input
                  type="number"
                  step="any"
                  value={String(form.cacheReadCreditsPerMtok)}
                  onChange={(e) => updateField('cacheReadCreditsPerMtok', Number(e.target.value))}
                  disabled={submitting}
                  min={0}
                />
                <p className="text-sm text-muted-foreground">缓存命中时的读取价格</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">缓存写入价格</label>
                <Input
                  type="number"
                  step="any"
                  value={String(form.cacheWriteCreditsPerMtok)}
                  onChange={(e) => updateField('cacheWriteCreditsPerMtok', Number(e.target.value))}
                  disabled={submitting}
                  min={0}
                />
                <p className="text-sm text-muted-foreground">缓存写入时的价格</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">长上下文输入价格</label>
                <Input
                  type="number"
                  step="any"
                  value={String(form.longContextInputPrice)}
                  onChange={(e) => updateField('longContextInputPrice', Number(e.target.value))}
                  disabled={submitting}
                  min={0}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">长上下文输出价格</label>
                <Input
                  type="number"
                  step="any"
                  value={String(form.longContextOutputPrice)}
                  onChange={(e) => updateField('longContextOutputPrice', Number(e.target.value))}
                  disabled={submitting}
                  min={0}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">长上下文阈值</label>
                <Input
                  type="number"
                  value={String(form.longContextThreshold)}
                  onChange={(e) => updateField('longContextThreshold', Number(e.target.value))}
                  disabled={submitting}
                  min={0}
                />
                <p className="text-sm text-muted-foreground">超过此 Token 数启用长上下文价格</p>
              </div>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border" />

          {/* 模型限制 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">模型限制</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">最大输出 Token</label>
                <Input
                  type="number"
                  value={String(form.maxTokens)}
                  onChange={(e) => updateField('maxTokens', Number(e.target.value))}
                  disabled={submitting}
                  min={1}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">最大上下文长度</label>
                <Input
                  type="number"
                  value={String(form.maxContextLength)}
                  onChange={(e) => updateField('maxContextLength', Number(e.target.value))}
                  disabled={submitting}
                  min={1}
                />
              </div>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border" />

          {/* 模型介绍 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">模型介绍</h3>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">模型描述</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                disabled={submitting}
                placeholder="输入模型的详细描述（支持 Markdown）"
                rows={4}
                className={cn(
                  'w-full px-4 py-2.5 bg-background border rounded-lg text-foreground',
                  'focus:outline-none focus:ring-2 transition-all duration-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed resize-y',
                  'border-border focus:ring-primary/50 focus:border-primary'
                )}
              />
              <p className="text-sm text-muted-foreground">支持 Markdown 格式</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">模型特性</label>
              <Input
                value={form.features.join(', ')}
                onChange={(e) => updateField('features', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                disabled={submitting}
                placeholder="例如：长上下文, 多模态, 工具使用"
              />
              <p className="text-sm text-muted-foreground">多个特性用逗号分隔</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">适用场景</label>
              <Input
                value={form.useCases.join(', ')}
                onChange={(e) => updateField('useCases', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                disabled={submitting}
                placeholder="例如：代码生成, 数据分析, 创意写作"
              />
              <p className="text-sm text-muted-foreground">多个场景用逗号分隔</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">标签</label>
              <Input
                value={form.tags.join(', ')}
                onChange={(e) => {
                  const tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  updateField('tags', tags.slice(0, 3).map(t => t.slice(0, 20)))
                }}
                disabled={submitting}
                placeholder="例如：推荐, 最新, 快速"
              />
              <p className="text-sm text-muted-foreground">最多 3 个标签，用逗号分隔，每个标签最长 20 字符。在模型下拉选择器中显示</p>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border" />

          {/* 启用状态 */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.isEnabled}
                onClick={() => updateField('isEnabled', !form.isEnabled)}
                disabled={submitting}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 ease-in-out',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  form.isEnabled ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg',
                    'transform transition duration-200 ease-in-out',
                    form.isEnabled ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {form.isEnabled ? '已上架' : '已下架'}
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  关闭后，系统和用户侧都不能正常使用该模型。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={!form.isHidden}
                onClick={() => updateField('isHidden', !form.isHidden)}
                disabled={submitting}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 ease-in-out',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  form.isHidden ? 'bg-muted' : 'bg-primary'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg',
                    'transform transition duration-200 ease-in-out',
                    form.isHidden ? 'translate-x-0' : 'translate-x-5'
                  )}
                />
              </button>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {form.isHidden ? '已隐藏（仅系统可调用）' : '用户可见'}
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  隐藏后，用户侧模型下拉和价格列表都不会显示该模型，但系统仍可按模型 ID 调用。
                </p>
              </div>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border" />

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={submitting}
            >
              {submitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
              {isEditMode ? <Save size={16} className="mr-1.5" /> : <Plus size={16} className="mr-1.5" />}
              {isEditMode ? '保存修改' : '创建模型'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
