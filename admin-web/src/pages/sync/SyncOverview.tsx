import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  Database,
  AlertTriangle,
  Monitor,
  Users,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

// ============================================================
// 类型
// ============================================================

interface SyncOverviewData {
  totalChanges: number
  totalConflicts: number
  unresolvedConflicts: number
  activeDevices: number
  activeUsers: number
}

interface SyncUser {
  userId: string
  email: string | null
  name: string | null
  changesCount: number
  conflictsCount: number
  unresolvedConflictsCount: number
  devicesCount: number
  lastSyncTime: number | null
}

// ============================================================
// 辅助函数
// ============================================================

function formatTimestamp(ts: number | null): string {
  if (!ts || ts === 0) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ts))
}

// ============================================================
// 组件
// ============================================================

export default function SyncOverview() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [showCleanup, setShowCleanup] = useState(false)
  const [cleanupDays, setCleanupDays] = useState(30)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  // 概览数据
  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['sync-overview'],
    queryFn: async () => {
      const res = await api.get<{ overview: SyncOverviewData }>('/admin/sync/overview')
      return res.data?.overview
    },
  })

  // 用户列表
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['sync-users', page],
    queryFn: async () => {
      const res = await api.get<{
        users: SyncUser[]
      }>('/admin/sync/users', { page, limit: PAGE_SIZE })
      return { users: res.data?.users ?? [], meta: res.meta }
    },
  })

  // 清理过期数据
  const cleanupMutation = useMutation({
    mutationFn: async (days: number) => {
      return api.post('/admin/sync/cleanup', { olderThanDays: days })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-overview'] })
      queryClient.invalidateQueries({ queryKey: ['sync-users'] })
      setShowCleanup(false)
    },
  })

  // 删除用户同步数据
  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      return api.delete(`/admin/sync/users/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-overview'] })
      queryClient.invalidateQueries({ queryKey: ['sync-users'] })
      setShowDeleteConfirm(null)
    },
  })

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sync-overview'] })
    queryClient.invalidateQueries({ queryKey: ['sync-users'] })
  }, [queryClient])

  const users = usersData?.users ?? []
  const total = usersData?.meta?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // 统计卡片配置
  const statCards = [
    {
      label: '总变更数',
      value: overviewData?.totalChanges ?? 0,
      icon: Database,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: '总冲突数',
      value: overviewData?.totalConflicts ?? 0,
      icon: AlertTriangle,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
    {
      label: '未解决冲突',
      value: overviewData?.unresolvedConflicts ?? 0,
      icon: AlertTriangle,
      color: (overviewData?.unresolvedConflicts ?? 0) > 0 ? 'text-destructive' : 'text-emerald-500',
      bg: (overviewData?.unresolvedConflicts ?? 0) > 0 ? 'bg-destructive/10' : 'bg-emerald-500/10',
    },
    {
      label: '活跃设备',
      value: overviewData?.activeDevices ?? 0,
      icon: Monitor,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      label: '活跃用户',
      value: overviewData?.activeUsers ?? 0,
      icon: Users,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
    },
  ]

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">同步管理</h1>
          <p className="text-[13px] text-muted-foreground mt-1">查看和管理用户数据同步状态</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowCleanup(true)}>
            <Trash2 className="w-3.5 h-3.5" />
            清理过期数据
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', card.bg)}>
                  <card.icon className={cn('w-5 h-5', card.color)} />
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground">{card.label}</p>
                  <p className="text-xl font-semibold text-foreground tabular-nums">
                    {overviewLoading ? '-' : card.value.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 用户同步列表 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>变更数</TableHead>
                <TableHead>冲突数</TableHead>
                <TableHead>未解决冲突</TableHead>
                <TableHead>设备数</TableHead>
                <TableHead>最后同步</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    暂无同步数据
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {user.username || '-'}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {user.changeCount?.toLocaleString() || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {user.conflictCount || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      {(user.unresolvedConflicts || 0) > 0 ? (
                        <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5">
                          {user.unresolvedConflicts}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/5">
                          0
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground tabular-nums">{user.devicesCount}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-[13px] text-muted-foreground">
                        {formatTimestamp(user.lastSyncTime)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/sync/users/${user.userId}`)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setShowDeleteConfirm(user.userId)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted-foreground tabular-nums">
            共 {total} 条记录，第 {page}/{totalPages} 页
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* 清理过期数据弹窗 */}
      {showCleanup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="w-96">
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">清理过期同步数据</h3>
              <div className="mb-4 space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">
                  删除多少天前的数据
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={cleanupDays}
                  onChange={(e) => setCleanupDays(Number(e.target.value))}
                  className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setShowCleanup(false)}>
                  取消
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={cleanupMutation.isPending}
                  onClick={() => cleanupMutation.mutate(cleanupDays)}
                >
                  {cleanupMutation.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 清理中...</>
                  ) : '确认清理'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="w-96">
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-2">确认删除</h3>
              <p className="text-sm text-muted-foreground mb-4">
                确定要清除该用户的所有同步数据吗？此操作不可撤销。
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(null)}>
                  取消
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(showDeleteConfirm)}
                >
                  {deleteMutation.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 删除中...</>
                  ) : '确认删除'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
