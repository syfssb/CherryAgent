import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/services/api'

/**
 * 支付配置数据
 */
interface PaymentConfig {
  stripe_enabled: string
  stripe_publishable_key: string
  stripe_secret_key: string
  stripe_webhook_secret: string
  stripe_currency: string
  xunhupay_enabled: string
  xunhupay_appid: string
  xunhupay_appsecret: string
  xunhupay_wechat_appid: string
  xunhupay_wechat_appsecret: string
  xunhupay_alipay_appid: string
  xunhupay_alipay_appsecret: string
  xunhupay_api_url: string
  xunhupay_notify_url: string
  payment_methods: string
}

const DEFAULT_CONFIG: PaymentConfig = {
  stripe_enabled: 'false',
  stripe_publishable_key: '',
  stripe_secret_key: '',
  stripe_webhook_secret: '',
  stripe_currency: 'cny',
  xunhupay_enabled: 'false',
  xunhupay_appid: '',
  xunhupay_appsecret: '',
  xunhupay_wechat_appid: '',
  xunhupay_wechat_appsecret: '',
  xunhupay_alipay_appid: '',
  xunhupay_alipay_appsecret: '',
  xunhupay_api_url: 'https://api.xunhupay.com/payment/do.html',
  xunhupay_notify_url: '',
  payment_methods: '["xunhupay"]',
}

/**
 * 支付配置页面
 */
export default function PaymentConfigPage() {
  const [config, setConfig] = useState<PaymentConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showStripeSecrets, setShowStripeSecrets] = useState(false)
  const [showXunhupaySecrets, setShowXunhupaySecrets] = useState(false)
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set())

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      const response = await api.get<{ configs: Array<{ key: string; value: string }> }>('/admin/configs')
      if (response.success && response.data) {
        const configMap: Record<string, string> = {}
        for (const item of response.data.configs) {
          if (item.key in DEFAULT_CONFIG) {
            configMap[item.key] = item.value
          }
        }
        setConfig({ ...DEFAULT_CONFIG, ...configMap })
      }
    } catch (error) {
      showMsg('error', error instanceof Error ? error.message : '加载配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const updateField = (key: keyof PaymentConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setDirtyFields((prev) => new Set([...prev, key]))
  }

  const handleSave = async () => {
    if (dirtyFields.size === 0) {
      showMsg('error', '没有需要保存的更改')
      return
    }

    try {
      setSaving(true)
      const keysToSave = Array.from(dirtyFields)

      for (const key of keysToSave) {
        const value = config[key as keyof PaymentConfig]
        if (value.includes('****')) {
          continue
        }
        await api.put<unknown>(`/admin/configs/${key}`, { value })
      }

      setDirtyFields(new Set())
      showMsg('success', '支付配置已保存')
      await loadConfig()
    } catch (error) {
      showMsg('error', error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const isMasked = (value: string) => value.includes('****')

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">加载支付配置中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">支付配置</h1>
          <p className="text-[13px] text-muted-foreground mt-1">配置 Stripe 和虎皮椒支付渠道</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadConfig}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || dirtyFields.size === 0}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存配置
          </Button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`flex items-center gap-3 p-3 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'
              : 'bg-destructive/10 border border-destructive/20 text-destructive'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Stripe 配置 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>Stripe 配置</CardTitle>
              <Badge
                variant="outline"
                className={
                  config.stripe_enabled === 'true'
                    ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5'
                    : ''
                }
              >
                {config.stripe_enabled === 'true' ? '已启用' : '已禁用'}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowStripeSecrets(!showStripeSecrets)}
                className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
              >
                {showStripeSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showStripeSecrets ? '隐藏密钥' : '显示密钥'}</span>
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.stripe_enabled === 'true'}
                  onChange={(e) => updateField('stripe_enabled', e.target.checked ? 'true' : 'false')}
                  className="w-4 h-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">启用</span>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Publishable Key</label>
              <Input
                value={config.stripe_publishable_key}
                onChange={(e) => updateField('stripe_publishable_key', e.target.value)}
                placeholder="pk_live_..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Secret Key</label>
              <Input
                type={showStripeSecrets ? 'text' : 'password'}
                value={config.stripe_secret_key}
                onChange={(e) => updateField('stripe_secret_key', e.target.value)}
                placeholder="sk_live_..."
                disabled={isMasked(config.stripe_secret_key) && !showStripeSecrets}
              />
              {isMasked(config.stripe_secret_key) && (
                <p className="text-xs text-muted-foreground">已脱敏显示，输入新值可覆盖</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Webhook Secret</label>
              <Input
                type={showStripeSecrets ? 'text' : 'password'}
                value={config.stripe_webhook_secret}
                onChange={(e) => updateField('stripe_webhook_secret', e.target.value)}
                placeholder="whsec_..."
                disabled={isMasked(config.stripe_webhook_secret) && !showStripeSecrets}
              />
              {isMasked(config.stripe_webhook_secret) && (
                <p className="text-xs text-muted-foreground">已脱敏显示，输入新值可覆盖</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">默认货币</label>
              <select
                value={config.stripe_currency}
                onChange={(e) => updateField('stripe_currency', e.target.value)}
                className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="cny">CNY (人民币)</option>
                <option value="usd">USD (美元)</option>
                <option value="eur">EUR (欧元)</option>
                <option value="gbp">GBP (英镑)</option>
                <option value="jpy">JPY (日元)</option>
              </select>
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-md">
            <p className="text-xs text-muted-foreground">
              Webhook 端点: <code className="text-primary">{'/api/webhooks/stripe'}</code>
              <br />
              请在 Stripe Dashboard 中配置此 URL 作为 Webhook 端点，并监听 <code>checkout.session.completed</code> 和 <code>checkout.session.expired</code> 事件。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 虎皮椒配置 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>虎皮椒支付配置</CardTitle>
              <Badge
                variant="outline"
                className={
                  config.xunhupay_enabled === 'true'
                    ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5'
                    : ''
                }
              >
                {config.xunhupay_enabled === 'true' ? '已启用' : '已禁用'}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowXunhupaySecrets(!showXunhupaySecrets)}
                className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
              >
                {showXunhupaySecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showXunhupaySecrets ? '隐藏密钥' : '显示密钥'}</span>
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.xunhupay_enabled === 'true'}
                  onChange={(e) => updateField('xunhupay_enabled', e.target.checked ? 'true' : 'false')}
                  className="w-4 h-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">启用</span>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 微信支付配置 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              微信支付
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">微信 AppID</label>
                <Input
                  value={config.xunhupay_wechat_appid}
                  onChange={(e) => updateField('xunhupay_wechat_appid', e.target.value)}
                  placeholder="输入微信支付 AppID"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">微信 AppSecret</label>
                <Input
                  type={showXunhupaySecrets ? 'text' : 'password'}
                  value={config.xunhupay_wechat_appsecret}
                  onChange={(e) => updateField('xunhupay_wechat_appsecret', e.target.value)}
                  placeholder="输入微信支付 AppSecret"
                  disabled={isMasked(config.xunhupay_wechat_appsecret) && !showXunhupaySecrets}
                />
                {isMasked(config.xunhupay_wechat_appsecret) && (
                  <p className="text-xs text-muted-foreground">已脱敏显示，输入新值可覆盖</p>
                )}
              </div>
            </div>
          </div>

          {/* 支付宝配置 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              支付宝
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">支付宝 AppID</label>
                <Input
                  value={config.xunhupay_alipay_appid}
                  onChange={(e) => updateField('xunhupay_alipay_appid', e.target.value)}
                  placeholder="输入支付宝 AppID"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">支付宝 AppSecret</label>
                <Input
                  type={showXunhupaySecrets ? 'text' : 'password'}
                  value={config.xunhupay_alipay_appsecret}
                  onChange={(e) => updateField('xunhupay_alipay_appsecret', e.target.value)}
                  placeholder="输入支付宝 AppSecret"
                  disabled={isMasked(config.xunhupay_alipay_appsecret) && !showXunhupaySecrets}
                />
                {isMasked(config.xunhupay_alipay_appsecret) && (
                  <p className="text-xs text-muted-foreground">已脱敏显示，输入新值可覆盖</p>
                )}
              </div>
            </div>
          </div>

          {/* 公共配置 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">API 地址</label>
              <Input
                value={config.xunhupay_api_url}
                onChange={(e) => updateField('xunhupay_api_url', e.target.value)}
                placeholder="https://api.xunhupay.com/payment/do.html"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">回调通知地址</label>
              <Input
                value={config.xunhupay_notify_url}
                onChange={(e) => updateField('xunhupay_notify_url', e.target.value)}
                placeholder="https://your-domain.com/api/webhooks/xunhupay"
              />
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-md">
            <p className="text-xs text-muted-foreground">
              回调端点: <code className="text-primary">{'/api/webhooks/xunhupay'}</code>
              <br />
              微信支付和支付宝需要在虎皮椒后台分别申请，各有独立的 AppID 和 AppSecret。只需配置需要使用的支付方式即可。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 支付方式说明 */}
      <Card>
        <CardHeader>
          <CardTitle>支付方式说明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              启用支付方式后，用户在充值时可以选择对应的支付渠道。系统会自动检测已配置且启用的支付方式，
              并在充值页面展示给用户。
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/50 rounded-md">
                <h4 className="font-medium text-foreground mb-1">Stripe</h4>
                <p className="text-xs">支持 Visa、MasterCard 等国际信用卡/借记卡。适合海外用户。</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-md">
                <h4 className="font-medium text-foreground mb-1">虎皮椒</h4>
                <p className="text-xs">支持微信支付和支付宝扫码支付。适合国内用户，无需企业资质。</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
