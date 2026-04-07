import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Zap,
  ToggleLeft,
  ToggleRight,
  Edit2,
  Trash2,
  Loader2,
  X,
  Save,
  AlertCircle,
  Star,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { I18nEditor, extractFieldI18n, buildI18nPayload } from '@/components/ui/I18nEditor'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  skillsService,
  SKILL_CATEGORY_OPTIONS,
  SKILL_RUNTIME_OPTIONS,
  type SkillDetail,
  type SkillFilters,
  type SkillCategory,
  type SkillRuntime,
  type CreateSkillRequest,
  type UpdateSkillRequest,
} from '@/services/skills'
import { ApiError } from '@/services/api'

const PAGE_SIZE = 20

const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'true', label: '已启用' },
  { value: 'false', label: '已禁用' },
]

const categoryFilterOptions = [
  { value: '', label: '全部分类' },
  ...SKILL_CATEGORY_OPTIONS,
]

function getCategoryLabel(category: string): string {
  const found = SKILL_CATEGORY_OPTIONS.find((opt) => opt.value === category)
  return found ? found.label : category
}

// ============================================================
// SkillForm 弹窗组件
// ============================================================

interface SkillFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  skill?: SkillDetail | null
}

interface FormState {
  nameI18n: Record<string, string>
  slug: string
  descriptionI18n: Record<string, string>
  category: SkillCategory
  skillContent: string
  icon: string
  isEnabled: boolean
  isDefault: boolean
  sortOrder: number
  version: string
  compatibleRuntimes: SkillRuntime[]
}

function createInitialForm(): FormState {
  return {
    nameI18n: { en: '', zh: '', ja: '', 'zh-TW': '' },
    slug: '',
    descriptionI18n: { en: '', zh: '', ja: '', 'zh-TW': '' },
    category: 'general',
    skillContent: '',
    icon: '',
    isEnabled: true,
    isDefault: false,
    sortOrder: 0,
    version: '1.0.0',
    compatibleRuntimes: ['claude', 'codex'],
  }
}

function createFormFromSkill(skill: SkillDetail): FormState {
  return {
    nameI18n: extractFieldI18n(skill.i18n, 'name', skill.name),
    slug: skill.slug,
    descriptionI18n: extractFieldI18n(skill.i18n, 'description', skill.description ?? ''),
    category: skill.category,
    skillContent: skill.skillContent,
    icon: skill.icon ?? '',
    isEnabled: skill.isEnabled,
    isDefault: skill.isDefault,
    sortOrder: skill.sortOrder,
    version: skill.version,
    compatibleRuntimes: skill.compatibleRuntimes ?? ['claude', 'codex'],
  }
}

function SkillForm({ open, onClose, onSuccess, skill }: SkillFormProps) {
  const isEdit = Boolean(skill)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<FormState>(createInitialForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (open) {
      setForm(skill ? createFormFromSkill(skill) : createInitialForm())
      setErrors({})
      setSubmitError('')
      setSubmitting(false)
    }
  }, [open, skill])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, submitting, onClose])

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
      const errs: Record<string, string> = {}
      const name = form.nameI18n.en?.trim() ?? ''
      const description = form.descriptionI18n.en?.trim() ?? ''
      if (!name) errs.name = '请输入名称（English 为必填）'
      if (!form.slug.trim()) errs.slug = '请输入 slug'
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
        errs.slug = 'slug 只能包含小写字母、数字和连字符'
      }
      if (!form.skillContent.trim()) errs.skillContent = '请输入 Skill 内容'
      if (form.compatibleRuntimes.length === 0) errs.compatibleRuntimes = '至少选择一个兼容运行时'
      if (Object.keys(errs).length > 0) {
        setErrors(errs)
        return
      }

      setSubmitting(true)
      setSubmitError('')

      const i18n = buildI18nPayload({ name: form.nameI18n, description: form.descriptionI18n })

      try {
        if (isEdit && skill) {
          const data: UpdateSkillRequest = {
            name,
            slug: form.slug.trim(),
            description: description || null,
            category: form.category,
            skillContent: form.skillContent,
            icon: form.icon.trim() || null,
            isEnabled: form.isEnabled,
            isDefault: form.isDefault,
            sortOrder: form.sortOrder,
            version: form.version.trim(),
            compatibleRuntimes: form.compatibleRuntimes,
            i18n,
          }
          await skillsService.updateSkill(skill.id, data)
        } else {
          const data: CreateSkillRequest = {
            name,
            slug: form.slug.trim(),
            description: description || null,
            category: form.category,
            skillContent: form.skillContent,
            icon: form.icon.trim() || null,
            isEnabled: form.isEnabled,
            isDefault: form.isDefault,
            sortOrder: form.sortOrder,
            version: form.version.trim(),
            compatibleRuntimes: form.compatibleRuntimes,
            i18n,
          }
          await skillsService.createSkill(data)
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
    [form, isEdit, skill, onSuccess]
  )

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === overlayRef.current && !submitting) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-background rounded-xl border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">
            {isEdit ? '编辑 Skill' : '创建 Skill'}
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

        {submitError && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
            <AlertCircle size={18} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">基本信息</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <I18nEditor
                  value={form.nameI18n}
                  onChange={(val) => {
                    updateField('nameI18n', val)
                    setErrors((prev) => {
                      if (prev.name) {
                        const next = { ...prev }
                        delete next.name
                        return next
                      }
                      return prev
                    })
                  }}
                  label="名称"
                  required
                />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Slug</label>
                <Input
                  placeholder="例如：frontend-design"
                  value={form.slug}
                  onChange={(e) => updateField('slug', e.target.value)}
                  disabled={submitting}
                  required
                  className={errors.slug ? 'border-destructive' : ''}
                />
                {errors.slug && <p className="text-xs text-destructive mt-1">{errors.slug}</p>}
                <p className="text-xs text-muted-foreground mt-1">唯一标识符，小写字母、数字和连字符</p>
              </div>
            </div>
            <I18nEditor
              value={form.descriptionI18n}
              onChange={(val) => updateField('descriptionI18n', val)}
              label="描述"
              multiline
            />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">分类</label>
                <select
                  value={form.category}
                  onChange={(e) => updateField('category', e.target.value as SkillCategory)}
                  disabled={submitting}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50"
                >
                  {SKILL_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">图标</label>
                <Input
                  placeholder="例如：code"
                  value={form.icon}
                  onChange={(e) => updateField('icon', e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">版本</label>
                <Input
                  placeholder="1.0.0"
                  value={form.version}
                  onChange={(e) => updateField('version', e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">排序权重</label>
              <Input
                type="number"
                value={String(form.sortOrder)}
                onChange={(e) => updateField('sortOrder', Number(e.target.value))}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground mt-1">数值越小越靠前</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">兼容运行时</label>
              <div className="flex items-center gap-4 mt-1">
                {SKILL_RUNTIME_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.compatibleRuntimes.includes(opt.value)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.compatibleRuntimes, opt.value]
                          : form.compatibleRuntimes.filter((r) => r !== opt.value)
                        updateField('compatibleRuntimes', next)
                      }}
                      disabled={submitting}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
                    />
                    <span className="text-sm text-foreground">{opt.label}</span>
                  </label>
                ))}
              </div>
              {errors.compatibleRuntimes && (
                <p className="text-xs text-destructive mt-1">{errors.compatibleRuntimes}</p>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Skill 内容 (SKILL.md)</h3>
            <div>
              <textarea
                value={form.skillContent}
                onChange={(e) => updateField('skillContent', e.target.value)}
                disabled={submitting}
                rows={12}
                placeholder="输入 SKILL.md 的 Markdown 内容..."
                className={cn(
                  'w-full px-4 py-3 bg-background border rounded-lg text-foreground font-mono text-sm',
                  'focus:outline-none focus:ring-2 transition-all duration-200 resize-y',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  errors.skillContent
                    ? 'border-destructive focus:ring-destructive/50'
                    : 'border-border focus:ring-primary/50 focus:border-primary'
                )}
              />
              {errors.skillContent && (
                <p className="mt-1 text-sm text-destructive">{errors.skillContent}</p>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.isEnabled}
                onClick={() => updateField('isEnabled', !form.isEnabled)}
                disabled={submitting}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  form.isEnabled ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition duration-200',
                  form.isEnabled ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
              <label className="text-sm font-medium text-muted-foreground">
                {form.isEnabled ? '已启用' : '已禁用'}
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.isDefault}
                onClick={() => updateField('isDefault', !form.isDefault)}
                disabled={submitting}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/50',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  form.isDefault ? 'bg-warning' : 'bg-muted'
                )}
              >
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition duration-200',
                  form.isDefault ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
              <label className="text-sm font-medium text-muted-foreground">
                {form.isDefault ? '默认安装' : '非默认'}
              </label>
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button
              type="submit"
              disabled={submitting}
            >
              {submitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
              {isEdit ? <Save size={16} className="mr-1.5" /> : <Plus size={16} className="mr-1.5" />}
              {isEdit ? '保存修改' : '创建 Skill'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// SkillList 主页面
// ============================================================

export default function SkillListPage() {
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillDetail | null>(null)

  const buildFilters = useCallback((): SkillFilters => {
    const filters: SkillFilters = { page, limit: PAGE_SIZE }
    if (search.trim()) filters.search = search.trim()
    if (categoryFilter) filters.category = categoryFilter
    if (statusFilter) filters.isEnabled = statusFilter as 'true' | 'false'
    return filters
  }, [page, search, categoryFilter, statusFilter])

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['skills', page, search, statusFilter, categoryFilter],
    queryFn: () => skillsService.getSkills(buildFilters()),
  })

  const skills = response?.data?.skills ?? []
  const summary = response?.data?.summary
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE))) : 1

  const toggleMutation = useMutation({
    mutationFn: (id: string) => skillsService.toggleSkill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: (err: Error) => {
      alert(`操作失败: ${err.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => skillsService.deleteSkill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: (err: Error) => {
      alert(`删除失败: ${err.message}`)
    },
  })

  const handleDelete = useCallback((skill: SkillDetail) => {
    if (confirm(`确定要删除 Skill "${skill.name}" 吗？`)) {
      deleteMutation.mutate(skill.id)
    }
  }, [deleteMutation])

  const handleClearFilters = useCallback(() => {
    setStatusFilter('')
    setCategoryFilter('')
    setSearch('')
    setPage(1)
  }, [])

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Skill 管理</h1>
          <p className="text-muted-foreground mt-1">管理桌面端预装 Skill 插件</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching && <Loader2 size={14} className="animate-spin mr-1.5" />}
            <RefreshCw size={16} className="mr-1.5" />
            刷新
          </Button>
          <Button onClick={() => { setEditingSkill(null); setFormOpen(true) }}>
            <Plus size={16} className="mr-1.5" />
            添加 Skill
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">总 Skill 数</p>
                <p className="text-2xl font-bold text-foreground mt-1">{summary?.totalSkills ?? '-'}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap size={24} className="text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">已启用</p>
                <p className="text-2xl font-bold text-success mt-1">{summary?.enabledSkills ?? '-'}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle size={24} className="text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">已禁用</p>
                <p className="text-2xl font-bold text-muted-foreground mt-1">
                  {summary ? summary.totalSkills - summary.enabledSkills : '-'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle size={24} className="text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">默认安装</p>
                <p className="text-2xl font-bold text-warning mt-1">{summary?.defaultSkills ?? '-'}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                <Star size={24} className="text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索 Skill 名称或描述..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setPage(1) }}
                className="pl-10"
              />
            </div>
            <Button
              variant={showFilters ? 'default' : 'secondary'}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={16} className="mr-1.5" />
              筛选
            </Button>
          </div>
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">状态</label>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {statusFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">分类</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {categoryFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button variant="ghost" onClick={handleClearFilters}>清除筛选</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {isError && (
        <Card>
          <CardContent className="p-4">
            <div className="text-destructive text-sm">
              加载失败: {error instanceof Error ? error.message : '未知错误'}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Skill 表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>兼容运行时</TableHead>
                <TableHead>默认安装</TableHead>
                <TableHead>排序</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <Loader2 size={24} className="animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : skills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    没有找到匹配的 Skill
                  </TableCell>
                </TableRow>
              ) : (
                skills.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell>
                      <div>
                        <p className="text-foreground font-medium">{skill.name}</p>
                        {skill.description && (
                          <p className="text-muted-foreground text-sm truncate max-w-[200px]">{skill.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm font-mono">{skill.slug}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getCategoryLabel(skill.category)}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">{skill.version}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {(skill.compatibleRuntimes ?? ['claude', 'codex']).map((rt) => (
                          <Badge key={rt} variant="outline" className="text-xs">
                            {rt === 'claude' ? 'Claude' : 'Codex'}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {skill.isDefault ? (
                        <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5">默认</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">{skill.sortOrder}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={skill.isEnabled ? 'outline' : 'secondary'} className={skill.isEnabled ? 'border-success/30 text-success bg-success/5' : ''}>
                        {skill.isEnabled ? '已启用' : '已禁用'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleMutation.mutate(skill.id)}
                          disabled={toggleMutation.isPending}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            skill.isEnabled
                              ? 'text-success hover:text-warning hover:bg-muted'
                              : 'text-muted-foreground hover:text-success hover:bg-muted'
                          )}
                          title={skill.isEnabled ? '禁用' : '启用'}
                        >
                          {toggleMutation.isPending ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : skill.isEnabled ? (
                            <ToggleRight size={16} />
                          ) : (
                            <ToggleLeft size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => { setEditingSkill(skill); setFormOpen(true) }}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                          title="编辑"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(skill)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <div className="text-sm text-muted-foreground">
                共 {total} 条记录，第 {page}/{totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPage(page - 1)} disabled={page === 1}>
                  <ChevronLeft size={16} className="mr-1" />
                  上一页
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPage(page + 1)} disabled={page === totalPages}>
                  下一页
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建/编辑弹窗 */}
      <SkillForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingSkill(null) }}
        onSuccess={() => {
          setFormOpen(false)
          setEditingSkill(null)
          queryClient.invalidateQueries({ queryKey: ['skills'] })
        }}
        skill={editingSkill}
      />
    </div>
  )
}
