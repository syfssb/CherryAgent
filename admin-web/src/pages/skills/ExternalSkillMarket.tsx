import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  ExternalLink,
  Trash2,
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
import {
  externalSkillsService,
  type ExternalSkill,
  type ExternalSkillFilters,
} from '@/services/external-skills'
import { ApiError } from '@/services/api'

const PAGE_SIZE = 20

const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已批准' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'imported', label: '已导入' },
]

const sourceFilterOptions = [
  { value: '', label: '全部来源' },
  { value: 'vercel-labs', label: 'Vercel Labs' },
  { value: 'anthropics', label: 'Anthropic' },
]

function getStatusBadge(status: string) {
  const variants: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    pending: {
      label: '待审核',
      className: 'bg-yellow-100 text-yellow-800',
      icon: <Clock className="h-3 w-3" />,
    },
    approved: {
      label: '已批准',
      className: 'bg-green-100 text-green-800',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    rejected: {
      label: '已拒绝',
      className: 'bg-red-100 text-red-800',
      icon: <XCircle className="h-3 w-3" />,
    },
    imported: {
      label: '已导入',
      className: 'bg-blue-100 text-blue-800',
      icon: <Package className="h-3 w-3" />,
    },
  }

  const variant = variants[status] || variants.pending
  return (
    <Badge className={cn('flex items-center gap-1', variant.className)}>
      {variant.icon}
      {variant.label}
    </Badge>
  )
}

export default function ExternalSkillMarket() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<ExternalSkillFilters>({
    status: '',
    source: '',
  })

  // 获取外部 skills 列表
  const { data, isLoading, error } = useQuery({
    queryKey: ['external-skills', page, filters],
    queryFn: () =>
      externalSkillsService.getExternalSkills({
        page,
        limit: PAGE_SIZE,
        ...filters,
      }),
  })

  // 抓取 skills mutation
  const fetchMutation = useMutation({
    mutationFn: () => externalSkillsService.fetchSkills(),
    onSuccess: (result) => {
      alert(`成功抓取 ${result.total} 个 skills\n新增: ${result.inserted}\n跳过: ${result.skipped}`)
      queryClient.invalidateQueries({ queryKey: ['external-skills'] })
    },
    onError: (error: ApiError) => {
      alert(`抓取失败: ${error.message}`)
    },
  })

  // 导入 skill mutation
  const importMutation = useMutation({
    mutationFn: (id: string) =>
      externalSkillsService.importSkill(id, { isDefault: true }),
    onSuccess: () => {
      alert('导入成功！')
      queryClient.invalidateQueries({ queryKey: ['external-skills'] })
    },
    onError: (error: ApiError) => {
      alert(`导入失败: ${error.message}`)
    },
  })

  // 更新状态 mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      externalSkillsService.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-skills'] })
    },
    onError: (error: ApiError) => {
      alert(`更新失败: ${error.message}`)
    },
  })

  // 删除 skill mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => externalSkillsService.deleteSkill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-skills'] })
    },
    onError: (error: ApiError) => {
      alert(`删除失败: ${error.message}`)
    },
  })

  const handleFetch = useCallback(() => {
    if (confirm('确定要从 GitHub 抓取外部 skills 吗？\n\n数据源：\n- vercel-labs/skills\n- anthropics/anthropic-quickstarts')) {
      fetchMutation.mutate()
    }
  }, [fetchMutation])

  const handleImport = useCallback(
    (skill: ExternalSkill) => {
      if (confirm(`确定要导入 "${skill.name}" 到系统吗？`)) {
        importMutation.mutate(skill.id)
      }
    },
    [importMutation]
  )

  const handleApprove = useCallback(
    (skill: ExternalSkill) => {
      updateStatusMutation.mutate({ id: skill.id, status: 'approved' })
    },
    [updateStatusMutation]
  )

  const handleReject = useCallback(
    (skill: ExternalSkill) => {
      updateStatusMutation.mutate({ id: skill.id, status: 'rejected' })
    },
    [updateStatusMutation]
  )

  const handleDelete = useCallback(
    (skill: ExternalSkill) => {
      if (confirm(`确定要删除 "${skill.name}" 吗？`)) {
        deleteMutation.mutate(skill.id)
      }
    },
    [deleteMutation]
  )

  const skills = data?.skills || []
  const totalPages = Math.ceil((skills.length || 0) / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">外部 Skill 市场</h1>
          <p className="text-sm text-muted-foreground mt-1">
            从 Vercel Labs 和 Anthropic 等优质来源抓取 skills
          </p>
        </div>
        <Button
          onClick={handleFetch}
          disabled={fetchMutation.isPending}
          className="gap-2"
        >
          {fetchMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          抓取外部 Skills
        </Button>
      </div>

      {/* 筛选器 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <select
              value={filters.status}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, status: e.target.value }))
                setPage(1)
              }}
              className="px-3 py-2 border rounded-md text-sm"
            >
              {statusFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={filters.source}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, source: e.target.value }))
                setPage(1)
              }}
              className="px-3 py-2 border rounded-md text-sm"
            >
              {sourceFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilters({ status: '', source: '' })
                setPage(1)
              }}
            >
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Skills 列表 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-600">
              加载失败: {(error as ApiError).message}
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mb-4 opacity-50" />
              <p>暂无外部 skills</p>
              <p className="text-sm mt-2">点击上方按钮抓取外部 skills</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>版本</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>抓取时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skills.map((skill) => (
                    <TableRow key={skill.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{skill.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {skill.description || '无描述'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <a
                          href={skill.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
                        >
                          {skill.source}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{skill.category || 'N/A'}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {skill.version || 'N/A'}
                      </TableCell>
                      <TableCell>{getStatusBadge(skill.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(skill.fetchedAt).toLocaleDateString('zh-CN')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {skill.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleApprove(skill)}
                                disabled={updateStatusMutation.isPending}
                              >
                                批准
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReject(skill)}
                                disabled={updateStatusMutation.isPending}
                              >
                                拒绝
                              </Button>
                            </>
                          )}
                          {(skill.status === 'approved' || skill.status === 'pending') &&
                            !skill.importedToPresetId && (
                              <Button
                                size="sm"
                                onClick={() => handleImport(skill)}
                                disabled={importMutation.isPending}
                              >
                                导入
                              </Button>
                            )}
                          {skill.status !== 'imported' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(skill)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    第 {page} 页，共 {totalPages} 页
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      下一页
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
