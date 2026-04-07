import { useState, useEffect } from 'react'
import { referralService, type ReferralOverviewResponse } from '@/services/referrals'
import { Users, DollarSign, Clock, TrendingUp, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function ReferralOverview() {
  const [data, setData] = useState<ReferralOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadOverview()
  }, [])

  const loadOverview = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await referralService.getOverview()
      if (res.success && res.data) {
        setData(res.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={loadOverview}>重试</Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { stats, recentReferrals, topReferrers } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">分销概览</h1>
        <Button variant="secondary" size="sm" onClick={loadOverview}>
          <RefreshCw size={14} className="mr-1" />
          刷新数据
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users size={20} />}
          label="总推荐人数"
          value={stats.totalReferrals}
          color="primary"
        />
        <StatCard
          icon={<DollarSign size={20} />}
          label="总佣金"
          value={`${stats.totalCommission.toFixed(2)}`}
          suffix="积分"
          color="accent"
        />
        <StatCard
          icon={<Clock size={20} />}
          label="待审核佣金"
          value={`${stats.pendingCommission.toFixed(2)}`}
          suffix="积分"
          color="warning"
        />
        <StatCard
          icon={<TrendingUp size={20} />}
          label="待处理提现"
          value={stats.pendingWithdrawals}
          extra={`${stats.pendingWithdrawalAmount.toFixed(2)} 积分`}
          color="info"
        />
      </div>

      {/* 佣金统计 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">佣金状态</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-foreground/80">已支付</span>
                <span className="text-success font-medium">{stats.paidCommission.toFixed(2)} 积分</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground/80">待审核</span>
                <span className="text-warning font-medium">{stats.pendingCommission.toFixed(2)} 积分</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground/80">总计</span>
                <span className="text-foreground font-medium">{stats.totalCommission.toFixed(2)} 积分</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">提现统计</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-foreground/80">已打款</span>
                <span className="text-success font-medium">{stats.paidWithdrawalAmount.toFixed(2)} 积分</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground/80">待处理</span>
                <span className="text-warning font-medium">{stats.pendingWithdrawalAmount.toFixed(2)} 积分</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground/80">待处理数量</span>
                <span className="text-foreground font-medium">{stats.pendingWithdrawals} 笔</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">邀请码</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-foreground/80">活跃邀请码</span>
                <span className="text-foreground font-medium">{stats.totalCodes}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground/80">总推荐人数</span>
                <span className="text-foreground font-medium">{stats.totalReferrals}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground/80">平均佣金</span>
                <span className="text-foreground font-medium">
                  {stats.totalReferrals > 0
                    ? (stats.totalCommission / stats.totalReferrals).toFixed(2)
                    : '0.00'} 积分
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 推荐排行榜 + 最近推荐 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 推荐排行榜 */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-lg font-medium text-foreground mb-4">推荐排行榜</h3>
            {topReferrers.length === 0 ? (
              <p className="text-muted-foreground text-sm">暂无数据</p>
            ) : (
              <div className="space-y-3">
                {topReferrers.map((referrer, index) => (
                  <div key={referrer.userId} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0 ? 'bg-warning/20 text-warning' :
                      index === 1 ? 'bg-gray-400/20 text-gray-300' :
                      index === 2 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {referrer.name || referrer.email}
                      </p>
                      <p className="text-xs text-muted-foreground">{referrer.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{referrer.referralCount} 人</p>
                      <p className="text-xs text-muted-foreground">{referrer.totalEarned.toFixed(2)} 积分</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 最近推荐 */}
        <Card>
          <CardContent className="p-5">
            <h3 className="text-lg font-medium text-foreground mb-4">最近推荐</h3>
            {recentReferrals.length === 0 ? (
              <p className="text-muted-foreground text-sm">暂无数据</p>
            ) : (
              <div className="space-y-3">
                {recentReferrals.map((referral) => (
                  <div key={referral.id} className="flex items-center gap-3">
                    <ArrowUpRight size={16} className="text-success shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        <span className="text-primary">{referral.referrerName || referral.referrerEmail}</span>
                        {' '}推荐了{' '}
                        <span className="text-primary/70">{referral.referredName || referral.referredEmail}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {referral.referralCode && `邀请码: ${referral.referralCode} | `}
                        {new Date(referral.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  suffix,
  extra,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  suffix?: string
  extra?: string
  color: 'primary' | 'accent' | 'warning' | 'info'
}) {
  const colorMap = {
    primary: 'from-primary/10 to-primary/5 border-primary/20',
    accent: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
    warning: 'from-yellow-500/10 to-yellow-500/5 border-yellow-500/20',
    info: 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
  }

  const iconColorMap = {
    primary: 'text-primary',
    accent: 'text-emerald-400',
    warning: 'text-warning',
    info: 'text-blue-400',
  }

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-5`}>
      <div className="flex items-center gap-3 mb-3">
        <span className={iconColorMap[color]}>{icon}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {extra && <p className="text-xs text-muted-foreground mt-1">{extra}</p>}
    </div>
  )
}
