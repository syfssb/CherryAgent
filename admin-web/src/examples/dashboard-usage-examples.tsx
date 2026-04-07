/**
 * 仪表盘数据获取示例
 *
 * 本文件展示如何在其他页面中使用仪表盘数据服务
 */

import { useQuery } from '@tanstack/react-query'
import { dashboardService } from '@/services/dashboard'

/**
 * 示例 1: 基础用法 - 获取 7 天统计数据
 */
export function Example1_BasicUsage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats', '7d'],
    queryFn: () => dashboardService.getStats('7d'),
  })

  if (isLoading) return <div>加载中...</div>
  if (error) return <div>错误: {error.message}</div>
  if (!data?.data) return <div>暂无数据</div>

  const stats = data.data

  return (
    <div>
      <h2>总用户数: {stats.users.total}</h2>
      <h2>当期收入: {stats.revenue.current} 积分</h2>
      <h2>API 请求: {stats.api.requests}</h2>
    </div>
  )
}

/**
 * 示例 2: 高级用法 - 自定义配置
 */
export function Example2_AdvancedUsage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-stats', '30d'],
    queryFn: () => dashboardService.getStats('30d'),
    retry: 3,                   // 失败重试 3 次
    retryDelay: 1000,           // 重试延迟 1 秒
    staleTime: 1000 * 60 * 5,   // 5 分钟内数据视为新鲜
    gcTime: 1000 * 60 * 30,     // 30 分钟后清除缓存
    refetchInterval: 1000 * 60, // 每分钟自动刷新
  })

  const handleRefresh = () => {
    refetch()
  }

  return (
    <div>
      <button onClick={handleRefresh}>刷新数据</button>
      {isLoading && <div>加载中...</div>}
      {error && <div>错误: {error.message}</div>}
      {data?.data && (
        <div>
          <p>新用户: {data.data.users.new}</p>
          <p>增长率: {data.data.users.newGrowth}%</p>
        </div>
      )}
    </div>
  )
}

/**
 * 示例 3: 多数据源组合
 */
export function Example3_MultipleQueries() {
  // 获取统计数据
  const statsQuery = useQuery({
    queryKey: ['dashboard-stats', '7d'],
    queryFn: () => dashboardService.getStats('7d'),
  })

  // 获取 API 统计
  const apiStatsQuery = useQuery({
    queryKey: ['dashboard-api-stats', '7d'],
    queryFn: () => dashboardService.getApiStats('7d'),
  })

  const isLoading = statsQuery.isLoading || apiStatsQuery.isLoading
  const hasError = statsQuery.error || apiStatsQuery.error

  if (isLoading) return <div>加载中...</div>
  if (hasError) return <div>加载失败</div>

  const stats = statsQuery.data?.data
  const apiStats = apiStatsQuery.data?.data

  return (
    <div>
      <h2>综合统计</h2>
      <p>总用户: {stats?.users.total}</p>
      <p>热门模型: {apiStats?.byModel[0]?.model}</p>
      <p>成功率: {apiStats?.byModel[0]?.successRate}%</p>
    </div>
  )
}

/**
 * 示例 4: 条件查询
 */
export function Example4_ConditionalQuery() {
  const [enabled, setEnabled] = useState(false)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d')

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats', timeRange],
    queryFn: () => dashboardService.getStats(timeRange),
    enabled, // 仅在 enabled 为 true 时执行查询
  })

  return (
    <div>
      <button onClick={() => setEnabled(true)}>
        开始加载数据
      </button>
      <select
        value={timeRange}
        onChange={(e) => setTimeRange(e.target.value as any)}
      >
        <option value="7d">7天</option>
        <option value="30d">30天</option>
        <option value="90d">90天</option>
      </select>
      {isLoading && <div>加载中...</div>}
      {data?.data && <div>数据已加载</div>}
    </div>
  )
}

/**
 * 示例 5: 错误处理最佳实践
 */
export function Example5_ErrorHandling() {
  const { data, isLoading, error, refetch, isError } = useQuery({
    queryKey: ['dashboard-stats', '7d'],
    queryFn: () => dashboardService.getStats('7d'),
    retry: (failureCount, error) => {
      // 如果是 401 错误，不重试
      if (error instanceof Error && error.message.includes('401')) {
        return false
      }
      // 其他错误最多重试 3 次
      return failureCount < 3
    },
  })

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>正在加载数据...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="error-container">
        <h3>数据加载失败</h3>
        <p>{error.message}</p>
        <button onClick={() => refetch()}>重试</button>
      </div>
    )
  }

  if (!data?.data) {
    return <div>暂无数据</div>
  }

  return (
    <div>
      <h2>数据展示</h2>
      <pre>{JSON.stringify(data.data, null, 2)}</pre>
    </div>
  )
}

/**
 * 示例 6: 自定义 Hook 封装
 */
export function useDashboardStats(timeRange: '7d' | '30d' | '90d' = '7d') {
  return useQuery({
    queryKey: ['dashboard-stats', timeRange],
    queryFn: () => dashboardService.getStats(timeRange),
    retry: 2,
    staleTime: 1000 * 60,
    select: (response) => {
      // 数据转换
      const data = response.data
      return {
        totalUsers: data.users.total,
        activeUsers: data.users.active,
        revenue: data.revenue.current,
        revenueGrowth: parseFloat(data.revenue.growth),
        requests: data.api.requests,
        requestsGrowth: parseFloat(data.api.requestsGrowth),
      }
    },
  })
}

// 使用自定义 Hook
export function Example6_CustomHook() {
  const { data, isLoading } = useDashboardStats('30d')

  if (isLoading) return <div>加载中...</div>

  return (
    <div>
      <p>总用户: {data?.totalUsers}</p>
      <p>收入: {data?.revenue} 积分</p>
      <p>收入增长: {data?.revenueGrowth}%</p>
    </div>
  )
}

/**
 * 示例 7: 数据预取
 */
export function Example7_DataPrefetch() {
  const queryClient = useQueryClient()

  const prefetchData = async () => {
    // 预取 30 天数据
    await queryClient.prefetchQuery({
      queryKey: ['dashboard-stats', '30d'],
      queryFn: () => dashboardService.getStats('30d'),
    })
  }

  return (
    <div>
      <button
        onMouseEnter={prefetchData} // 鼠标悬停时预取数据
      >
        查看 30 天统计
      </button>
    </div>
  )
}

/**
 * 示例 8: 乐观更新
 */
export function Example8_OptimisticUpdate() {
  const queryClient = useQueryClient()

  const handleManualUpdate = () => {
    // 手动更新缓存数据
    queryClient.setQueryData(
      ['dashboard-stats', '7d'],
      (old: any) => {
        if (!old?.data) return old
        return {
          ...old,
          data: {
            ...old.data,
            users: {
              ...old.data.users,
              total: old.data.users.total + 1,
            },
          },
        }
      }
    )
  }

  return (
    <button onClick={handleManualUpdate}>
      模拟新增用户
    </button>
  )
}

/**
 * 示例 9: 依赖查询
 */
export function Example9_DependentQueries() {
  // 先获取统计数据
  const statsQuery = useQuery({
    queryKey: ['dashboard-stats', '7d'],
    queryFn: () => dashboardService.getStats('7d'),
  })

  // 仅在统计数据加载成功后才获取 API 统计
  const apiStatsQuery = useQuery({
    queryKey: ['dashboard-api-stats', '7d'],
    queryFn: () => dashboardService.getApiStats('7d'),
    enabled: !!statsQuery.data, // 依赖于 statsQuery
  })

  return (
    <div>
      {statsQuery.isLoading && <div>加载统计数据...</div>}
      {statsQuery.isSuccess && apiStatsQuery.isLoading && (
        <div>加载 API 统计...</div>
      )}
      {statsQuery.isSuccess && apiStatsQuery.isSuccess && (
        <div>所有数据加载完成</div>
      )}
    </div>
  )
}

/**
 * 示例 10: 后台刷新
 */
export function Example10_BackgroundRefetch() {
  const { data, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard-stats', '7d'],
    queryFn: () => dashboardService.getStats('7d'),
    refetchInterval: 1000 * 60, // 每分钟后台刷新
    refetchIntervalInBackground: true, // 页面不可见时也刷新
  })

  return (
    <div>
      <p>最后更新: {new Date(dataUpdatedAt).toLocaleString()}</p>
      <p>总用户: {data?.data.users.total}</p>
    </div>
  )
}
