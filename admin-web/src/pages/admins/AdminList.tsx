import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  KeyRound,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatDateTime } from '@/lib/utils'
import {
  adminsService,
  type AdminMetaData,
  type AdminProfile,
  type AdminRole,
  type AdminsListFilters,
  type AssignableAdminRole,
  type CreateAdminRequest,
  type UpdateAdminRequest,
} from '@/services/admins'

const PAGE_SIZE = 20

const roleFilterOptions: Array<{ value: '' | AdminRole; label: string }> = [
  { value: '', label: '全部角色' },
  { value: 'super_admin', label: '超级管理员' },
  { value: 'admin', label: '管理员' },
  { value: 'operator', label: '操作员' },
  { value: 'viewer', label: '查看者' },
]

const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'true', label: '启用' },
  { value: 'false', label: '停用' },
]

const sortOptions: Array<{ value: NonNullable<AdminsListFilters['sortBy']>; label: string }> = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'lastLoginAt', label: '最后登录' },
  { value: 'username', label: '用户名' },
  { value: 'email', label: '邮箱' },
]

const CATEGORY_LABELS: Record<string, string> = {
  users: '用户管理',
  finance: '财务管理',
  channels: '渠道管理',
  models: '模型管理',
  versions: '版本管理',
  dashboard: '仪表盘',
  logs: '日志查看',
  config: '配置管理',
  misc: '其他',
}

interface SelectFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

interface PermissionsSelectorProps {
  selectedRole: AdminRole
  selectedPermissions: string[]
  meta?: AdminMetaData
  onTogglePermission: (permission: string) => void
  disabled?: boolean
}

interface CreateFormState {
  username: string
  email: string
  password: string
  role: AssignableAdminRole
  isActive: boolean
  customPermissions: string[]
}

interface EditFormState {
  email: string
  role: AdminRole
  isActive: boolean
  customPermissions: string[]
}

function getRoleLabel(role: AdminRole): string {
  const map: Record<AdminRole, string> = {
    super_admin: '超级管理员',
    admin: '管理员',
    operator: '操作员',
    viewer: '查看者',
  }
  return map[role]
}

function getRoleBadge(role: AdminRole) {
  if (role === 'super_admin') {
    return { variant: 'destructive' as const, label: getRoleLabel(role), className: '' }
  }
  if (role === 'admin') {
    return { variant: 'default' as const, label: getRoleLabel(role), className: '' }
  }
  if (role === 'operator') {
    return { variant: 'secondary' as const, label: getRoleLabel(role), className: '' }
  }
  return { variant: 'outline' as const, label: getRoleLabel(role), className: '' }
}

function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  return (
    <div>
      <label className="block text-[13px] text-muted-foreground mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

function PermissionsSelector({
  selectedRole,
  selectedPermissions,
  meta,
  onTogglePermission,
  disabled = false,
}: PermissionsSelectorProps) {
  const permissions = meta?.permissions ?? []
  const rolePermissions = meta?.rolePermissions

  const defaultPermissions = selectedRole === 'super_admin'
    ? permissions.map((item) => item.key)
    : rolePermissions?.[selectedRole] ?? []

  const defaultSet = new Set(defaultPermissions)

  const groupedPermissions = permissions.reduce<Record<string, typeof permissions>>((acc, item) => {
    const category = item.category || 'misc'
    const current = acc[category] ?? []
    current.push(item)
    acc[category] = current
    return acc
  }, {})

  if (permissions.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        暂无可配置权限
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          角色默认权限会自动生效（灰色不可编辑）。这里选择的是额外附加权限。
        </p>
      </div>
      {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
        <div key={category} className="rounded-md border border-border">
          <div className="px-3 py-2 border-b border-border bg-muted/10">
            <p className="text-xs font-medium text-foreground">
              {CATEGORY_LABELS[category] || category}
            </p>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {categoryPermissions.map((permission) => {
              const isDefaultPermission = defaultSet.has(permission.key)
              const checked = isDefaultPermission || selectedPermissions.includes(permission.key)
              return (
                <label
                  key={permission.key}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors',
                    isDefaultPermission
                      ? 'border-border bg-muted/30 text-muted-foreground'
                      : 'border-border hover:bg-accent',
                    disabled && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={checked}
                    disabled={disabled || isDefaultPermission}
                    onChange={() => onTogglePermission(permission.key)}
                  />
                  <span className="flex-1 min-w-0 truncate">{permission.label || permission.key}</span>
                  {isDefaultPermission && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      默认
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function getDefaultCreateForm(meta?: AdminMetaData): CreateFormState {
  const defaultRole = meta?.assignableRoles?.includes('operator') ? 'operator' : (meta?.assignableRoles?.[0] ?? 'admin')
  return {
    username: '',
    email: '',
    password: '',
    role: defaultRole,
    isActive: true,
    customPermissions: [],
  }
}

export default function AdminListPage() {
  const queryClient = useQueryClient()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'' | AdminRole>('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState<NonNullable<AdminsListFilters['sortBy']>>('createdAt')
  const [sortOrder, setSortOrder] = useState<NonNullable<AdminsListFilters['sortOrder']>>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  const [createOpen, setCreateOpen] = useState(false)
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null)
  const [resettingAdmin, setResettingAdmin] = useState<AdminProfile | null>(null)
  const [deletingAdmin, setDeletingAdmin] = useState<AdminProfile | null>(null)

  const [createForm, setCreateForm] = useState<CreateFormState>(getDefaultCreateForm())
  const [createValidationError, setCreateValidationError] = useState('')

  const [editForm, setEditForm] = useState<EditFormState>({
    email: '',
    role: 'admin',
    isActive: true,
    customPermissions: [],
  })
  const [editValidationError, setEditValidationError] = useState('')

  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [resetValidationError, setResetValidationError] = useState('')

  const buildFilters = useCallback((): AdminsListFilters => {
    const filters: AdminsListFilters = {
      page,
      limit: PAGE_SIZE,
      search: search || undefined,
      role: roleFilter || undefined,
      isActive: statusFilter || undefined,
      sortBy,
      sortOrder,
    }
    return filters
  }, [page, roleFilter, search, sortBy, sortOrder, statusFilter])

  const {
    data: metaResponse,
    isLoading: isMetaLoading,
    isError: isMetaError,
    error: metaError,
    refetch: refetchMeta,
  } = useQuery({
    queryKey: ['admins-meta'],
    queryFn: () => adminsService.getAdminsMeta(),
  })

  const {
    data: listResponse,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admins', page, search, roleFilter, statusFilter, sortBy, sortOrder],
    queryFn: () => adminsService.getAdmins(buildFilters()),
  })

  const {
    data: detailResponse,
    isLoading: isDetailLoading,
    isError: isDetailError,
    error: detailError,
  } = useQuery({
    queryKey: ['admin-detail', editingAdminId],
    queryFn: () => adminsService.getAdmin(editingAdminId!),
    enabled: Boolean(editingAdminId),
  })

  const adminMeta = metaResponse?.data
  const admins = listResponse?.data?.admins ?? []
  const stats = listResponse?.data?.stats
  const pagingMeta = listResponse?.meta
  const total = pagingMeta?.total ?? stats?.total ?? 0
  const totalPages = pagingMeta ? Math.max(1, Math.ceil(total / (pagingMeta.limit || PAGE_SIZE))) : 1
  const editingAdmin = detailResponse?.data?.admin
  const editingIsSuperAdmin = editingAdmin?.role === 'super_admin'
  const assignableRoles: AssignableAdminRole[] = adminMeta?.assignableRoles ?? ['admin', 'operator', 'viewer']

  useEffect(() => {
    if (!adminMeta) return
    setCreateForm((prev) => {
      if (prev.role && adminMeta.assignableRoles.includes(prev.role)) {
        return prev
      }
      return {
        ...prev,
        role: adminMeta.assignableRoles[0] ?? 'admin',
      }
    })
  }, [adminMeta])

  useEffect(() => {
    if (!editingAdmin) return
    setEditForm({
      email: editingAdmin.email ?? '',
      role: editingAdmin.role,
      isActive: editingAdmin.isActive,
      customPermissions: editingAdmin.customPermissions ?? [],
    })
  }, [editingAdmin])

  const createMutation = useMutation({
    mutationFn: (payload: CreateAdminRequest) => adminsService.createAdmin(payload),
    onSuccess: () => {
      setCreateOpen(false)
      setCreateValidationError('')
      setCreateForm(getDefaultCreateForm(adminMeta))
      queryClient.invalidateQueries({ queryKey: ['admins'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAdminRequest }) =>
      adminsService.updateAdmin(id, payload),
    onSuccess: () => {
      setEditingAdminId(null)
      setEditValidationError('')
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      queryClient.invalidateQueries({ queryKey: ['admin-detail'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminsService.deleteAdmin(id),
    onSuccess: () => {
      setDeletingAdmin(null)
      queryClient.invalidateQueries({ queryKey: ['admins'] })
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      adminsService.resetAdminPassword(id, newPassword),
    onSuccess: () => {
      setResettingAdmin(null)
      setResetPassword('')
      setResetPasswordConfirm('')
      setResetValidationError('')
    },
  })

  const handleSearch = useCallback(() => {
    setSearch(searchInput.trim())
    setPage(1)
  }, [searchInput])

  const handleClearFilters = useCallback(() => {
    setSearchInput('')
    setSearch('')
    setRoleFilter('')
    setStatusFilter('')
    setSortBy('createdAt')
    setSortOrder('desc')
    setPage(1)
  }, [])

  const toggleCreatePermission = useCallback((permission: string) => {
    setCreateForm((prev) => {
      const exists = prev.customPermissions.includes(permission)
      return {
        ...prev,
        customPermissions: exists
          ? prev.customPermissions.filter((item) => item !== permission)
          : [...prev.customPermissions, permission],
      }
    })
  }, [])

  const toggleEditPermission = useCallback((permission: string) => {
    setEditForm((prev) => {
      const exists = prev.customPermissions.includes(permission)
      return {
        ...prev,
        customPermissions: exists
          ? prev.customPermissions.filter((item) => item !== permission)
          : [...prev.customPermissions, permission],
      }
    })
  }, [])

  const openCreateDialog = () => {
    setCreateForm(getDefaultCreateForm(adminMeta))
    setCreateValidationError('')
    createMutation.reset()
    setCreateOpen(true)
  }

  const closeCreateDialog = () => {
    setCreateOpen(false)
    setCreateValidationError('')
    createMutation.reset()
  }

  const closeEditDialog = () => {
    setEditingAdminId(null)
    setEditValidationError('')
    updateMutation.reset()
  }

  const closeResetDialog = () => {
    setResettingAdmin(null)
    setResetPassword('')
    setResetPasswordConfirm('')
    setResetValidationError('')
    resetPasswordMutation.reset()
  }

  const submitCreate = () => {
    const username = createForm.username.trim()
    const password = createForm.password.trim()

    if (!username) {
      setCreateValidationError('请输入用户名')
      return
    }
    if (!password) {
      setCreateValidationError('请输入初始密码')
      return
    }
    if (password.length < 8) {
      setCreateValidationError('初始密码至少 8 个字符')
      return
    }

    const payload: CreateAdminRequest = {
      username,
      password,
      role: createForm.role,
      isActive: createForm.isActive,
      permissions: createForm.customPermissions,
    }

    const email = createForm.email.trim()
    if (email) {
      payload.email = email
    }

    setCreateValidationError('')
    createMutation.mutate(payload)
  }

  const submitEdit = () => {
    if (!editingAdmin) return

    const email = editForm.email.trim()
    const payload: UpdateAdminRequest = {}

    if (email) {
      payload.email = email
    }

    if (!editingIsSuperAdmin) {
      if (editForm.role === 'super_admin') {
        setEditValidationError('不允许将管理员提升为超级管理员')
        return
      }
      payload.role = editForm.role as AssignableAdminRole
      payload.isActive = editForm.isActive
      payload.permissions = editForm.customPermissions
    }

    if (Object.keys(payload).length === 0) {
      setEditValidationError('没有可提交的更新项')
      return
    }

    setEditValidationError('')
    updateMutation.mutate({ id: editingAdmin.id, payload })
  }

  const submitResetPassword = () => {
    if (!resettingAdmin) return

    if (!resetPassword.trim()) {
      setResetValidationError('请输入新密码')
      return
    }
    if (resetPassword.trim().length < 8) {
      setResetValidationError('新密码至少 8 个字符')
      return
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetValidationError('两次输入的新密码不一致')
      return
    }

    setResetValidationError('')
    resetPasswordMutation.mutate({ id: resettingAdmin.id, newPassword: resetPassword.trim() })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">管理员管理</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">管理后台管理员账号、角色和权限</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { void refetch(); void refetchMeta() }} disabled={isFetching} className="h-8 gap-1.5">
            <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
            刷新
          </Button>
          <Button size="sm" onClick={openCreateDialog} className="h-8 gap-1.5">
            <ShieldCheck size={14} />
            新建管理员
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[13px] text-muted-foreground">总管理员</p>
                <p className="text-2xl font-semibold tracking-tight text-foreground">{stats?.total ?? '-'}</p>
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
                <p className="text-[13px] text-muted-foreground">活跃管理员</p>
                <p className="text-2xl font-semibold tracking-tight text-success">{stats?.active ?? '-'}</p>
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
                <p className="text-[13px] text-muted-foreground">停用管理员</p>
                <p className="text-2xl font-semibold tracking-tight text-destructive">{stats?.inactive ?? '-'}</p>
              </div>
              <div className="h-9 w-9 rounded-md bg-destructive/10 flex items-center justify-center text-destructive">
                <UserX size={18} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <p className="text-[13px] text-muted-foreground">角色分布</p>
                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                  <Shield size={18} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {(['super_admin', 'admin', 'operator', 'viewer'] as AdminRole[]).map((role) => (
                  <div key={role} className="flex items-center justify-between text-muted-foreground">
                    <span>{getRoleLabel(role)}</span>
                    <span className="tabular-nums text-foreground font-medium">{stats?.byRole?.[role] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索用户名或邮箱..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleSearch} className="h-9">搜索</Button>
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
                label="角色"
                value={roleFilter}
                onChange={(value) => { setRoleFilter(value as '' | AdminRole); setPage(1) }}
                options={roleFilterOptions}
              />
              <SelectField
                label="状态"
                value={statusFilter}
                onChange={(value) => { setStatusFilter(value); setPage(1) }}
                options={statusFilterOptions}
              />
              <SelectField
                label="排序"
                value={sortBy}
                onChange={(value) => { setSortBy(value as NonNullable<AdminsListFilters['sortBy']>); setPage(1) }}
                options={sortOptions}
              />
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <SelectField
                    label="方向"
                    value={sortOrder}
                    onChange={(value) => { setSortOrder(value as 'asc' | 'desc'); setPage(1) }}
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

      {(isError || isMetaError) && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-destructive flex-shrink-0 mt-0.5" size={18} />
            <div className="flex-1">
              <p className="text-sm text-destructive">
                {isError && `加载管理员列表失败: ${error instanceof Error ? error.message : '未知错误'}`}
                {isMetaError && `加载权限元数据失败: ${metaError instanceof Error ? metaError.message : '未知错误'}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { void refetch(); void refetchMeta() }} className="h-7 text-xs text-destructive hover:text-destructive">
              重试
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="hidden lg:table-cell">最后登录</TableHead>
                <TableHead className="hidden lg:table-cell">创建时间</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading || isMetaLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : admins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    没有找到匹配的管理员
                  </TableCell>
                </TableRow>
              ) : (
                admins.map((admin) => {
                  const roleBadge = getRoleBadge(admin.role)
                  const isSuperAdmin = admin.role === 'super_admin'
                  return (
                    <TableRow key={admin.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[13px] font-medium text-foreground">
                            {admin.username.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[13px] font-medium text-foreground">{admin.username}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-[13px] text-muted-foreground">{admin.email || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadge.variant} className={roleBadge.className}>
                          {roleBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {admin.isActive ? (
                          <Badge variant="outline" className="border-success/30 text-success bg-success/5">启用</Badge>
                        ) : (
                          <Badge variant="secondary">停用</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-[13px] text-muted-foreground">
                        {admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-[13px] text-muted-foreground">
                        {formatDateTime(admin.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              updateMutation.reset()
                              setEditValidationError('')
                              setEditingAdminId(admin.id)
                            }}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              resetPasswordMutation.reset()
                              setResetValidationError('')
                              setResettingAdmin(admin)
                            }}
                          >
                            <KeyRound size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            disabled={isSuperAdmin}
                            title={isSuperAdmin ? '超级管理员不可删除' : '删除管理员'}
                            onClick={() => {
                              if (!isSuperAdmin) setDeletingAdmin(admin)
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

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

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeCreateDialog}>
          <div className="bg-background rounded-lg border border-border p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-lg" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <ShieldCheck size={18} className="text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">新建管理员</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeCreateDialog}>
                <X size={14} />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">用户名 *</label>
                <Input
                  value={createForm.username}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, username: event.target.value }))}
                  placeholder="请输入管理员用户名"
                />
              </div>
              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">邮箱</label>
                <Input
                  value={createForm.email}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="请输入邮箱（可选）"
                />
              </div>
              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">初始密码 *</label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="至少 8 位"
                />
              </div>
              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">角色</label>
                <select
                  value={createForm.role}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value as AssignableAdminRole }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>{getRoleLabel(role)}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={createForm.isActive}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                    className="h-4 w-4"
                  />
                  创建后立即启用
                </label>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[13px] text-muted-foreground mb-2">自定义权限</label>
              <PermissionsSelector
                selectedRole={createForm.role}
                selectedPermissions={createForm.customPermissions}
                meta={adminMeta}
                onTogglePermission={toggleCreatePermission}
              />
            </div>

            {(createValidationError || createMutation.isError) && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {createValidationError || (createMutation.error instanceof Error ? createMutation.error.message : '创建失败')}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={closeCreateDialog} disabled={createMutation.isPending}>
                取消
              </Button>
              <Button size="sm" onClick={submitCreate} disabled={createMutation.isPending} className="gap-1.5">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                创建管理员
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingAdminId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeEditDialog}>
          <div className="bg-background rounded-lg border border-border p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-lg" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                  <Pencil size={18} className="text-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground">编辑管理员</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeEditDialog}>
                <X size={14} />
              </Button>
            </div>

            {isDetailLoading ? (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : isDetailError ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                加载管理员详情失败：{detailError instanceof Error ? detailError.message : '未知错误'}
              </div>
            ) : editingAdmin ? (
              <>
                {editingIsSuperAdmin && (
                  <div className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
                    超级管理员仅允许修改邮箱，角色、激活状态和权限不可编辑。
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-[13px] text-muted-foreground mb-1.5">用户名</label>
                    <Input value={editingAdmin.username} disabled />
                  </div>
                  <div>
                    <label className="block text-[13px] text-muted-foreground mb-1.5">邮箱</label>
                    <Input
                      value={editForm.email}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
                      placeholder="请输入邮箱（可选）"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] text-muted-foreground mb-1.5">角色</label>
                    <select
                      value={editForm.role}
                      disabled={editingIsSuperAdmin}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value as AdminRole }))}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                    >
                      {editingIsSuperAdmin ? (
                        <option value="super_admin">{getRoleLabel('super_admin')}</option>
                      ) : (
                        assignableRoles.map((role) => (
                          <option key={role} value={role}>{getRoleLabel(role)}</option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={editForm.isActive}
                        disabled={editingIsSuperAdmin}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                        className="h-4 w-4"
                      />
                      启用管理员
                    </label>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-[13px] text-muted-foreground mb-2">自定义权限</label>
                  <PermissionsSelector
                    selectedRole={editForm.role}
                    selectedPermissions={editForm.customPermissions}
                    meta={adminMeta}
                    onTogglePermission={toggleEditPermission}
                    disabled={editingIsSuperAdmin}
                  />
                </div>

                {(editValidationError || updateMutation.isError) && (
                  <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    {editValidationError || (updateMutation.error instanceof Error ? updateMutation.error.message : '更新失败')}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={closeEditDialog} disabled={updateMutation.isPending}>
                    取消
                  </Button>
                  <Button size="sm" onClick={submitEdit} disabled={updateMutation.isPending} className="gap-1.5">
                    {updateMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                    保存修改
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {resettingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeResetDialog}>
          <div className="bg-background rounded-lg border border-border p-6 max-w-md w-full shadow-lg" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                  <KeyRound size={18} className="text-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground">重置密码</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeResetDialog}>
                <X size={14} />
              </Button>
            </div>

            <p className="text-[13px] text-muted-foreground mb-4">
              为管理员 <span className="text-foreground font-medium">{resettingAdmin.username}</span> 设置新密码。
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">新密码 *</label>
                <Input
                  type="password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  placeholder="至少 8 位"
                />
              </div>
              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">确认新密码 *</label>
                <Input
                  type="password"
                  value={resetPasswordConfirm}
                  onChange={(event) => setResetPasswordConfirm(event.target.value)}
                  placeholder="请再次输入新密码"
                />
              </div>
            </div>

            {(resetValidationError || resetPasswordMutation.isError) && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {resetValidationError || (resetPasswordMutation.error instanceof Error ? resetPasswordMutation.error.message : '重置失败')}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={closeResetDialog} disabled={resetPasswordMutation.isPending}>
                取消
              </Button>
              <Button size="sm" onClick={submitResetPassword} disabled={resetPasswordMutation.isPending} className="gap-1.5">
                {resetPasswordMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                确认重置
              </Button>
            </div>
          </div>
        </div>
      )}

      {deletingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingAdmin(null)}>
          <div className="bg-background rounded-lg border border-border p-6 max-w-md w-full shadow-lg" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-destructive/10 flex items-center justify-center">
                  <Trash2 size={18} className="text-destructive" />
                </div>
                <h3 className="text-base font-semibold text-foreground">确认删除管理员</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingAdmin(null)}>
                <X size={14} />
              </Button>
            </div>

            <p className="text-[13px] text-muted-foreground mb-4">
              确定要删除管理员 <span className="text-foreground font-medium">{deletingAdmin.username}</span> 吗？删除后该账号将无法登录后台。
            </p>

            {deleteMutation.isError && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {deleteMutation.error instanceof Error ? deleteMutation.error.message : '删除失败'}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeletingAdmin(null)} disabled={deleteMutation.isPending}>
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate(deletingAdmin.id)}
                disabled={deleteMutation.isPending}
                className="gap-1.5"
              >
                {deleteMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
