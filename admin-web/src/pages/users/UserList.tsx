import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  Download,
  Eye,
  Ban,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Users,
  UserCheck,
  UserX,
  Loader2,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  usersService,
  type AdminUser,
  type AdminUserFilters,
} from '@/services/users'
import { useAdminStore } from '@/store/useAdminStore'

const PAGE_SIZE = 20

const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'true', label: '正常' },
  { value: 'false', label: '已封禁' },
]

const roleFilterOptions = [
  { value: '', label: '全部角色' },
  { value: 'user', label: '普通用户' },
  { value: 'admin', label: '管理员' },
]

const sortOptions = [
  { value: 'createdAt', label: '注册时间' },
  { value: 'email', label: '邮箱' },
  { value: 'name', label: '名称' },
  { value: 'balance', label: '余额' },
]

function getUserDisplayName(user: AdminUser): string {
  if (user.name) return user.name
  return user.email.split('@')[0] ?? user.email
}

function formatBalance(balance: string, _currency?: string): string {
  const num = parseFloat(balance)
  return `${num.toFixed(2)} 积分`
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-[13px] text-muted-foreground mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function UserListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasPermission } = useAdminStore()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [sortBy, setSortBy] = useState<AdminUserFilters['sortBy']>('createdAt')
  const [sortOrder, setSortOrder] = useState<AdminUserFilters['sortOrder']>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  const [suspendingUser, setSuspendingUser] = useState<AdminUser | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [unsuspendingUser, setUnsuspendingUser] = useState<AdminUser | null>(null)
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null)
  const [exporting, setExporting] = useState(false)

  const buildFilters = useCallback((): AdminUserFilters => {
    const filters: AdminUserFilters = { page, limit: PAGE_SIZE, sortBy, sortOrder }
    if (search.trim()) filters.search = search.trim()
    if (statusFilter) filters.isActive = statusFilter
    if (roleFilter) filters.role = roleFilter as AdminUserFilters['role']
    return filters
  }, [page, search, statusFilter, roleFilter, sortBy, sortOrder])

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['users', page, search, statusFilter, roleFilter, sortBy, sortOrder],
    queryFn: () => usersService.getUsers(buildFilters()),
  })

  const users = response?.data?.users ?? []
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE))) : 1

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      usersService.suspendUser(id, reason),
    onSuccess: () => {
      setSuspendingUser(null)
      setSuspendReason('')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const unsuspendMutation = useMutation({
    mutationFn: (id: string) => usersService.unsuspendUser(id),
    onSuccess: () => {
      setUnsuspendingUser(null)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersService.deleteUser(id),
    onSuccess: () => {
      setDeletingUser(null)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const handleSearch = useCallback(() => setPage(1), [])

  const handleClearFilters = useCallback(() => {
    setStatusFilter('')
    setRoleFilter('')
    setSearch('')
    setSortBy('createdAt')
    setSortOrder('desc')
    setPage(1)
  }, [])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const res = await usersService.exportUsers(buildFilters())
      if (res.data?.url) window.open(res.data.url, '_blank')
    } catch {
      // silently fail
    } finally {
      setExporting(false)
    }
  }, [buildFilters])

  const activeCount = users.filter((u) => u.isActive).length
  const suspendedCount = users.filter((u) => !u.isActive).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">用户管理</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">管理系统中的所有用户</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-8 gap-1.5">
            <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="h-8 gap-1.5">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            导出
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[13px] text-muted-foreground">总用户数</p>
                <p className="text-2xl font-semibold tracking-tight text-foreground">
                  {total > 0 ? total : '-'}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                <Users size={18} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[13px] text-muted-foreground">正常用户</p>
                <p className="text-2xl font-semibold tracking-tight text-success">{activeCount}</p>
              </div>
              <div className="h-9 w-9 rounded-md bg-success/10 flex items-center justify-center text-success">
                <UserCheck size={18} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[13px] text-muted-foreground">已封禁</p>
                <p className="text-2xl font-semibold tracking-tight text-destructive">{suspendedCount}</p>
              </div>
              <div className="h-9 w-9 rounded-md bg-destructive/10 flex items-center justify-center text-destructive">
                <UserX size={18} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索用户邮箱或名称..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                className="pl-9"
              />
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="h-9 gap-1.5"
            >
              <Filter size={14} />
              筛选
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-4 gap-4">
              <SelectField
                label="状态"
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1) }}
                options={statusFilterOptions}
              />
              <SelectField
                label="角色"
                value={roleFilter}
                onChange={(v) => { setRoleFilter(v); setPage(1) }}
                options={roleFilterOptions}
              />
              <SelectField
                label="排序"
                value={sortBy ?? 'createdAt'}
                onChange={(v) => { setSortBy(v as AdminUserFilters['sortBy']); setPage(1) }}
                options={sortOptions}
              />
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <SelectField
                    label="方向"
                    value={sortOrder ?? 'desc'}
                    onChange={(v) => { setSortOrder(v as AdminUserFilters['sortOrder']); setPage(1) }}
                    options={[
                      { value: 'desc', label: '降序' },
                      { value: 'asc', label: '升序' },
                    ]}
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-9">
                  清除筛选
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-destructive flex-shrink-0 mt-0.5" size={18} />
            <div className="flex-1">
              <p className="text-sm text-destructive">
                加载用户列表失败: {error instanceof Error ? error.message : '未知错误'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 text-xs text-destructive hover:text-destructive">
              重试
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>余额</TableHead>
                <TableHead className="hidden md:table-cell">总充值</TableHead>
                <TableHead className="hidden md:table-cell">总消费</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="hidden lg:table-cell">注册时间</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    没有找到匹配的用户
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const displayName = getUserDisplayName(user)
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[13px] font-medium text-foreground">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-[13px] font-medium text-foreground">{displayName}</p>
                            <p className="text-[12px] text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role === 'admin' ? '管理员' : '普通用户'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-[13px] font-medium text-foreground tabular-nums">
                          {formatBalance(user.balance.current, user.balance.currency)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-[13px] text-muted-foreground tabular-nums">
                          {formatBalance(user.balance.totalDeposited, user.balance.currency)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-[13px] text-muted-foreground tabular-nums">
                          {formatBalance(user.balance.totalSpent, user.balance.currency)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {user.isActive ? (
                          <Badge variant="outline" className="border-success/30 text-success bg-success/5">正常</Badge>
                        ) : (
                          <Badge variant="destructive">已封禁</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-[13px] text-muted-foreground">
                          {formatDateTime(user.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigate(`/users/${user.id}`)}
                          >
                            <Eye size={14} />
                          </Button>
                          {hasPermission('users:suspend') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'h-7 w-7',
                              user.isActive
                                ? 'hover:text-destructive'
                                : 'text-destructive hover:text-success'
                            )}
                            onClick={() => {
                              if (user.isActive) {
                                setSuspendingUser(user)
                                setSuspendReason('')
                              } else {
                                setUnsuspendingUser(user)
                              }
                            }}
                            disabled={suspendMutation.isPending || unsuspendMutation.isPending}
                          >
                            {user.isActive ? <Ban size={14} /> : <ShieldCheck size={14} />}
                          </Button>
                          )}
                          {hasPermission('users:write') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingUser(user)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 size={14} />
                          </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-[13px] text-muted-foreground">
                共 {total} 条，第 {page}/{totalPages} 页
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="h-7 gap-1"
                >
                  <ChevronLeft size={14} />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="h-7 gap-1"
                >
                  下一页
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suspend Dialog */}
      {hasPermission('users:suspend') && suspendingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setSuspendingUser(null); setSuspendReason('') }}>
          <div className="bg-background rounded-lg border border-border p-6 max-w-md w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-destructive/10 flex items-center justify-center">
                  <ShieldAlert size={18} className="text-destructive" />
                </div>
                <h3 className="text-base font-semibold text-foreground">确认封禁</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSuspendingUser(null); setSuspendReason('') }}>
                <X size={14} />
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground mb-4">
              确定要封禁用户{' '}
              <span className="text-foreground font-medium">
                {getUserDisplayName(suspendingUser)}（{suspendingUser.email}）
              </span>
              {' '}吗？封禁后该用户将无法登录，所有 API Key 将被禁用。
            </p>
            <div className="mb-5">
              <label className="block text-[13px] text-muted-foreground mb-1.5">
                封禁原因 <span className="text-destructive">*</span>
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="请输入封禁原因..."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-24 resize-none"
                maxLength={500}
              />
              <p className="text-[12px] text-muted-foreground mt-1 tabular-nums">{suspendReason.length}/500</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setSuspendingUser(null); setSuspendReason('') }} disabled={suspendMutation.isPending}>
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (suspendingUser && suspendReason.trim()) {
                    suspendMutation.mutate({ id: suspendingUser.id, reason: suspendReason.trim() })
                  }
                }}
                disabled={!suspendReason.trim() || suspendMutation.isPending}
                className="gap-1.5"
              >
                {suspendMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                <Ban size={14} />
                确认封禁
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Unsuspend Dialog */}
      {hasPermission('users:suspend') && unsuspendingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setUnsuspendingUser(null)}>
          <div className="bg-background rounded-lg border border-border p-6 max-w-md w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-success/10 flex items-center justify-center">
                  <ShieldCheck size={18} className="text-success" />
                </div>
                <h3 className="text-base font-semibold text-foreground">确认解封</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setUnsuspendingUser(null)}>
                <X size={14} />
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground mb-5">
              确定要解封用户{' '}
              <span className="text-foreground font-medium">
                {getUserDisplayName(unsuspendingUser)}（{unsuspendingUser.email}）
              </span>
              {' '}吗？解封后该用户将恢复正常使用。
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setUnsuspendingUser(null)} disabled={unsuspendMutation.isPending}>
                取消
              </Button>
              <Button
                size="sm"
                onClick={() => { if (unsuspendingUser) unsuspendMutation.mutate(unsuspendingUser.id) }}
                disabled={unsuspendMutation.isPending}
                className="gap-1.5"
              >
                {unsuspendMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                <ShieldCheck size={14} />
                确认解封
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {hasPermission('users:write') && deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingUser(null)}>
          <div className="bg-background rounded-lg border border-border p-6 max-w-md w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-destructive/10 flex items-center justify-center">
                  <Trash2 size={18} className="text-destructive" />
                </div>
                <h3 className="text-base font-semibold text-foreground">确认删除用户</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingUser(null)}>
                <X size={14} />
              </Button>
            </div>
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-destructive">
                此操作不可恢复！将彻底删除该用户及其所有关联数据（余额、交易记录、使用记录、签到记录等）。
              </p>
            </div>
            <p className="text-[13px] text-muted-foreground mb-5">
              确定要彻底删除用户{' '}
              <span className="text-foreground font-medium">
                {getUserDisplayName(deletingUser)}（{deletingUser.email}）
              </span>
              {' '}吗？
            </p>
            {deleteMutation.isError && (
              <p className="text-[13px] text-destructive mb-4">
                删除失败: {deleteMutation.error instanceof Error ? deleteMutation.error.message : '未知错误'}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeletingUser(null)} disabled={deleteMutation.isPending}>
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { if (deletingUser) deleteMutation.mutate(deletingUser.id) }}
                disabled={deleteMutation.isPending}
                className="gap-1.5"
              >
                {deleteMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                <Trash2 size={14} />
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
