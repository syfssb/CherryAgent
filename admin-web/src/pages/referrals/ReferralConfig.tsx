import { useState, useEffect } from 'react'
import { referralService, type ReferralConfigDTO, type ReferralConfigUpdateDTO } from '@/services/referrals'
import { Save, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function ReferralConfig() {
  const [config, setConfig] = useState<ReferralConfigDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await referralService.getConfig()
      if (res.success && res.data) {
        setConfig(res.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!config) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const updateData: ReferralConfigUpdateDTO = {
        commissionRate: config.commissionRate,
        commissionType: config.commissionType,
        fixedAmount: config.fixedAmount,
        minWithdrawal: config.minWithdrawal,
        maxLevels: config.maxLevels,
        level2Rate: config.level2Rate,
        isEnabled: config.isEnabled,
      }

      const res = await referralService.updateConfig(updateData)
      if (res.success) {
        setSuccess('配置已保存')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const updateField = <K extends keyof ReferralConfigDTO>(
    field: K,
    value: ReferralConfigDTO[K]
  ) => {
    if (!config) return
    setConfig({ ...config, [field]: value })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">分销配置</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadConfig}>
            <RefreshCw size={14} className="mr-1" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
            {saving ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success/10 border border-success/20 rounded-lg p-3 text-sm text-success">
          {success}
        </div>
      )}

      {/* 基本设置 */}
      <Card>
        <CardHeader>
          <CardTitle>基本设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-foreground">启用分销</label>
              <p className="text-xs text-muted-foreground mt-0.5">关闭后用户将无法使用分销功能</p>
            </div>
            <button
              onClick={() => updateField('isEnabled', !config.isEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                config.isEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  config.isEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">佣金类型</label>
            <select
              value={config.commissionType}
              onChange={(e) => updateField('commissionType', e.target.value as 'percentage' | 'fixed')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="percentage">按比例</option>
              <option value="fixed">固定金额</option>
            </select>
          </div>

          {config.commissionType === 'percentage' ? (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                佣金比例 (%)
              </label>
              <Input
                type="number"
                value={String(config.commissionRate)}
                onChange={(e) => updateField('commissionRate', parseFloat(e.target.value) || 0)}
                min={0}
                max={100}
                step={0.1}
              />
              <p className="text-xs text-muted-foreground mt-1">用户充值金额的 {config.commissionRate}% 作为推荐人佣金</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                固定佣金金额 (积分)
              </label>
              <Input
                type="number"
                value={String(config.fixedAmount)}
                onChange={(e) => updateField('fixedAmount', parseFloat(e.target.value) || 0)}
                min={0}
                step={0.01}
              />
              <p className="text-xs text-muted-foreground mt-1">每笔充值订单固定给推荐人 {config.fixedAmount} 积分佣金</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 多级分销 */}
      <Card>
        <CardHeader>
          <CardTitle>多级分销</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">分销层级</label>
            <select
              value={config.maxLevels}
              onChange={(e) => updateField('maxLevels', parseInt(e.target.value, 10))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value={1}>一级分销（仅直推）</option>
              <option value={2}>二级分销</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              一级分销：仅直接推荐人获得佣金；二级分销：推荐人的推荐人也可获得佣金
            </p>
          </div>

          {config.maxLevels >= 2 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                二级佣金比例 (%)
              </label>
              <Input
                type="number"
                value={String(config.level2Rate)}
                onChange={(e) => updateField('level2Rate', parseFloat(e.target.value) || 0)}
                min={0}
                max={100}
                step={0.1}
              />
              <p className="text-xs text-muted-foreground mt-1">二级推荐人获得充值金额的 {config.level2Rate}% 佣金</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 提现设置 */}
      <Card>
        <CardHeader>
          <CardTitle>提现设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              最低提现金额 (积分)
            </label>
            <Input
              type="number"
              value={String(config.minWithdrawal)}
              onChange={(e) => updateField('minWithdrawal', parseFloat(e.target.value) || 0)}
              min={0}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground mt-1">用户佣金余额达到此金额后才可申请提现</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
