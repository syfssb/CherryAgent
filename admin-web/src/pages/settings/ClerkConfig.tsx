import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  RefreshCw,
  ShieldCheck,
  ShieldX,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { clerkConfigService, type ClerkConfig, type ClerkConfigUpdate } from '@/services/settings'

/**
 * Clerk 认证配置页面
 *
 * 管理 Clerk OAuth 认证的非敏感配置项。
 * Secret Key 等敏感信息通过环境变量管理，页面只显示配置状态。
 */
export default function ClerkConfigPage() {
  const [config, setConfig] = useState<ClerkConfig | null>(null)
  const [formData, setFormData] = useState<ClerkConfigUpdate>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      const response = await clerkConfigService.getConfig()
      if (response.success && response.data) {
        setConfig(response.data)
        setFormData({
          enabled: response.data.enabled,
          publishableKey: response.data.publishableKey,
          domain: response.data.domain,
          issuerUrl: response.data.issuerUrl,
        })
        setHasChanges(false)
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

  const updateField = <K extends keyof ClerkConfigUpdate>(key: K, value: ClerkConfigUpdate[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!hasChanges) {
      showMsg('error', '没有需要保存的更改')
      return
    }

    try {
      setSaving(true)
      setMessage(null)

      const response = await clerkConfigService.updateConfig(formData)
      if (response.success && response.data) {
        setConfig(response.data)
        setFormData({
          enabled: response.data.enabled,
          publishableKey: response.data.publishableKey,
          domain: response.data.domain,
          issuerUrl: response.data.issuerUrl,
        })
        setHasChanges(false)
        showMsg('success', 'Clerk 配置已保存')
      }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">加载 Clerk 配置中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Clerk 认证配置</h1>
          <p className="text-[13px] text-muted-foreground mt-1">配置 Clerk OAuth 认证服务</p>
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
            disabled={saving || !hasChanges}
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

      {/* 启用开关 & 状态 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>Clerk 认证</CardTitle>
              <Badge
                variant="outline"
                className={
                  formData.enabled
                    ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5'
                    : ''
                }
              >
                {formData.enabled ? '已启用' : '已禁用'}
              </Badge>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.enabled ?? false}
                onChange={(e) => updateField('enabled', e.target.checked)}
                className="w-4 h-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">启用</span>
            </label>
          </div>
          <CardDescription>
            启用后，用户可以通过 Clerk 提供的 OAuth 方式（Google、GitHub 等）登录应用
          </CardDescription>
        </CardHeader>
      </Card>

      {/* 基本配置 */}
      <Card>
        <CardHeader>
          <CardTitle>基本配置</CardTitle>
          <CardDescription>配置 Clerk 应用的公开参数，这些值可以安全地存储在数据库中</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground">Publishable Key</label>
            <Input
              value={formData.publishableKey ?? ''}
              onChange={(e) => updateField('publishableKey', e.target.value)}
              placeholder="pk_live_... 或 pk_test_..."
            />
            <p className="text-xs text-muted-foreground">
              在 Clerk Dashboard → API Keys 中获取，以 <code className="text-primary">pk_</code> 开头
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Domain</label>
              <Input
                value={formData.domain ?? ''}
                onChange={(e) => updateField('domain', e.target.value)}
                placeholder="your-app.clerk.accounts.dev"
              />
              <p className="text-xs text-muted-foreground">
                Clerk 应用域名，用于 JWKS 验证
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Issuer URL</label>
              <Input
                value={formData.issuerUrl ?? ''}
                onChange={(e) => updateField('issuerUrl', e.target.value)}
                placeholder="https://your-app.clerk.accounts.dev"
              />
              <p className="text-xs text-muted-foreground">
                JWT 签发者 URL，通常与 Domain 相同
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 环境变量状态（只读） */}
      <Card>
        <CardHeader>
          <CardTitle>敏感配置状态</CardTitle>
          <CardDescription>
            以下配置通过服务器环境变量管理，不存储在数据库中。请在部署环境的 <code className="text-primary">.env</code> 文件中配置。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-3">
              {config?.secretKeyStatus === 'configured' ? (
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              ) : (
                <ShieldX className="w-4 h-4 text-destructive" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">CLERK_SECRET_KEY</p>
                <p className="text-xs text-muted-foreground">用于后端 API 验证 Clerk token</p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                config?.secretKeyStatus === 'configured'
                  ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5'
                  : 'border-destructive/30 text-destructive bg-destructive/5'
              }
            >
              {config?.secretKeyStatus === 'configured' ? '已配置' : '未配置'}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-3">
              {config?.webhookSecretStatus === 'configured' ? (
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              ) : (
                <ShieldX className="w-4 h-4 text-amber-500" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">CLERK_WEBHOOK_SECRET</p>
                <p className="text-xs text-muted-foreground">用于验证 Clerk Webhook 回调签名</p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                config?.webhookSecretStatus === 'configured'
                  ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5'
                  : 'border-amber-500/30 text-amber-500 bg-amber-500/5'
              }
            >
              {config?.webhookSecretStatus === 'configured' ? '已配置' : '未配置（可选）'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* 配置说明 */}
      <Card>
        <CardHeader>
          <CardTitle>配置说明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Clerk 提供完整的用户认证解决方案，支持 Google、GitHub、Apple 等多种 OAuth 登录方式，
              以及邮箱/密码、手机号等传统登录方式。
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/50 rounded-md">
                <h4 className="font-medium text-foreground mb-1">数据库配置</h4>
                <p className="text-xs">
                  Publishable Key、Domain、Issuer URL 等非敏感配置存储在数据库中，
                  可在此页面直接修改，修改后立即生效。
                </p>
              </div>
              <div className="p-3 bg-muted/50 rounded-md">
                <h4 className="font-medium text-foreground mb-1">环境变量配置</h4>
                <p className="text-xs">
                  Secret Key、Webhook Secret 等敏感信息必须通过环境变量配置，
                  修改后需要重启服务才能生效。
                </p>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="text-xs">
                Webhook 端点: <code className="text-primary">{'/api/webhooks/clerk'}</code>
                <br />
                请在 Clerk Dashboard → Webhooks 中配置此 URL，并监听 <code>user.created</code>、<code>user.updated</code> 和 <code>user.deleted</code> 事件。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 更新信息 */}
      {config?.updatedAt && (
        <div className="text-sm text-muted-foreground text-center">
          最后更新时间：{new Date(config.updatedAt).toLocaleString('zh-CN')}
          {config.updatedBy && ` · 操作者：${config.updatedBy}`}
        </div>
      )}
    </div>
  )
}
