import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Database,
  AlertTriangle,
  Monitor,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

// ============================================================
// 类型
// ============================================================

interface SyncUserDetailData {
  user: {
    id: string
    email: string
    name: string | null
  }
  stats: {
    changesCount: number
    conflictsCount: number
    unresolvedConflictsCount: number
    devicesCount: number
  }
  devices: Array<{
    id: string
    deviceId: string
    lastSyncTime: number | null
    updatedAt: string
  }>
  recentChanges: Array<{
    id: string
    entityType: string
    entityId: string
    changeType: string
    data: unknown
    timestamp: number
    deviceId: string
  }>
  unresolvedConflicts: Array<{
    id: string
    entityType: string
    entityId: string
    localData: unknown
    remoteData: unknown
    localDeviceId: string
    remoteDeviceId: string
    localTimestamp: number
    remoteTimestamp: number
    createdAt: number
  }>
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

function getEntityTypeLabel(type: string): string {
  const map: Record<string, string> = {
    session: '会话',
    tag: '标签',
    memory_block: '记忆',
    skill: '技能',
    setting: '设置',
  }
  return map[type] ?? type
}

function getChangeTypeLabel(type: string): string {
  const map: Record<string, string> = {
    create: '创建',
    update: '更新',
    delete: '删除',
  }
  return map[type] ?? type
}

function getChangeTypeBadgeVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const map: Record<string, 'default' | 'secondary' | 'destructive'> = {
    create: 'default',
    update: 'secondary',
    delete: 'destructive',
  }
  return map[type] ?? 'outline'
}

function truncateId(id: string): string {
  if (id.length <= 16) return id
  return `${id.substring(0, 8)}...${id.substring(id.length - 8)}`
}

// ============================================================
// 空状态行
// ============================================================

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan}>
        <div className="text-center py-8 text-muted-foreground text-sm">{message}</div>
      </TableCell>
    </TableRow>
  )
}

// ============================================================
// 组件
// ============================================================

export default function SyncUserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()

  const { data: detail, isLoading } = useQuery({
    queryKey: ['sync-user-detail', userId],
    queryFn: async () => {
      const res = await api.get<SyncUserDetailData>(`/admin/sync/users/${userId}`)
      return res.data
    },
    enabled: !!userId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <span className="text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">未找到用户同步数据</p>
      </div>
    )
  }

  const statCards = [
    {
      label: '变更数',
      value: detail.stats.changesCount,
      icon: Database,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: '冲突数',
      value: detail.stats.conflictsCount,
      icon: AlertTriangle,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
    {
      label: '未解决冲突',
      value: detail.stats.unresolvedConflictsCount,
      icon: AlertTriangle,
      color: detail.stats.unresolvedConflictsCount > 0 ? 'text-destructive' : 'text-success',
      bg: detail.stats.unresolvedConflictsCount > 0 ? 'bg-destructive/10' : 'bg-success/10',
    },
    {
      label: '设备数',
      value: detail.stats.devicesCount,
      icon: Monitor,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
  ]

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/sync')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {detail.user.name || detail.user.email}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{detail.user.email}</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', card.bg)}>
                  <card.icon className={cn('w-5 h-5', card.color)} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-xl font-semibold text-foreground">{card.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 设备列表 */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-medium text-foreground">设备列表</h2>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>设备 ID</TableHead>
                <TableHead>最后同步时间</TableHead>
                <TableHead>更新时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.devices.length === 0 ? (
                <EmptyRow colSpan={3} message="暂无设备记录" />
              ) : (
                detail.devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      <span className="text-foreground/80 font-mono text-sm">
                        {truncateId(device.deviceId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {formatTimestamp(device.lastSyncTime)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {device.updatedAt ? new Date(device.updatedAt).toLocaleString('zh-CN') : '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 最近变更记录 */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-medium text-foreground">最近变更记录（最近 20 条）</h2>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>实体类型</TableHead>
                <TableHead>实体 ID</TableHead>
                <TableHead>操作</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>设备</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.recentChanges.length === 0 ? (
                <EmptyRow colSpan={5} message="暂无变更记录" />
              ) : (
                detail.recentChanges.map((change) => (
                  <TableRow key={change.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {getEntityTypeLabel(change.entityType)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground/80 font-mono text-sm">
                        {truncateId(change.entityId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getChangeTypeBadgeVariant(change.changeType)}>
                        {getChangeTypeLabel(change.changeType)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {formatTimestamp(change.timestamp)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-xs">
                        {truncateId(change.deviceId)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 未解决冲突 */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-medium text-foreground">
            未解决冲突
            {detail.unresolvedConflicts.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {detail.unresolvedConflicts.length}
              </Badge>
            )}
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>实体类型</TableHead>
                <TableHead>实体 ID</TableHead>
                <TableHead>本地设备</TableHead>
                <TableHead>远程设备</TableHead>
                <TableHead>本地时间</TableHead>
                <TableHead>远程时间</TableHead>
                <TableHead>创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.unresolvedConflicts.length === 0 ? (
                <EmptyRow colSpan={7} message="暂无未解决冲突" />
              ) : (
                detail.unresolvedConflicts.map((conflict) => (
                  <TableRow key={conflict.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {getEntityTypeLabel(conflict.entityType)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground/80 font-mono text-sm">
                        {truncateId(conflict.entityId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-xs">
                        {truncateId(conflict.localDeviceId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-xs">
                        {truncateId(conflict.remoteDeviceId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {formatTimestamp(conflict.localTimestamp)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {formatTimestamp(conflict.remoteTimestamp)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {formatTimestamp(conflict.createdAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
