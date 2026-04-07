import { useState, useCallback, useEffect } from 'react'
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
  EyeOff,
  Megaphone,
  AlertTriangle,
  Info,
  ShieldAlert,
  X,
  Save,
  Loader2,
  Pin,
  PinOff,
  Siren,
  Wrench,
  Tag,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { I18nEditor, extractFieldI18n, buildI18nPayload } from '@/components/ui/I18nEditor'
import { MarkdownPreview, stripMarkdown } from '@/components/ui/MarkdownPreview'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { cn, formatDateTime } from '@/lib/utils'
import {
  announcementsService,
  type Announcement,
  type AnnouncementType,
  type AnnouncementFilters,
  type CreateAnnouncementRequest,
  type UpdateAnnouncementRequest,
} from '@/services/announcements'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

const typeFilterOptions = [
  { value: '', label: '全部类型' },
  { value: 'info', label: '通知' },
  { value: 'warning', label: '警告' },
  { value: 'important', label: '重要' },
  { value: 'critical', label: '紧急' },
  { value: 'maintenance', label: '维护' },
  { value: 'promotion', label: '促销' },
]

const publishedFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'true', label: '已发布' },
  { value: 'false', label: '未发布' },
]

// ============================================================
// 辅助函数
// ============================================================

function getTypeBadge(type: AnnouncementType): { className: string; label: string } {
  switch (type) {
    case 'info':
      return { className: 'border-blue-500/30 text-blue-500 bg-blue-500/5', label: '通知' }
    case 'warning':
      return { className: 'border-warning/30 text-warning bg-warning/5', label: '警告' }
    case 'important':
      return { className: 'border-destructive/30 text-destructive bg-destructive/5', label: '重要' }
    case 'critical':
      return { className: 'border-red-600/30 text-red-600 bg-red-600/5', label: '紧急' }
    case 'maintenance':
      return { className: 'border-orange-500/30 text-orange-500 bg-orange-500/5', label: '维护' }
    case 'promotion':
      return { className: 'border-green-500/30 text-green-500 bg-green-500/5', label: '促销' }
    default:
      return { className: 'border-blue-500/30 text-blue-500 bg-blue-500/5', label: '通知' }
  }
}

function getTypeIcon(type: AnnouncementType) {
  switch (type) {
    case 'info':
      return <Info size={16} />
    case 'warning':
      return <AlertTriangle size={16} />
    case 'important':
      return <Megaphone size={16} />
    case 'critical':
      return <Siren size={16} />
    case 'maintenance':
      return <Wrench size={16} />
    case 'promotion':
      return <Tag size={16} />
    default:
      return <Info size={16} />
  }
}

// ============================================================
// 表单对话框组件
// ============================================================

interface AnnouncementFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  announcement: Announcement | null
}

function AnnouncementForm({ open, onClose, onSuccess, announcement }: AnnouncementFormProps) {
  const [titleI18n, setTitleI18n] = useState<Record<string, string>>(
    () => extractFieldI18n(announcement?.i18n, 'title', announcement?.title ?? '')
  )
  const [contentI18n, setContentI18n] = useState<Record<string, string>>(
    () => extractFieldI18n(announcement?.i18n, 'content', announcement?.content ?? '')
  )
  const [type, setType] = useState<AnnouncementType>(announcement?.type as AnnouncementType ?? 'info')
  const [isPublished, setIsPublished] = useState(announcement?.isPublished ?? false)
  const [isPinned, setIsPinned] = useState(announcement?.isPinned ?? false)
  const [expiresAt, setExpiresAt] = useState(announcement?.expiresAt?.slice(0, 16) ?? '')
  const [sortOrder, setSortOrder] = useState(announcement?.sortOrder ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!announcement

  useEffect(() => {
    if (open) {
      setTitleI18n(extractFieldI18n(announcement?.i18n, 'title', announcement?.title ?? ''))
      setContentI18n(extractFieldI18n(announcement?.i18n, 'content', announcement?.content ?? ''))
      setType(announcement?.type as AnnouncementType ?? 'info')
      setIsPublished(announcement?.isPublished ?? false)
      setIsPinned(announcement?.isPinned ?? false)
      setExpiresAt(announcement?.expiresAt?.slice(0, 16) ?? '')
      setSortOrder(announcement?.sortOrder ?? 0)
      setError(null)
      setSaving(false)
    }
  }, [open, announcement])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const title = titleI18n.en?.trim() ?? ''
    const content = contentI18n.en?.trim() ?? ''

    if (!title) {
      setError('请输入公告标题（English 为必填）')
      return
    }
    if (!content) {
      setError('请输入公告内容（English 为必填）')
      return
    }

    const i18n = buildI18nPayload({ title: titleI18n, content: contentI18n })

    try {
      setSaving(true)

      if (isEditing) {
        const data: UpdateAnnouncementRequest = {
          title,
          content,
          type,
          isPublished,
          isPinned,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          sortOrder,
          i18n,
        }
        await announcementsService.updateAnnouncement(announcement.id, data)
      } else {
        const data: CreateAnnouncementRequest = {
          title,
          content,
          type,
          isPublished,
          isPinned,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          sortOrder,
          i18n,
        }
        await announcementsService.createAnnouncement(data)
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <Card
        className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="text-lg font-semibold text-foreground">
            {isEditing ? '编辑公告' : '创建公告'}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        </div>

        <CardContent className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <I18nEditor
              value={titleI18n}
              onChange={setTitleI18n}
              label="公告标题"
              required
            />

            <I18nEditor
              value={contentI18n}
              onChange={setContentI18n}
              label="公告内容（支持 Markdown）"
              multiline
              required
              renderPreview={(content) => <MarkdownPreview content={content} />}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">公告类型</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as AnnouncementType)}
                  className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="info">通知</option>
                  <option value="warning">警告</option>
                  <option value="important">重要</option>
                  <option value="critical">紧急</option>
                  <option value="maintenance">维护</option>
                  <option value="promotion">促销</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">排序权重</label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                />
                <p className="text-xs text-muted-foreground">数值越大越靠前</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">过期时间（可选）</label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
              />
              <div>
                <div className="text-sm font-medium text-foreground">立即发布</div>
                <div className="text-xs text-muted-foreground">勾选后公告将对用户可见</div>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="w-4 h-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
              />
              <div>
                <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Pin size={14} />
                  置顶公告
                </div>
                <div className="text-xs text-muted-foreground">置顶的公告将始终显示在列表最前面</div>
              </div>
            </label>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                <Save size={14} />
                {isEditing ? '保存修改' : '创建公告'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// 主组件
// ============================================================

export default function AnnouncementListPage() {
  const queryClient = useQueryClient()

  // 筛选状态
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [publishedFilter, setPublishedFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  // 表单对话框状态
  const [formOpen, setFormOpen] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null)

  // 删除确认状态
  const [deletingAnnouncement, setDeletingAnnouncement] = useState<Announcement | null>(null)

  // 构建筛选参数
  const buildFilters = useCallback((): AnnouncementFilters => {
    const filters: AnnouncementFilters = {
      page,
      limit: PAGE_SIZE,
    }
    if (search.trim()) {
      filters.search = search.trim()
    }
    if (typeFilter) {
      filters.type = typeFilter as AnnouncementType
    }
    if (publishedFilter) {
      filters.isPublished = publishedFilter as 'true' | 'false'
    }
    return filters
  }, [page, search, typeFilter, publishedFilter])

  // 查询公告列表
  const {
    data: response,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['announcements', page, search, typeFilter, publishedFilter],
    queryFn: () => announcementsService.getAnnouncements(buildFilters()),
  })

  const announcements = response?.data?.announcements ?? []
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta
    ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE)))
    : 1

  // 发布/取消发布
  const togglePublishMutation = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      announcementsService.updateAnnouncement(id, { isPublished }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (err: Error) => {
      alert(`操作失败: ${err.message}`)
    },
  })

  // 删除公告
  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcementsService.deleteAnnouncement(id),
    onSuccess: () => {
      setDeletingAnnouncement(null)
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (err: Error) => {
      alert(`删除失败: ${err.message}`)
    },
  })

  // 置顶/取消置顶
  const togglePinMutation = useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      isPinned
        ? announcementsService.unpinAnnouncement(id)
        : announcementsService.pinAnnouncement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (err: Error) => {
      alert(`操作失败: ${err.message}`)
    },
  })

  // 事件处理
  const handleSearch = useCallback(() => {
    setPage(1)
  }, [])

  const handleClearFilters = useCallback(() => {
    setTypeFilter('')
    setPublishedFilter('')
    setSearch('')
    setPage(1)
  }, [])

  const handleOpenCreate = useCallback(() => {
    setEditingAnnouncement(null)
    setFormOpen(true)
  }, [])

  const handleOpenEdit = useCallback((announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    setFormOpen(true)
  }, [])

  const handleFormSuccess = useCallback(() => {
    setFormOpen(false)
    setEditingAnnouncement(null)
    queryClient.invalidateQueries({ queryKey: ['announcements'] })
  }, [queryClient])

  const handleTogglePublish = useCallback((announcement: Announcement) => {
    togglePublishMutation.mutate({
      id: announcement.id,
      isPublished: !announcement.isPublished,
    })
  }, [togglePublishMutation])

  const handleTogglePin = useCallback((announcement: Announcement) => {
    togglePinMutation.mutate({
      id: announcement.id,
      isPinned: announcement.isPinned,
    })
  }, [togglePinMutation])

  const handleDeleteConfirm = useCallback(() => {
    if (deletingAnnouncement) {
      deleteMutation.mutate(deletingAnnouncement.id)
    }
  }, [deletingAnnouncement, deleteMutation])

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">公告管理</h1>
          <p className="text-[13px] text-muted-foreground mt-1">管理系统公告和通知</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </Button>
          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="gap-1.5"
          >
            <Plus size={14} />
            创建公告
          </Button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索公告标题或内容..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch()
                }}
                className="pl-9"
              />
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5"
            >
              <Filter size={14} />
              筛选
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">类型</label>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {typeFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">发布状态</label>
                <select
                  value={publishedFilter}
                  onChange={(e) => {
                    setPublishedFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {publishedFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                  清除筛选
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 公告表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>公告信息</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>排序</TableHead>
                <TableHead>过期时间</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-40">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : announcements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    没有找到匹配的公告
                  </TableCell>
                </TableRow>
              ) : (
                announcements.map((announcement) => {
                  const typeBadge = getTypeBadge(announcement.type as AnnouncementType)
                  const isExpired = announcement.expiresAt && new Date(announcement.expiresAt) < new Date()

                  return (
                    <TableRow
                      key={announcement.id}
                      className={cn(
                        announcement.isPinned && 'bg-primary/[0.03] border-l-2 border-l-primary'
                      )}
                    >
                      <TableCell>
                        <div className="max-w-md">
                          <div className="flex items-center gap-2">
                            {announcement.isPinned && (
                              <span className="text-primary shrink-0" title="已置顶">
                                <Pin size={14} />
                              </span>
                            )}
                            <span className="text-muted-foreground">
                              {getTypeIcon(announcement.type as AnnouncementType)}
                            </span>
                            <p className="text-foreground font-medium truncate">
                              {announcement.title}
                            </p>
                          </div>
                          <p className="text-muted-foreground text-[13px] truncate mt-0.5">
                            {stripMarkdown(announcement.content, 80)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={typeBadge.className}>
                          {typeBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant="outline"
                            className={
                              announcement.isPublished
                                ? 'border-success/30 text-success bg-success/5'
                                : ''
                            }
                          >
                            {announcement.isPublished ? '已发布' : '草稿'}
                          </Badge>
                          {announcement.isPinned && (
                            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5">
                              已置顶
                            </Badge>
                          )}
                          {isExpired && (
                            <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5">
                              已过期
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-[13px] tabular-nums">{announcement.sortOrder}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-[13px]">
                          {announcement.expiresAt
                            ? formatDateTime(announcement.expiresAt)
                            : '永不过期'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-[13px]">
                          {formatDateTime(announcement.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleTogglePin(announcement)}
                            disabled={togglePinMutation.isPending}
                            className={cn(
                              'h-8 w-8',
                              announcement.isPinned
                                ? 'text-primary hover:text-muted-foreground'
                                : 'text-muted-foreground hover:text-primary'
                            )}
                            title={announcement.isPinned ? '取消置顶' : '置顶'}
                          >
                            {announcement.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleTogglePublish(announcement)}
                            disabled={togglePublishMutation.isPending}
                            className={cn(
                              'h-8 w-8',
                              announcement.isPublished
                                ? 'text-success hover:text-warning'
                                : 'text-muted-foreground hover:text-success'
                            )}
                            title={announcement.isPublished ? '取消发布' : '发布'}
                          >
                            {announcement.isPublished ? <Eye size={16} /> : <EyeOff size={16} />}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(announcement)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="编辑公告"
                          >
                            <Edit2 size={16} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingAnnouncement(announcement)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="删除公告"
                          >
                            <Trash2 size={16} />
                          </Button>
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
              <div className="text-[13px] text-muted-foreground tabular-nums">
                共 {total} 条记录，第 {page}/{totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="gap-1"
                >
                  <ChevronLeft size={14} />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="gap-1"
                >
                  下一页
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建/编辑公告对话框 */}
      <AnnouncementForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingAnnouncement(null)
        }}
        onSuccess={handleFormSuccess}
        announcement={editingAnnouncement}
      />

      {/* 删除确认对话框 */}
      {deletingAnnouncement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDeletingAnnouncement(null)}
          role="dialog"
          aria-modal="true"
        >
          <Card
            className="max-w-md w-full"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <ShieldAlert size={20} className="text-destructive" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">确认删除</h3>
              </div>
              <p className="text-muted-foreground mb-6">
                确定要删除公告 <span className="text-foreground font-medium">「{deletingAnnouncement.title}」</span> 吗？此操作不可恢复。
              </p>
              <div className="flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDeletingAnnouncement(null)}
                  disabled={deleteMutation.isPending}
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  <Trash2 size={14} />
                  删除
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
