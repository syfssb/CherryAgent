import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react'
import { X, Eye, EyeOff, AlertCircle, Save, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, safeJsonParse } from '@/lib/utils'
import {
  channelsService,
  type ChannelDetail,
  type CreateChannelRequest,
  type UpdateChannelRequest,
} from '@/services/channels'
import type { ChannelProvider } from '@/constants/providers'
import { useProviders } from '@/constants/providers'
import { ApiError } from '@/services/api'

// ============================================================
// 类型定义
// ============================================================

interface ChannelFormProps {
  /** 是否显示对话框 */
  open: boolean
  /** 关闭对话框回调 */
  onClose: () => void
  /** 提交成功回调 */
  onSuccess: () => void
  /** 编辑模式下传入的渠道数据，为 null/undefined 时为创建模式 */
  channel?: ChannelDetail | null
  /** 复制模式：用源渠道数据预填表单，但以创建模式提交 */
  duplicateFrom?: ChannelDetail | null
}

/**
 * 表单内部状态
 */
interface FormState {
  name: string
  provider: ChannelProvider | string
  baseUrl: string
  apiKey: string
  modelMapping: string
  weight: number
  priority: number
  rpmLimit: number
  tpmLimit: number
  dailyLimit: number
  priceMultiplier: number
  isEnabled: boolean
}

/**
 * 表单字段校验错误
 */
interface FormErrors {
  name?: string
  provider?: string
  baseUrl?: string
  apiKey?: string
  modelMapping?: string
  weight?: string
  priority?: string
  rpmLimit?: string
  tpmLimit?: string
  dailyLimit?: string
  priceMultiplier?: string
}

// ============================================================
// 常量
// ============================================================

/**
 * 提供商默认 Base URL 映射
 */
const PROVIDER_DEFAULT_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1',
  azure: 'https://{resource}.openai.azure.com',
  deepseek: 'https://api.deepseek.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  baidu: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1',
  alibaba: 'https://dashscope.aliyuncs.com/api/v1',
  custom: '',
}

/**
 * 创建空白表单状态
 */
function createInitialFormState(): FormState {
  return {
    name: '',
    provider: 'openai',
    baseUrl: PROVIDER_DEFAULT_URLS['openai'] ?? '',
    apiKey: '',
    modelMapping: '{}',
    weight: 100,
    priority: 10,
    rpmLimit: 0,
    tpmLimit: 0,
    dailyLimit: 0,
    priceMultiplier: 1.0,
    isEnabled: true,
  }
}

/**
 * 从 ChannelDetail 构建编辑模式的表单状态
 */
function createFormStateFromChannel(channel: ChannelDetail): FormState {
  return {
    name: channel.name,
    provider: channel.provider,
    baseUrl: channel.baseUrl,
    apiKey: '',
    modelMapping: JSON.stringify(channel.modelMapping ?? {}, null, 2),
    weight: channel.weight,
    priority: channel.priority,
    rpmLimit: channel.rpmLimit,
    tpmLimit: channel.tpmLimit,
    dailyLimit: channel.dailyLimit,
    priceMultiplier: channel.priceMultiplier,
    isEnabled: channel.isEnabled,
  }
}

// ============================================================
// 校验逻辑
// ============================================================

/**
 * 校验表单字段，返回错误映射
 */
function validateForm(form: FormState, isEditMode: boolean): FormErrors {
  const errors: FormErrors = {}

  // 渠道名称
  const trimmedName = form.name.trim()
  if (!trimmedName) {
    errors.name = '请输入渠道名称'
  } else if (trimmedName.length > 100) {
    errors.name = '渠道名称不能超过 100 个字符'
  }

  // 提供商
  if (!form.provider) {
    errors.provider = '请选择提供商'
  }

  // Base URL
  const trimmedUrl = form.baseUrl.trim()
  if (!trimmedUrl) {
    errors.baseUrl = '请输入 Base URL'
  } else {
    try {
      new URL(trimmedUrl)
    } catch {
      // Azure 模板 URL 包含 {resource} 占位符，允许通过
      if (!trimmedUrl.includes('{')) {
        errors.baseUrl = '请输入有效的 URL 地址'
      }
    }
  }

  // API Key - 创建模式必填，编辑模式可选（留空表示不修改）
  if (!isEditMode && !form.apiKey.trim()) {
    errors.apiKey = '请输入 API Key'
  }

  // 模型映射 JSON 校验
  const trimmedMapping = form.modelMapping.trim()
  if (trimmedMapping && trimmedMapping !== '{}') {
    const parsed = safeJsonParse<unknown>(trimmedMapping, null)
    if (parsed === null) {
      errors.modelMapping = '请输入有效的 JSON 格式'
    } else if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      errors.modelMapping = '模型映射必须是 JSON 对象格式，如 {"model-a": "model-b"}'
    }
  }

  // 权重
  if (form.weight < 0 || form.weight > 100) {
    errors.weight = '权重范围为 0-100'
  }

  // 优先级
  if (form.priority < 0 || form.priority > 100) {
    errors.priority = '优先级范围为 0-100'
  }

  // RPM 限制
  if (form.rpmLimit < 0) {
    errors.rpmLimit = 'RPM 限制不能为负数'
  }

  // TPM 限制
  if (form.tpmLimit < 0) {
    errors.tpmLimit = 'TPM 限制不能为负数'
  }

  // 每日限制
  if (form.dailyLimit < 0) {
    errors.dailyLimit = '每日限制不能为负数'
  }

  // 价格倍率
  if (form.priceMultiplier < 0) {
    errors.priceMultiplier = '价格倍率不能为负数'
  } else if (form.priceMultiplier > 100) {
    errors.priceMultiplier = '价格倍率不能超过 100'
  }

  return errors
}

// ============================================================
// 组件
// ============================================================

/**
 * 渠道创建/编辑对话框组件
 *
 * 用法示例:
 * ```tsx
 * <ChannelForm
 *   open={showForm}
 *   onClose={() => setShowForm(false)}
 *   onSuccess={() => { setShowForm(false); refreshList() }}
 *   channel={editingChannel}  // 传入则为编辑模式，不传则为创建模式
 * />
 * ```
 */
export default function ChannelForm({ open, onClose, onSuccess, channel, duplicateFrom }: ChannelFormProps) {
  const isEditMode = Boolean(channel)
  const { providers } = useProviders()
  const overlayRef = useRef<HTMLDivElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)

  // 表单状态
  const [form, setForm] = useState<FormState>(createInitialFormState)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  // 当 open 或 channel 变化时，重置表单
  useEffect(() => {
    if (open) {
      if (channel) {
        setForm(createFormStateFromChannel(channel))
      } else if (duplicateFrom) {
        // 复制模式：预填源渠道数据，但清空 API Key、修改名称
        const prefilled = createFormStateFromChannel(duplicateFrom)
        prefilled.name = `${duplicateFrom.name} (副本)`
        prefilled.apiKey = ''
        setForm(prefilled)
      } else {
        setForm(createInitialFormState())
      }
      setErrors({})
      setSubmitError('')
      setShowApiKey(false)
      setSubmitting(false)
    }
  }, [open, channel, duplicateFrom])

  // 打开时聚焦第一个输入框
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        firstInputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [open])

  // ESC 键关闭
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

  // 点击遮罩层关闭
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current && !submitting) {
        onClose()
      }
    },
    [submitting, onClose]
  )

  // 更新单个字段（不可变更新）
  const updateField = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }))
      // 清除该字段的错误
      setErrors((prev) => {
        if (prev[field as keyof FormErrors]) {
          const { [field as keyof FormErrors]: _, ...rest } = prev
          return rest
        }
        return prev
      })
      setSubmitError('')
    },
    []
  )

  // 提供商变更时自动填充 Base URL
  const handleProviderChange = useCallback(
    (provider: string) => {
      updateField('provider', provider)
      const defaultUrl = PROVIDER_DEFAULT_URLS[provider]
      if (defaultUrl !== undefined) {
        updateField('baseUrl', defaultUrl)
      }
    },
    [updateField]
  )

  // 提交表单
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()

      // 校验
      const validationErrors = validateForm(form, isEditMode)
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors)
        return
      }

      setSubmitting(true)
      setSubmitError('')

      try {
        // 解析模型映射
        const trimmedMapping = form.modelMapping.trim()
        const modelMapping =
          trimmedMapping && trimmedMapping !== '{}'
            ? safeJsonParse<Record<string, string>>(trimmedMapping, {})
            : undefined

        if (isEditMode && channel) {
          // 编辑模式 - 构建更新请求
          const updateData: UpdateChannelRequest = {
            name: form.name.trim(),
            provider: form.provider,
            baseUrl: form.baseUrl.trim(),
            modelMapping,
            weight: form.weight,
            priority: form.priority,
            rpmLimit: form.rpmLimit,
            tpmLimit: form.tpmLimit,
            dailyLimit: form.dailyLimit,
            priceMultiplier: form.priceMultiplier,
            isEnabled: form.isEnabled,
          }

          // API Key 留空表示不修改
          const trimmedApiKey = form.apiKey.trim()
          if (trimmedApiKey) {
            updateData.apiKey = trimmedApiKey
          }

          await channelsService.updateChannel(channel.id, updateData)
        } else {
          // 创建模式
          const createData: CreateChannelRequest = {
            name: form.name.trim(),
            provider: form.provider,
            baseUrl: form.baseUrl.trim(),
            apiKey: form.apiKey.trim(),
            modelMapping,
            weight: form.weight,
            priority: form.priority,
            rpmLimit: form.rpmLimit,
            tpmLimit: form.tpmLimit,
            dailyLimit: form.dailyLimit,
            priceMultiplier: form.priceMultiplier,
            isEnabled: form.isEnabled,
          }

          await channelsService.createChannel(createData)
        }

        onSuccess()
      } catch (error) {
        if (error instanceof ApiError) {
          setSubmitError(error.message)
        } else {
          setSubmitError(
            error instanceof Error ? error.message : '操作失败，请稍后重试'
          )
        }
      } finally {
        setSubmitting(false)
      }
    },
    [form, isEditMode, channel, onSuccess]
  )

  // 不显示时不渲染
  if (!open) {
    return null
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={isEditMode ? '编辑渠道' : '创建渠道'}
    >
      <div className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">
            {isEditMode ? '编辑渠道' : '创建渠道'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={cn(
              'p-2 rounded-lg text-muted-foreground transition-colors',
              'hover:text-foreground hover:bg-muted',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label="关闭对话框"
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

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 渠道名称 */}
          <div className="w-full">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              渠道名称 <span className="text-destructive">*</span>
            </label>
            <Input
              ref={firstInputRef}
              placeholder="例如：OpenAI 主渠道"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              disabled={submitting}
              maxLength={100}
              required
            />
            {errors.name && (
              <p className="mt-1.5 text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* 提供商 */}
          <div className="w-full">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              提供商 <span className="text-destructive">*</span>
            </label>
            <select
              value={form.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              disabled={submitting}
              className={cn(
                'w-full px-4 py-2.5 bg-background border rounded-lg',
                'text-foreground',
                'focus:outline-none focus:ring-2 transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                errors.provider
                  ? 'border-destructive focus:ring-destructive/50 focus:border-destructive'
                  : 'border-border focus:ring-primary/50 focus:border-primary'
              )}
            >
              {providers.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.provider && (
              <p className="mt-1.5 text-sm text-destructive">{errors.provider}</p>
            )}
          </div>

          {/* Base URL */}
          <div className="w-full">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Base URL <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="https://api.example.com/v1"
              value={form.baseUrl}
              onChange={(e) => updateField('baseUrl', e.target.value)}
              disabled={submitting}
              required
            />
            {errors.baseUrl && (
              <p className="mt-1.5 text-sm text-destructive">{errors.baseUrl}</p>
            )}
          </div>

          {/* API Key */}
          <div className="w-full">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              API Key {!isEditMode && <span className="text-destructive">*</span>}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => updateField('apiKey', e.target.value)}
                placeholder={
                  isEditMode
                    ? `当前: ${channel?.apiKeyMasked ?? '***'}（留空表示不修改）`
                    : '请输入 API Key'
                }
                disabled={submitting}
                className={cn(
                  'w-full px-4 py-2.5 pr-10 bg-background border rounded-lg',
                  'text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 transition-all duration-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  errors.apiKey
                    ? 'border-destructive focus:ring-destructive/50 focus:border-destructive'
                    : 'border-border focus:ring-primary/50 focus:border-primary'
                )}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                tabIndex={-1}
              >
                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.apiKey && (
              <p className="mt-1.5 text-sm text-destructive">{errors.apiKey}</p>
            )}
            {isEditMode && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                留空表示保持原有 API Key 不变
              </p>
            )}
          </div>

          {/* 模型映射 */}
          <div className="w-full">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              模型映射
            </label>
            <textarea
              value={form.modelMapping}
              onChange={(e) => updateField('modelMapping', e.target.value)}
              placeholder='{"source-model": "target-model"}'
              disabled={submitting}
              rows={4}
              className={cn(
                'w-full px-4 py-2.5 bg-background border rounded-lg',
                'text-foreground placeholder:text-muted-foreground font-mono text-sm',
                'focus:outline-none focus:ring-2 transition-all duration-200',
                'disabled:opacity-50 disabled:cursor-not-allowed resize-y',
                errors.modelMapping
                  ? 'border-destructive focus:ring-destructive/50 focus:border-destructive'
                  : 'border-border focus:ring-primary/50 focus:border-primary'
              )}
            />
            {errors.modelMapping && (
              <p className="mt-1.5 text-sm text-destructive">{errors.modelMapping}</p>
            )}
            <p className="mt-1.5 text-sm text-muted-foreground">
              JSON 格式，键为请求模型名，值为实际调用模型名
            </p>
          </div>

          {/* 权重 & 优先级 - 两列布局 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="w-full">
              <label className="block text-sm font-medium text-foreground mb-1.5">权重</label>
              <Input
                type="number"
                value={String(form.weight)}
                onChange={(e) => updateField('weight', Number(e.target.value))}
                disabled={submitting}
                min={0}
                max={100}
              />
              {errors.weight && (
                <p className="mt-1.5 text-sm text-destructive">{errors.weight}</p>
              )}
              <p className="mt-1.5 text-sm text-muted-foreground">0-100，越大流量越多</p>
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-foreground mb-1.5">优先级</label>
              <Input
                type="number"
                value={String(form.priority)}
                onChange={(e) => updateField('priority', Number(e.target.value))}
                disabled={submitting}
                min={0}
                max={100}
              />
              {errors.priority && (
                <p className="mt-1.5 text-sm text-destructive">{errors.priority}</p>
              )}
              <p className="mt-1.5 text-sm text-muted-foreground">0-100，越小越优先</p>
            </div>
          </div>

          {/* RPM & TPM 限制 - 两列布局 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="w-full">
              <label className="block text-sm font-medium text-foreground mb-1.5">RPM 限制</label>
              <Input
                type="number"
                value={String(form.rpmLimit)}
                onChange={(e) => updateField('rpmLimit', Number(e.target.value))}
                disabled={submitting}
                min={0}
              />
              {errors.rpmLimit && (
                <p className="mt-1.5 text-sm text-destructive">{errors.rpmLimit}</p>
              )}
              <p className="mt-1.5 text-sm text-muted-foreground">每分钟请求数，0 = 不限</p>
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-foreground mb-1.5">TPM 限制</label>
              <Input
                type="number"
                value={String(form.tpmLimit)}
                onChange={(e) => updateField('tpmLimit', Number(e.target.value))}
                disabled={submitting}
                min={0}
              />
              {errors.tpmLimit && (
                <p className="mt-1.5 text-sm text-destructive">{errors.tpmLimit}</p>
              )}
              <p className="mt-1.5 text-sm text-muted-foreground">每分钟 Token 数，0 = 不限</p>
            </div>
          </div>

          {/* 每日限制 & 价格倍率 - 两列布局 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="w-full">
              <label className="block text-sm font-medium text-foreground mb-1.5">每日请求限制</label>
              <Input
                type="number"
                value={String(form.dailyLimit)}
                onChange={(e) => updateField('dailyLimit', Number(e.target.value))}
                disabled={submitting}
                min={0}
              />
              {errors.dailyLimit && (
                <p className="mt-1.5 text-sm text-destructive">{errors.dailyLimit}</p>
              )}
              <p className="mt-1.5 text-sm text-muted-foreground">每日请求数，0 = 不限</p>
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-foreground mb-1.5">价格倍率</label>
              <Input
                type="number"
                value={String(form.priceMultiplier)}
                onChange={(e) => updateField('priceMultiplier', Number(e.target.value))}
                disabled={submitting}
                min={0}
                max={100}
                step={0.1}
              />
              {errors.priceMultiplier && (
                <p className="mt-1.5 text-sm text-destructive">{errors.priceMultiplier}</p>
              )}
              <p className="mt-1.5 text-sm text-muted-foreground">默认 1.0，用于调整计费</p>
            </div>
          </div>

          {/* 是否启用 */}
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
            <label className="text-sm font-medium text-muted-foreground">
              {form.isEnabled ? '已启用' : '已禁用'}
            </label>
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
              variant="default"
              disabled={submitting}
            >
              {submitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
              {isEditMode ? <Save size={16} className="mr-1.5" /> : <Plus size={16} className="mr-1.5" />}
              {isEditMode ? '保存修改' : '创建渠道'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
