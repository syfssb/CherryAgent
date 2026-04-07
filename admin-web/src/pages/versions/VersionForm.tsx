import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import { X, Save, Plus, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  versionsService,
  type VersionDetail,
  type CreateVersionRequest,
  type UpdateVersionRequest,
  type UpdateStrategy,
} from '@/services/versions'
import { ApiError } from '@/services/api'

// ============================================================
// 类型定义
// ============================================================

interface VersionFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  version?: VersionDetail | null
}

interface FormState {
  version: string
  downloadUrlMacArm64: string
  downloadUrlMacX64: string
  downloadUrlWinX64: string
  downloadUrlLinuxX64: string
  releaseNotes: string
  updateStrategy: UpdateStrategy
  minVersion: string
  stagingPercentage: number
  isPublished: boolean
}

interface FormErrors {
  version?: string
  downloadUrlMacArm64?: string
  downloadUrlMacX64?: string
  downloadUrlWinX64?: string
  downloadUrlLinuxX64?: string
  minVersion?: string
  stagingPercentage?: string
  [key: string]: string | undefined
}

// ============================================================
// 常量
// ============================================================

const VERSION_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/

const STRATEGY_OPTIONS: Array<{ value: UpdateStrategy; label: string }> = [
  { value: 'none', label: '不更新' },
  { value: 'optional', label: '可选更新' },
  { value: 'recommended', label: '推荐更新' },
  { value: 'forced', label: '强制更新' },
]

// ============================================================
// 辅助函数
// ============================================================

function createInitialFormState(): FormState {
  return {
    version: '',
    downloadUrlMacArm64: '',
    downloadUrlMacX64: '',
    downloadUrlWinX64: '',
    downloadUrlLinuxX64: '',
    releaseNotes: '',
    updateStrategy: 'optional',
    minVersion: '',
    stagingPercentage: 100,
    isPublished: false,
  }
}

function createFormStateFromVersion(ver: VersionDetail): FormState {
  return {
    version: ver.version,
    downloadUrlMacArm64: ver.downloadUrls.macArm64 ?? '',
    downloadUrlMacX64: ver.downloadUrls.macX64 ?? '',
    downloadUrlWinX64: ver.downloadUrls.winX64 ?? '',
    downloadUrlLinuxX64: ver.downloadUrls.linuxX64 ?? '',
    releaseNotes: ver.releaseNotes ?? '',
    updateStrategy: ver.updateStrategy,
    minVersion: ver.minVersion ?? '',
    stagingPercentage: ver.stagingPercentage,
    isPublished: ver.isPublished,
  }
}

/**
 * 校验 URL 格式
 */
function isValidUrl(val: string): boolean {
  try {
    new URL(val)
    return true
  } catch {
    return false
  }
}

/**
 * 校验表单字段，返回错误映射
 */
function validateForm(form: FormState, isEditMode: boolean): FormErrors {
  const errors: FormErrors = {}

  // 版本号 - 创建模式必填
  if (!isEditMode) {
    const trimmedVersion = form.version.trim()
    if (!trimmedVersion) {
      errors.version = '请输入版本号'
    } else if (!VERSION_REGEX.test(trimmedVersion)) {
      errors.version = '版本号格式不正确，例如 1.2.3 或 1.2.3-beta.1'
    }
  }

  // 下载链接 - 如果填了必须是合法 URL
  const urlFields: Array<{ key: keyof FormErrors; label: string; value: string }> = [
    { key: 'downloadUrlMacArm64', label: 'Mac ARM64', value: form.downloadUrlMacArm64 },
    { key: 'downloadUrlMacX64', label: 'Mac x64', value: form.downloadUrlMacX64 },
    { key: 'downloadUrlWinX64', label: 'Windows x64', value: form.downloadUrlWinX64 },
    { key: 'downloadUrlLinuxX64', label: 'Linux x64', value: form.downloadUrlLinuxX64 },
  ]

  for (const field of urlFields) {
    const trimmed = field.value.trim()
    if (trimmed && !isValidUrl(trimmed)) {
      errors[field.key] = `请输入有效的 ${field.label} 下载链接`
    }
  }

  // 灰度百分比
  if (form.stagingPercentage < 0 || form.stagingPercentage > 100) {
    errors.stagingPercentage = '灰度百分比范围为 0-100'
  }

  // 最低版本 - 如果填了必须符合版本号正则
  const trimmedMinVersion = form.minVersion.trim()
  if (trimmedMinVersion && !VERSION_REGEX.test(trimmedMinVersion)) {
    errors.minVersion = '版本号格式不正确，例如 1.2.3 或 1.2.3-beta.1'
  }

  return errors
}

/**
 * 获取灰度百分比的显示标签
 */
function getStagingLabel(percentage: number): string {
  if (percentage === 0) return '暂停'
  if (percentage === 100) return '全量'
  return `${percentage}%`
}

// ============================================================
// 组件
// ============================================================

export default function VersionForm({ open, onClose, onSuccess, version }: VersionFormProps) {
  const isEditMode = Boolean(version)
  const overlayRef = useRef<HTMLDivElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(createInitialFormState)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // 当 open 或 version 变化时，重置表单
  useEffect(() => {
    if (open) {
      if (version) {
        setForm(createFormStateFromVersion(version))
      } else {
        setForm(createInitialFormState())
      }
      setErrors({})
      setSubmitError('')
      setSubmitting(false)
    }
  }, [open, version])

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

  // 提交表单
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
        if (isEditMode && version) {
          const data: UpdateVersionRequest = {
            downloadUrlMacArm64: form.downloadUrlMacArm64.trim() || null,
            downloadUrlMacX64: form.downloadUrlMacX64.trim() || null,
            downloadUrlWinX64: form.downloadUrlWinX64.trim() || null,
            downloadUrlLinuxX64: form.downloadUrlLinuxX64.trim() || null,
            releaseNotes: form.releaseNotes.trim() || undefined,
            updateStrategy: form.updateStrategy,
            minVersion: form.minVersion.trim() || null,
            stagingPercentage: form.stagingPercentage,
            isPublished: form.isPublished,
          }
          await versionsService.updateVersion(version.id, data)
        } else {
          const data: CreateVersionRequest = {
            version: form.version.trim(),
            downloadUrlMacArm64: form.downloadUrlMacArm64.trim() || undefined,
            downloadUrlMacX64: form.downloadUrlMacX64.trim() || undefined,
            downloadUrlWinX64: form.downloadUrlWinX64.trim() || undefined,
            downloadUrlLinuxX64: form.downloadUrlLinuxX64.trim() || undefined,
            releaseNotes: form.releaseNotes.trim() || undefined,
            updateStrategy: form.updateStrategy,
            minVersion: form.minVersion.trim() || undefined,
            stagingPercentage: form.stagingPercentage,
            isPublished: form.isPublished,
          }
          await versionsService.createVersion(data)
        }

        onSuccess()
        onClose()
      } catch (error) {
        if (error instanceof ApiError) {
          setSubmitError(error.message)
        } else {
          setSubmitError(error instanceof Error ? error.message : '操作失败，请稍后重试')
        }
      } finally {
        setSubmitting(false)
      }
    },
    [form, isEditMode, version, onSuccess, onClose]
  )

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={isEditMode ? '编辑版本' : '创建版本'}
    >
      <div className="bg-background rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">
            {isEditMode ? '编辑版本' : '创建版本'}
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

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Section 1: 基本信息 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">基本信息</h3>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">
                版本号 <span className="text-destructive">*</span>
              </label>
              <Input
                ref={firstInputRef}
                placeholder="例如 1.2.3 或 1.2.3-beta.1"
                value={form.version}
                onChange={(e) => updateField('version', e.target.value)}
                disabled={submitting || isEditMode}
              />
              {errors.version && <p className="text-sm text-destructive">{errors.version}</p>}
              {isEditMode && (
                <p className="text-sm text-muted-foreground">版本号创建后不可修改</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">最低兼容版本</label>
              <Input
                placeholder="例如 1.0.0（可选）"
                value={form.minVersion}
                onChange={(e) => updateField('minVersion', e.target.value)}
                disabled={submitting}
              />
              {errors.minVersion && <p className="text-sm text-destructive">{errors.minVersion}</p>}
              <p className="text-sm text-muted-foreground">低于此版本的客户端将被要求更新</p>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border" />

          {/* Section 2: 下载链接 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">下载链接</h3>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Mac ARM64 (Apple Silicon)</label>
              <Input
                placeholder="https://example.com/app-arm64.dmg"
                value={form.downloadUrlMacArm64}
                onChange={(e) => updateField('downloadUrlMacArm64', e.target.value)}
                disabled={submitting}
              />
              {errors.downloadUrlMacArm64 && <p className="text-sm text-destructive">{errors.downloadUrlMacArm64}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Mac x64 (Intel)</label>
              <Input
                placeholder="https://example.com/app-x64.dmg"
                value={form.downloadUrlMacX64}
                onChange={(e) => updateField('downloadUrlMacX64', e.target.value)}
                disabled={submitting}
              />
              {errors.downloadUrlMacX64 && <p className="text-sm text-destructive">{errors.downloadUrlMacX64}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Windows x64</label>
              <Input
                placeholder="https://example.com/app-x64.exe"
                value={form.downloadUrlWinX64}
                onChange={(e) => updateField('downloadUrlWinX64', e.target.value)}
                disabled={submitting}
              />
              {errors.downloadUrlWinX64 && <p className="text-sm text-destructive">{errors.downloadUrlWinX64}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Linux x64</label>
              <Input
                placeholder="https://example.com/app-x64.AppImage"
                value={form.downloadUrlLinuxX64}
                onChange={(e) => updateField('downloadUrlLinuxX64', e.target.value)}
                disabled={submitting}
              />
              {errors.downloadUrlLinuxX64 && <p className="text-sm text-destructive">{errors.downloadUrlLinuxX64}</p>}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border" />

          {/* Section 3: 更新策略 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">更新策略</h3>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">更新策略</label>
              <select
                value={form.updateStrategy}
                onChange={(e) => updateField('updateStrategy', e.target.value as UpdateStrategy)}
                disabled={submitting}
                className={cn(
                  'w-full px-4 py-2.5 bg-background border rounded-lg text-foreground',
                  'focus:outline-none focus:ring-2 transition-all duration-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'border-border focus:ring-primary/50 focus:border-primary'
                )}
              >
                {STRATEGY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 灰度发布百分比 */}
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">
                灰度发布百分比
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.stagingPercentage}
                  onChange={(e) => updateField('stagingPercentage', Number(e.target.value))}
                  disabled={submitting}
                  className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={String(form.stagingPercentage)}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value)))
                      updateField('stagingPercentage', val)
                    }}
                    disabled={submitting}
                    className="w-20 text-center"
                  />
                  <span className="text-sm text-muted-foreground w-10">
                    {getStagingLabel(form.stagingPercentage)}
                  </span>
                </div>
              </div>
              {errors.stagingPercentage && <p className="text-sm text-destructive">{errors.stagingPercentage}</p>}
              <p className="text-sm text-muted-foreground">控制更新推送的用户比例，0% 为暂停推送，100% 为全量推送</p>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border" />

          {/* Section 4: 发布说明 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">发布说明</h3>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">更新说明</label>
              <textarea
                value={form.releaseNotes}
                onChange={(e) => updateField('releaseNotes', e.target.value)}
                placeholder="支持 Markdown 格式，描述本次更新的内容..."
                disabled={submitting}
                className={cn(
                  'w-full px-4 py-2.5 bg-background border rounded-lg',
                  'text-foreground placeholder:text-muted-foreground font-mono text-sm',
                  'focus:outline-none focus:ring-2 transition-all duration-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed resize-y',
                  'border-border focus:ring-primary/50 focus:border-primary',
                  'min-h-[200px]'
                )}
              />
            </div>

            {/* 是否立即发布 */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.isPublished}
                onClick={() => updateField('isPublished', !form.isPublished)}
                disabled={submitting}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 ease-in-out',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  form.isPublished ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg',
                    'transform transition duration-200 ease-in-out',
                    form.isPublished ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
              <label className="text-sm font-medium text-muted-foreground">
                {form.isPublished ? '立即发布' : '保存为草稿'}
              </label>
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
              {isEditMode ? '保存修改' : '创建版本'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
