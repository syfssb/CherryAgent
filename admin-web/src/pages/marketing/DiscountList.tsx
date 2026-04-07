import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Eye,
  Copy,
  Percent,
  DollarSign,
  Gift,
  ToggleLeft,
  ToggleRight,
  X,
  Save,
  ShieldAlert,
  Layers,
  Clock,
  Users,
  Loader2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui/table'
import { cn, formatDateTime } from '@/lib/utils'
import {
  discountsService,
  type DiscountCode,
  type DiscountType,
  type DiscountUsage,
  type DiscountFilters,
  type CreateDiscountRequest,
  type UpdateDiscountRequest,
  type BatchCreateRequest,
} from '@/services/discounts'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '启用中' },
  { value: 'inactive', label: '已禁用' },
  { value: 'expired', label: '已过期' },
]

const typeFilterOptions = [
  { value: '', label: '全部类型' },
  { value: 'percentage', label: '百分比折扣' },
  { value: 'fixed_amount', label: '固定金额' },
  { value: 'bonus_credits', label: '赠送积分' },
]

// ============================================================
// 辅助函数
// ============================================================

function getDiscountTypeBadge(type: DiscountType): { variant: 'outline' | 'secondary' | 'default'; label: string } {
  switch (type) {
    case 'percentage':
      return { variant: 'outline', label: '百分比折扣' }
    case 'fixed_amount':
      return { variant: 'secondary', label: '固定金额' }
    case 'bonus_credits':
      return { variant: 'default', label: '赠送积分' }
    default:
      return { variant: 'outline', label: '未知类型' }
  }
}

function getDiscountTypeIcon(type: DiscountType) {
  switch (type) {
    case 'percentage':
      return <Percent size={16} />
    case 'fixed_amount':
      return <DollarSign size={16} />
    case 'bonus_credits':
      return <Gift size={16} />
    default:
      return <Percent size={16} />
  }
}

function formatDiscountValue(type: DiscountType, value: number): string {
  switch (type) {
    case 'percentage':
      return `${value}%`
    case 'fixed_amount':
      return `${value.toFixed(2)} 积分`
    case 'bonus_credits':
      return `+${value}积分`
    default:
      return String(value)
  }
}

function getDiscountStatus(discount: DiscountCode): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } {
  if (!discount.isActive) {
    return { label: '已禁用', variant: 'secondary' }
  }
  if (discount.expiresAt && new Date(discount.expiresAt) < new Date()) {
    return { label: '已过期', variant: 'outline' }
  }
  if (discount.startsAt && new Date(discount.startsAt) > new Date()) {
    return { label: '未开始', variant: 'outline' }
  }
  if (discount.usageLimit !== null && discount.usedCount >= discount.usageLimit) {
    return { label: '已用完', variant: 'destructive' }
  }
  return { label: '启用中', variant: 'default' }
}

function generateRandomCode(prefix: string, length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = prefix ? `${prefix}-` : ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// ============================================================
// 创建/编辑折扣码弹窗
// ============================================================

interface DiscountFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  discount: DiscountCode | null
}

function DiscountForm({ open, onClose, onSuccess, discount }: DiscountFormProps) {
  const [code, setCode] = useState(discount?.code ?? '')
  const [name, setName] = useState(discount?.name ?? '')
  const [description, setDescription] = useState(discount?.description ?? '')
  const [discountType, setDiscountType] = useState<DiscountType>(discount?.discountType ?? 'percentage')
  const [discountValue, setDiscountValue] = useState(discount?.discountValue ?? 10)
  const [minAmount, setMinAmount] = useState(discount?.minAmount ?? 0)
  const [maxDiscount, setMaxDiscount] = useState<string>(discount?.maxDiscount?.toString() ?? '')
  const [usageLimit, setUsageLimit] = useState<string>(discount?.usageLimit?.toString() ?? '')
  const [perUserLimit, setPerUserLimit] = useState(discount?.perUserLimit ?? 1)
  const [isActive, setIsActive] = useState(discount?.isActive ?? true)
  const [startsAt, setStartsAt] = useState(discount?.startsAt?.slice(0, 16) ?? '')
  const [expiresAt, setExpiresAt] = useState(discount?.expiresAt?.slice(0, 16) ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!discount

  const handleGenerateCode = useCallback(() => {
    setCode(generateRandomCode('', 10))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!code.trim()) {
      setError('请输入折扣码')
      return
    }
    if (!name.trim()) {
      setError('请输入折扣名称')
      return
    }
    if (discountValue <= 0) {
      setError('折扣值必须大于0')
      return
    }
    if (discountType === 'percentage' && discountValue > 100) {
      setError('百分比折扣不能超过100%')
      return
    }

    try {
      setSaving(true)

      const baseData = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        discountType,
        discountValue,
        minAmount,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit, 10) : null,
        perUserLimit,
        isActive,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }

      if (isEditing) {
        const data: UpdateDiscountRequest = { ...baseData }
        await discountsService.updateDiscount(discount.id, data)
      } else {
        const data: CreateDiscountRequest = { ...baseData }
        await discountsService.createDiscount(data)
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-background rounded-xl border border-border p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-foreground">
            {isEditing ? '编辑折扣码' : '创建折扣码'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 折扣码 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">折扣码</label>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="例如: WELCOME2024"
                className="flex-1"
                required
              />
              <Button type="button" variant="secondary" onClick={handleGenerateCode}>
                随机生成
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">折扣名称</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 新用户首充优惠"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="折扣码的详细说明..."
              rows={3}
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[80px]"
            />
          </div>

          {/* 折扣类型和值 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">折扣类型</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="percentage">百分比折扣</option>
                <option value="fixed_amount">固定金额</option>
                <option value="bonus_credits">赠送积分</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {discountType === 'percentage'
                  ? '折扣百分比 (%)'
                  : discountType === 'fixed_amount'
                    ? '折扣金额 (积分)'
                    : '赠送积分数'}
              </label>
              <Input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                min={0}
                max={discountType === 'percentage' ? 100 : undefined}
                step={discountType === 'percentage' ? 1 : 0.01}
                required
              />
            </div>
          </div>

          {/* 金额限制 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">最低消费金额 (积分)</label>
              <Input
                type="number"
                value={minAmount}
                onChange={(e) => setMinAmount(parseFloat(e.target.value) || 0)}
                min={0}
                step={0.01}
              />
              <p className="text-xs text-muted-foreground mt-1">0 表示无限制</p>
            </div>

            {discountType === 'percentage' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">最大折扣金额 (积分)</label>
                <Input
                  type="number"
                  value={maxDiscount}
                  onChange={(e) => setMaxDiscount(e.target.value)}
                  min={0}
                  step={0.01}
                  placeholder="留空表示无上限"
                />
                <p className="text-xs text-muted-foreground mt-1">百分比折扣的最大优惠金额</p>
              </div>
            )}
          </div>

          {/* 使用限制 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">总使用次数限制</label>
              <Input
                type="number"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                min={0}
                placeholder="留空表示无限制"
              />
              <p className="text-xs text-muted-foreground mt-1">所有用户共享的总次数</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">每用户使用次数</label>
              <Input
                type="number"
                value={perUserLimit}
                onChange={(e) => setPerUserLimit(parseInt(e.target.value, 10) || 1)}
                min={1}
              />
              <p className="text-xs text-muted-foreground mt-1">每个用户最多可使用次数</p>
            </div>
          </div>

          {/* 有效期 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">开始时间</label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">过期时间（可选）</label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          {/* 启用状态 */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-ring"
            />
            <div>
              <div className="text-sm font-medium text-foreground">立即启用</div>
              <div className="text-xs text-muted-foreground">勾选后折扣码可立即使用</div>
            </div>
          </label>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
              <Save size={16} className="mr-2" />
              {isEditing ? '保存修改' : '创建折扣码'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// 批量生成折扣码弹窗
// ============================================================

interface BatchCreateFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function BatchCreateForm({ open, onClose, onSuccess }: BatchCreateFormProps) {
  const [prefix, setPrefix] = useState('BATCH')
  const [count, setCount] = useState(10)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [discountType, setDiscountType] = useState<DiscountType>('percentage')
  const [discountValue, setDiscountValue] = useState(10)
  const [minAmount, setMinAmount] = useState(0)
  const [maxDiscount, setMaxDiscount] = useState<string>('')
  const [usageLimit, setUsageLimit] = useState<string>('1')
  const [perUserLimit, setPerUserLimit] = useState(1)
  const [isActive, setIsActive] = useState(true)
  const [startsAt, setStartsAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ count: number; codes: string[] } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!name.trim()) {
      setError('请输入折扣名称')
      return
    }
    if (count < 1 || count > 1000) {
      setError('生成数量必须在 1-1000 之间')
      return
    }
    if (discountValue <= 0) {
      setError('折扣值必须大于0')
      return
    }
    if (discountType === 'percentage' && discountValue > 100) {
      setError('百分比折扣不能超过100%')
      return
    }

    try {
      setSaving(true)

      const data: BatchCreateRequest = {
        prefix: prefix.trim().toUpperCase() || undefined,
        count,
        name: name.trim(),
        description: description.trim() || undefined,
        discountType,
        discountValue,
        minAmount,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit, 10) : null,
        perUserLimit,
        isActive,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }

      const response = await discountsService.batchCreate(data)
      setResult({
        count: response.data?.count ?? 0,
        codes: response.data?.codes ?? [],
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量生成失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyCodes = useCallback(() => {
    if (result?.codes) {
      navigator.clipboard.writeText(result.codes.join('\n'))
    }
  }, [result])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-background rounded-xl border border-border p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-foreground">
            <Layers size={20} className="inline mr-2" />
            批量生成折扣码
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {result ? (
          <div className="space-y-4">
            <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
              <p className="text-success font-medium mb-2">
                成功生成 {result.count} 个折扣码
              </p>
              <div className="max-h-48 overflow-y-auto bg-muted rounded-lg p-3">
                <pre className="text-foreground/80 text-sm whitespace-pre-wrap break-all">
                  {result.codes.join('\n')}
                </pre>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={handleCopyCodes}>
                <Copy size={16} className="mr-2" />
                复制全部
              </Button>
              <Button onClick={onClose}>
                关闭
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">折扣码前缀</label>
                <Input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder="例如: BATCH"
                />
                <p className="text-xs text-muted-foreground mt-1">生成的码格式: 前缀-随机字符</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">生成数量</label>
                <Input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
                  min={1}
                  max={1000}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">最多 1000 个</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">折扣名称</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: 批量推广码"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">描述（可选）</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="批量折扣码的说明..."
                rows={2}
                className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[60px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">折扣类型</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                  className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="percentage">百分比折扣</option>
                  <option value="fixed_amount">固定金额</option>
                  <option value="bonus_credits">赠送积分</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {discountType === 'percentage'
                    ? '折扣百分比 (%)'
                    : discountType === 'fixed_amount'
                      ? '折扣金额 (积分)'
                      : '赠送积分数'}
                </label>
                <Input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                  min={0}
                  max={discountType === 'percentage' ? 100 : undefined}
                  step={discountType === 'percentage' ? 1 : 0.01}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">最低消费金额 (积分)</label>
                <Input
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.01}
                />
                <p className="text-xs text-muted-foreground mt-1">0 表示无限制</p>
              </div>

              {discountType === 'percentage' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">最大折扣金额 (积分)</label>
                  <Input
                    type="number"
                    value={maxDiscount}
                    onChange={(e) => setMaxDiscount(e.target.value)}
                    min={0}
                    step={0.01}
                    placeholder="留空表示无上限"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">每码使用次数限制</label>
                <Input
                  type="number"
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(e.target.value)}
                  min={0}
                  placeholder="留空表示无限制"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">每用户使用次数</label>
                <Input
                  type="number"
                  value={perUserLimit}
                  onChange={(e) => setPerUserLimit(parseInt(e.target.value, 10) || 1)}
                  min={1}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">开始时间</label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">过期时间（可选）</label>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-ring"
              />
              <div>
                <div className="text-sm font-medium text-foreground">立即启用</div>
                <div className="text-xs text-muted-foreground">勾选后生成的折扣码可立即使用</div>
              </div>
            </label>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
                <Layers size={16} className="mr-2" />
                批量生成
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 使用记录弹窗
// ============================================================

interface UsageRecordsDialogProps {
  open: boolean
  onClose: () => void
  discount: DiscountCode | null
}

function UsageRecordsDialog({ open, onClose, discount }: UsageRecordsDialogProps) {
  const [usagePage, setUsagePage] = useState(1)

  const {
    data: usageResponse,
    isLoading: usageLoading,
  } = useQuery({
    queryKey: ['discount-usages', discount?.id, usagePage],
    queryFn: () => discountsService.getUsages(discount!.id, usagePage, 10),
    enabled: open && !!discount,
  })

  const usages: DiscountUsage[] = usageResponse?.data?.usages ?? []
  const usageMeta = usageResponse?.meta
  const usageTotalPages = usageMeta
    ? Math.max(1, Math.ceil((usageMeta.total ?? 0) / (usageMeta.limit ?? 10)))
    : 1

  if (!open || !discount) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-background rounded-xl border border-border p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              <Users size={20} className="inline mr-2" />
              使用记录
            </h3>
            <p className="text-muted-foreground text-sm mt-1">
              折扣码: <span className="text-foreground/80 font-mono">{discount.code}</span>
              {' - '}
              {discount.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>原价</TableHead>
              <TableHead>折扣</TableHead>
              <TableHead>实付</TableHead>
              <TableHead>赠送积分</TableHead>
              <TableHead>使用时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usageLoading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground text-sm">加载中...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : usages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="text-center py-8 text-muted-foreground text-sm">暂无使用记录</div>
                </TableCell>
              </TableRow>
            ) : (
              usages.map((usage) => (
                <TableRow key={usage.id}>
                  <TableCell>
                    <div>
                      <p className="text-foreground text-sm font-medium">
                        {usage.userName || '未知用户'}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {usage.userEmail || usage.userId}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground/80 text-sm">
                      {usage.originalAmount.toFixed(2)} 积分
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-destructive text-sm">
                      -{usage.discountAmount.toFixed(2)} 积分
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-success text-sm font-medium">
                      {usage.finalAmount.toFixed(2)} 积分
                    </span>
                  </TableCell>
                  <TableCell>
                    {usage.bonusCredits > 0 ? (
                      <Badge variant="default">+{usage.bonusCredits}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground text-sm">
                      {formatDateTime(usage.createdAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* 使用记录分页 */}
        {usageTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border mt-2">
            <div className="text-sm text-muted-foreground">
              共 {usageMeta?.total ?? 0} 条记录，第 {usagePage}/{usageTotalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setUsagePage(usagePage - 1)}
                disabled={usagePage === 1}
              >
                <ChevronLeft size={16} className="mr-1" />
                上一页
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setUsagePage(usagePage + 1)}
                disabled={usagePage === usageTotalPages}
              >
                下一页
                <ChevronRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end pt-4 border-t border-border mt-4">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 主组件
// ============================================================

export default function DiscountListPage() {
  const queryClient = useQueryClient()

  // 筛选状态
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  // 弹窗状态
  const [formOpen, setFormOpen] = useState(false)
  const [editingDiscount, setEditingDiscount] = useState<DiscountCode | null>(null)
  const [batchFormOpen, setBatchFormOpen] = useState(false)
  const [viewingUsages, setViewingUsages] = useState<DiscountCode | null>(null)
  const [deletingDiscount, setDeletingDiscount] = useState<DiscountCode | null>(null)

  // 构建筛选参数
  const buildFilters = useCallback((): DiscountFilters => {
    const filters: DiscountFilters = {
      page,
      limit: PAGE_SIZE,
    }
    if (search.trim()) {
      filters.search = search.trim()
    }
    if (statusFilter) {
      filters.status = statusFilter as DiscountFilters['status']
    }
    if (typeFilter) {
      filters.discountType = typeFilter as DiscountType
    }
    return filters
  }, [page, search, statusFilter, typeFilter])

  // 查询折扣码列表
  const {
    data: response,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['discounts', page, search, statusFilter, typeFilter],
    queryFn: () => discountsService.getDiscounts(buildFilters()),
  })

  const discounts = response?.data?.discounts ?? []
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta
    ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE)))
    : 1

  // 启用/禁用
  const toggleMutation = useMutation({
    mutationFn: (id: string) => discountsService.toggleDiscount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] })
    },
    onError: (err: Error) => {
      alert(`操作失败: ${err.message}`)
    },
  })

  // 删除折扣码
  const deleteMutation = useMutation({
    mutationFn: (id: string) => discountsService.deleteDiscount(id),
    onSuccess: () => {
      setDeletingDiscount(null)
      queryClient.invalidateQueries({ queryKey: ['discounts'] })
    },
    onError: (err: Error) => {
      alert(`删除失败: ${err.message}`)
    },
  })

  // 事件处理
  const handleSearch = useCallback(() => {
    setPage(1)
  }, [])

  const handleClearFilters = useCallback(() => {
    setStatusFilter('')
    setTypeFilter('')
    setSearch('')
    setPage(1)
  }, [])

  const handleOpenCreate = useCallback(() => {
    setEditingDiscount(null)
    setFormOpen(true)
  }, [])

  const handleOpenEdit = useCallback((discount: DiscountCode) => {
    setEditingDiscount(discount)
    setFormOpen(true)
  }, [])

  const handleFormSuccess = useCallback(() => {
    setFormOpen(false)
    setEditingDiscount(null)
    queryClient.invalidateQueries({ queryKey: ['discounts'] })
  }, [queryClient])

  const handleBatchSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['discounts'] })
  }, [queryClient])

  const handleToggle = useCallback((discount: DiscountCode) => {
    toggleMutation.mutate(discount.id)
  }, [toggleMutation])

  const handleDeleteConfirm = useCallback(() => {
    if (deletingDiscount) {
      deleteMutation.mutate(deletingDiscount.id)
    }
  }, [deletingDiscount, deleteMutation])

  const handleCopyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code)
  }, [])

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">折扣码管理</h1>
          <p className="text-muted-foreground mt-1">创建和管理折扣码、优惠活动</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
            刷新
          </Button>
          <Button
            variant="secondary"
            onClick={() => setBatchFormOpen(true)}
          >
            <Layers size={16} className="mr-2" />
            批量生成
          </Button>
          <Button
            onClick={handleOpenCreate}
          >
            <Plus size={16} className="mr-2" />
            创建折扣码
          </Button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="搜索折扣码或名称..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch()
                }}
                className="pl-10"
              />
            </div>
            <Button
              variant={showFilters ? 'default' : 'secondary'}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={16} className="mr-2" />
              筛选
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">状态</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value)
                    setPage(1)
                  }}
                  className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {statusFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">折扣类型</label>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value)
                    setPage(1)
                  }}
                  className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {typeFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <Button variant="ghost" onClick={handleClearFilters}>
                  清除筛选
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 折扣码表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>折扣码</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>折扣值</TableHead>
                <TableHead>使用情况</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>有效期</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-40">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <div className="flex items-center justify-center py-12">
                      <Loader2 size={24} className="animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground text-sm">加载中...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : discounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <div className="text-center py-12 text-muted-foreground text-sm">没有找到匹配的折扣码</div>
                  </TableCell>
                </TableRow>
              ) : (
                discounts.map((discount) => {
                  const typeBadge = getDiscountTypeBadge(discount.discountType)
                  const status = getDiscountStatus(discount)

                  return (
                    <TableRow key={discount.id}>
                      {/* 折扣码信息 */}
                      <TableCell>
                        <div className="max-w-xs">
                          <div className="flex items-center gap-2">
                            {getDiscountTypeIcon(discount.discountType)}
                            <span className="text-foreground font-mono font-medium text-sm">
                              {discount.code}
                            </span>
                            <button
                              onClick={() => handleCopyCode(discount.code)}
                              className="p-1 text-muted-foreground hover:text-foreground/80 transition-colors"
                              title="复制折扣码"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                          <p className="text-muted-foreground text-xs mt-0.5 truncate">
                            {discount.name}
                            {discount.description ? ` - ${discount.description}` : ''}
                          </p>
                        </div>
                      </TableCell>

                      {/* 类型 */}
                      <TableCell>
                        <Badge variant={typeBadge.variant}>
                          {typeBadge.label}
                        </Badge>
                      </TableCell>

                      {/* 折扣值 */}
                      <TableCell>
                        <span className="text-foreground font-medium text-sm">
                          {formatDiscountValue(discount.discountType, discount.discountValue)}
                        </span>
                        {discount.minAmount > 0 && (
                          <p className="text-muted-foreground text-xs mt-0.5">
                            满{discount.minAmount.toFixed(2)}积分可用
                          </p>
                        )}
                        {discount.maxDiscount !== null && discount.maxDiscount > 0 && (
                          <p className="text-muted-foreground text-xs">
                            最多优惠{discount.maxDiscount.toFixed(2)}积分
                          </p>
                        )}
                      </TableCell>

                      {/* 使用情况 */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="text-foreground/80 text-sm font-medium">
                            {discount.usedCount}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            / {discount.usageLimit ?? '∞'}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs mt-0.5">
                          每人限 {discount.perUserLimit} 次
                        </p>
                      </TableCell>

                      {/* 状态 */}
                      <TableCell>
                        <Badge variant={status.variant}>
                          {status.label}
                        </Badge>
                      </TableCell>

                      {/* 有效期 */}
                      <TableCell>
                        <div className="text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock size={12} />
                            <span>{formatDateTime(discount.startsAt)}</span>
                          </div>
                          <div className="text-muted-foreground text-xs mt-0.5">
                            {discount.expiresAt
                              ? `至 ${formatDateTime(discount.expiresAt)}`
                              : '永不过期'}
                          </div>
                        </div>
                      </TableCell>

                      {/* 创建时间 */}
                      <TableCell>
                        <span className="text-muted-foreground text-sm">
                          {formatDateTime(discount.createdAt)}
                        </span>
                      </TableCell>

                      {/* 操作 */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {/* 查看使用记录 */}
                          <button
                            onClick={() => setViewingUsages(discount)}
                            className="p-1.5 text-muted-foreground hover:text-blue-400 hover:bg-muted rounded transition-colors"
                            title="查看使用记录"
                          >
                            <Eye size={16} />
                          </button>

                          {/* 启用/禁用 */}
                          <button
                            onClick={() => handleToggle(discount)}
                            disabled={toggleMutation.isPending}
                            className={cn(
                              'p-1.5 rounded transition-colors',
                              discount.isActive
                                ? 'text-success hover:text-warning hover:bg-muted'
                                : 'text-muted-foreground hover:text-success hover:bg-muted'
                            )}
                            title={discount.isActive ? '禁用' : '启用'}
                          >
                            {discount.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          </button>

                          {/* 编辑 */}
                          <button
                            onClick={() => handleOpenEdit(discount)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                            title="编辑折扣码"
                          >
                            <Edit2 size={16} />
                          </button>

                          {/* 删除 */}
                          <button
                            onClick={() => setDeletingDiscount(discount)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors"
                            title="删除折扣码"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <div className="text-sm text-muted-foreground">
                共 {total} 条记录，第 {page}/{totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  <ChevronLeft size={16} className="mr-1" />
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                >
                  下一页
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建/编辑折扣码弹窗 */}
      <DiscountForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingDiscount(null)
        }}
        onSuccess={handleFormSuccess}
        discount={editingDiscount}
      />

      {/* 批量生成弹窗 */}
      <BatchCreateForm
        open={batchFormOpen}
        onClose={() => setBatchFormOpen(false)}
        onSuccess={handleBatchSuccess}
      />

      {/* 使用记录弹窗 */}
      <UsageRecordsDialog
        open={!!viewingUsages}
        onClose={() => setViewingUsages(null)}
        discount={viewingUsages}
      />

      {/* 删除确认弹窗 */}
      {deletingDiscount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeletingDiscount(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-background rounded-xl border border-border p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert size={20} className="text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">确认删除</h3>
            </div>
            <p className="text-foreground/80 mb-2">
              确定要删除折扣码 <span className="text-foreground font-mono font-medium">「{deletingDiscount.code}」</span> 吗？
            </p>
            <p className="text-muted-foreground text-sm mb-6">
              该折扣码已被使用 {deletingDiscount.usedCount} 次。此操作不可恢复。
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setDeletingDiscount(null)}
                disabled={deleteMutation.isPending}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <Loader2 size={16} className="mr-2 animate-spin" />}
                <Trash2 size={16} className="mr-2" />
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
