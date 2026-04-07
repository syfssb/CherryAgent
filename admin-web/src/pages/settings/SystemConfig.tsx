import { useState, useEffect } from 'react'
import { Save, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { systemConfigService } from '@/services/settings'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import type { SystemConfig, SystemConfigUpdate } from '@/types/settings'

// ============================================================
// 辅助组件：带 label 和 hint 的 Input 包装
// ============================================================

function FormInput({
  label,
  hint,
  ...inputProps
}: {
  label: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <Input {...inputProps} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ============================================================
// 辅助组件：Checkbox 开关
// ============================================================

function CheckboxField({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  description: string
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-ring"
      />
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
  )
}

// ============================================================
// 主组件
// ============================================================

/**
 * 系统全局配置页面
 *
 * 功能:
 * - 定价与计费（全局价格倍率）
 * - API 限流（RPM / TPM）
 * - 余额预警通知
 */
export default function SystemConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [formData, setFormData] = useState<SystemConfigUpdate>({})
  const [models, setModels] = useState<Array<{ id: string; displayName: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 加载配置
  useEffect(() => {
    loadConfig()
  }, [])

  // 加载模型列表
  useEffect(() => {
    async function loadModels() {
      try {
        const response = await api.get<{ models: Array<{ id: string; displayName: string }> }>('/admin/models?limit=100')
        if (response.success && response.data?.models) {
          setModels(response.data.models)
        }
      } catch {
        // 静默失败，模型列表加载失败不影响页面
      }
    }
    loadModels()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const response = await systemConfigService.getConfig()
      if (response.success && response.data) {
        setConfig(response.data)
        setFormData(response.data)
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)

      const response = await systemConfigService.updateConfig(formData)
      if (response.success && response.data) {
        setConfig(response.data)
        setFormData(response.data)
        showMessage('success', '配置保存成功')
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '保存配置失败')
    } finally {
      setSaving(false)
    }
  }

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const updateField = <K extends keyof SystemConfigUpdate>(key: K, value: SystemConfigUpdate[K]) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>加载配置中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">系统全局配置</h1>
          <p className="text-muted-foreground mt-1">管理定价倍率、API 限流、余额预警等核心配置</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            保存配置
          </Button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-success/10 border border-success/20 text-success'
              : 'bg-destructive/10 border border-destructive/20 text-destructive'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 定价与计费 */}
      <Card>
        <CardHeader>
          <CardTitle>定价与计费</CardTitle>
          <CardDescription>设置全局价格倍率，影响所有模型的实际计费价格</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormInput
            label="全局价格倍率"
            type="number"
            step="0.1"
            min="0.1"
            max="10"
            value={formData.globalPriceMultiplier ?? 1}
            onChange={(e) => updateField('globalPriceMultiplier', parseFloat((e.target as HTMLInputElement).value))}
            hint="所有模型价格乘以此倍率（0.1 - 10），例如 1.5 表示加价 50%"
          />
        </CardContent>
      </Card>

      {/* 工具模型 */}
      <Card>
        <CardHeader>
          <CardTitle>工具模型</CardTitle>
          <CardDescription>选择用于桌面端话题标题自动生成的模型，该模型不会出现在用户的模型列表中，且不收费</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">工具模型</label>
            <select
              value={formData.toolModelId ?? ''}
              onChange={(e) => updateField('toolModelId', e.target.value)}
              className={cn(
                'w-full px-4 py-2.5 bg-background border rounded-lg text-foreground',
                'focus:outline-none focus:ring-2 transition-all duration-200',
                'border-border focus:ring-primary/50 focus:border-primary'
              )}
            >
              <option value="">未设置（使用用户当前模型）</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.displayName} ({m.id})</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">建议选择低成本模型（如 Haiku），以降低标题生成的 API 成本</p>
          </div>
          <FormInput
            label="SDK 辅助模型（Small Fast Model）"
            type="text"
            value={formData.smallFastModelId ?? ''}
            onChange={(e) => updateField('smallFastModelId', (e.target as HTMLInputElement).value)}
            hint="Claude SDK 内部使用的快速辅助模型 ID（如 claude-sonnet-4-6），留空则使用 SDK 默认值（Haiku）"
          />
        </CardContent>
      </Card>

      {/* 新用户欢迎奖励 */}
      <Card>
        <CardHeader>
          <CardTitle>新用户欢迎奖励</CardTitle>
          <CardDescription>配置新用户注册时赠送的体验积分</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormInput
            label="欢迎奖励积分"
            type="number"
            step="0.01"
            min="0"
            max="1000"
            value={
              formData.welcomeBonusCents != null
                ? (formData.welcomeBonusCents / 100)
                : 0
            }
            onChange={(e) => {
              const credits = parseFloat((e.target as HTMLInputElement).value)
              updateField('welcomeBonusCents', Math.round((isNaN(credits) ? 0 : credits) * 100))
            }}
            hint="新用户注册后赠送的体验积分数量（0 - 1000），设为 0 表示不赠送"
          />
        </CardContent>
      </Card>

      {/* 签到奖励 */}
      <Card>
        <CardHeader>
          <CardTitle>签到奖励</CardTitle>
          <CardDescription>配置每日签到的积分奖励策略（7 天周期）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CheckboxField
            checked={formData.checkinEnabled ?? true}
            onChange={(v) => updateField('checkinEnabled', v)}
            title="启用签到功能"
            description="关闭后用户将无法进行每日签到"
          />
          <div className="grid grid-cols-3 gap-4">
            <FormInput
              label="基础积分"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={formData.checkinBaseCredits ?? 0.5}
              onChange={(e) => updateField('checkinBaseCredits', parseFloat((e.target as HTMLInputElement).value))}
              hint="每次签到的基础奖励积分"
            />
            <FormInput
              label="连续签到加成"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={formData.checkinConsecutiveBonus ?? 0.1}
              onChange={(e) => updateField('checkinConsecutiveBonus', parseFloat((e.target as HTMLInputElement).value))}
              hint="每多连续一天额外增加的积分"
            />
            <FormInput
              label="最大连续加成上限"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={formData.checkinMaxConsecutiveBonus ?? 3}
              onChange={(e) => updateField('checkinMaxConsecutiveBonus', parseFloat((e.target as HTMLInputElement).value))}
              hint="连续签到加成的最大值"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            示例（默认配置）：第1天 0.5 积分，第2天 0.6，第3天 0.7 … 第7天 1.1，第8天重新从 0.5 开始
          </p>
        </CardContent>
      </Card>

      {/* 腾讯验证码 */}
      <Card>
        <CardHeader>
          <CardTitle>腾讯验证码（人机验证）</CardTitle>
          <CardDescription>启用后，登录/注册/找回密码时需要通过腾讯行为验证码（Captcha）验证</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CheckboxField
            checked={formData.captchaEnabled ?? false}
            onChange={(v) => updateField('captchaEnabled', v)}
            title="启用腾讯验证码"
            description="开启后所有邮箱认证场景（登录/注册/找回密码）将强制要求通过人机验证"
          />
          <FormInput
            label="SecretId"
            type="text"
            value={formData.captchaSecretId ?? ''}
            onChange={(e) => updateField('captchaSecretId', (e.target as HTMLInputElement).value)}
            hint="腾讯云控制台 API 密钥 SecretId"
          />
          <FormInput
            label="SecretKey"
            type="password"
            value={formData.captchaSecretKey ?? ''}
            onChange={(e) => updateField('captchaSecretKey', (e.target as HTMLInputElement).value)}
            hint="腾讯云控制台 API 密钥 SecretKey（敏感信息）"
          />
          <FormInput
            label="CaptchaAppId"
            type="text"
            value={formData.captchaAppId ?? ''}
            onChange={(e) => updateField('captchaAppId', (e.target as HTMLInputElement).value)}
            hint="验证码控制台「验证管理」中的 CaptchaAppId"
          />
          <FormInput
            label="AppSecretKey"
            type="password"
            value={formData.captchaAppSecretKey ?? ''}
            onChange={(e) => updateField('captchaAppSecretKey', (e.target as HTMLInputElement).value)}
            hint="验证码控制台「验证管理」中的 AppSecretKey（敏感信息）"
          />
        </CardContent>
      </Card>

      {/* API 限流 */}
      <Card>
        <CardHeader>
          <CardTitle>API 限流</CardTitle>
          <CardDescription>设置默认的 API 请求速率限制，用户未单独配置时使用此默认值</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="默认每分钟请求数限制（RPM）"
              type="number"
              min="0"
              value={formData.defaultRpmLimit ?? 60}
              onChange={(e) => updateField('defaultRpmLimit', parseInt((e.target as HTMLInputElement).value, 10))}
              hint="每个用户每分钟最大请求数"
            />
            <FormInput
              label="默认每分钟 Token 数限制（TPM）"
              type="number"
              min="0"
              value={formData.defaultTpmLimit ?? 100000}
              onChange={(e) => updateField('defaultTpmLimit', parseInt((e.target as HTMLInputElement).value, 10))}
              hint="每个用户每分钟最大 Token 数"
            />
          </div>
        </CardContent>
      </Card>

      {/* 预警设置 */}
      <Card>
        <CardHeader>
          <CardTitle>余额预警</CardTitle>
          <CardDescription>配置用户余额不足时的预警通知策略</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CheckboxField
            checked={formData.notifyOnLowBalance ?? false}
            onChange={(v) => updateField('notifyOnLowBalance', v)}
            title="发送低余额提醒"
            description="当用户余额低于阈值时发送邮件提醒"
          />

          <FormInput
            label="低余额提醒阈值（分）"
            type="number"
            min="0"
            value={formData.lowBalanceThresholdCents ?? 1000}
            onChange={(e) => updateField('lowBalanceThresholdCents', parseInt((e.target as HTMLInputElement).value, 10))}
            hint="用户余额低于此值时触发提醒，单位为分（100 = 1 积分）"
          />
        </CardContent>
      </Card>

      {/* 运行时配置 */}
      <Card>
        <CardHeader>
          <CardTitle>运行时配置</CardTitle>
          <CardDescription>Agent 运行时 Provider 与双栈开关</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CheckboxField
            checked={formData.enableCodexProvider ?? false}
            onChange={(v) => updateField('enableCodexProvider', v)}
            title="启用 Codex Provider"
            description="开启后允许使用 OpenAI Codex 作为 Agent 运行时"
          />
          <CheckboxField
            checked={formData.enableRuntimeDimension ?? false}
            onChange={(v) => updateField('enableRuntimeDimension', v)}
            title="启用 Runtime 维度"
            description="开启后统计和计费将区分不同运行时"
          />
          <FormInput
            label="默认 Agent Provider"
            type="text"
            value={formData.defaultAgentProvider ?? 'claude'}
            onChange={(e) => updateField('defaultAgentProvider', (e.target as HTMLInputElement).value)}
            hint="可选值: claude, codex"
          />
          <FormInput
            label="已启用的 Agent Providers"
            type="text"
            value={formData.enabledAgentProviders ?? 'claude'}
            onChange={(e) => updateField('enabledAgentProviders', (e.target as HTMLInputElement).value)}
            hint="逗号分隔，如: claude,codex"
          />
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
