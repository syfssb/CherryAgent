import { useState, useEffect } from 'react'
import {
  Save,
  Send,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Eye,
  EyeOff,
  FileText,
  Clock,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/table'
import { emailConfigService } from '@/services/settings'
import { api } from '@/services/api'
import type { EmailConfig, EmailConfigUpdate, ConfigTestResult } from '@/types/settings'

// ============================================================
// 类型定义
// ============================================================

interface EmailTemplate {
  id: string
  slug: string
  name: string
  subject: string
  htmlContent: string
  variables: string
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

interface EmailLog {
  id: string
  userId: string | null
  userEmail: string | null
  userName: string | null
  toEmail: string
  subject: string
  template: string
  status: string
  errorMessage: string | null
  sentAt: string | null
  createdAt: string
}

type TabType = 'config' | 'templates' | 'logs'

// ============================================================
// 邮件 API 服务
// ============================================================

const emailsApi = {
  async getTemplates() {
    return api.get<{ templates: EmailTemplate[] }>('/admin/emails/templates')
  },
  async updateTemplate(slug: string, data: Partial<EmailTemplate>) {
    return api.put<{ message: string; template: EmailTemplate }>(
      `/admin/emails/templates/${encodeURIComponent(slug)}`,
      data
    )
  },
  async getLogs(params?: Record<string, string | number | boolean | undefined>) {
    return api.get<{ logs: EmailLog[]; meta: { total: number; page: number; limit: number } }>(
      '/admin/emails/logs',
      params
    )
  },
}

// ============================================================
// 主组件
// ============================================================

export default function EmailConfigPage() {
  const [activeTab, setActiveTab] = useState<TabType>('config')

  const tabs: Array<{ key: TabType; label: string; icon: typeof Settings }> = [
    { key: 'config', label: 'SMTP 配置', icon: Settings },
    { key: 'templates', label: '邮件模板', icon: FileText },
    { key: 'logs', label: '发送日志', icon: Clock },
  ]

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">邮件服务配置</h1>
        <p className="text-muted-foreground mt-1">配置 SMTP 服务器、管理邮件模板、查看发送日志</p>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab 内容 */}
      {activeTab === 'config' && <SmtpConfigTab />}
      {activeTab === 'templates' && <TemplatesTab />}
      {activeTab === 'logs' && <LogsTab />}
    </div>
  )
}

// ============================================================
// SMTP 配置 Tab
// ============================================================

function SmtpConfigTab() {
  const [config, setConfig] = useState<EmailConfig | null>(null)
  const [formData, setFormData] = useState<EmailConfigUpdate>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testResult, setTestResult] = useState<ConfigTestResult | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const response = await emailConfigService.getConfig()
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
      const response = await emailConfigService.updateConfig(formData)
      if (response.success && response.data) {
        setConfig(response.data)
        setFormData(response.data)
        showMessage('success', '邮件配置保存成功')
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '保存配置失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTestConfig = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      showMessage('error', '请输入有效的测试邮箱地址')
      return
    }
    try {
      setTesting(true)
      setMessage(null)
      setTestResult(null)
      const response = await emailConfigService.testConfig(testEmail)
      if (response.success && response.data) {
        setTestResult(response.data)
        showMessage(response.data.success ? 'success' : 'error', response.data.message)
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '测试失败')
    } finally {
      setTesting(false)
    }
  }

  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      showMessage('error', '请输入有效的测试邮箱地址')
      return
    }
    try {
      setSendingTest(true)
      setMessage(null)
      const response = await emailConfigService.sendTestEmail(testEmail)
      if (response.success && response.data) {
        showMessage(
          response.data.success ? 'success' : 'error',
          response.data.success ? `测试邮件已发送到 ${testEmail}` : response.data.message
        )
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '发送测试邮件失败')
    } finally {
      setSendingTest(false)
    }
  }

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const updateField = <K extends keyof EmailConfigUpdate>(key: K, value: EmailConfigUpdate[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>加载配置中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
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

      {/* 邮件服务状态 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>邮件服务状态</CardTitle>
            <div className="flex items-center gap-3">
              <Badge variant={formData.enabled ? 'default' : 'secondary'}>
                {formData.enabled ? '已启用' : '已禁用'}
              </Badge>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                保存配置
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.enabled ?? false}
              onChange={(e) => updateField('enabled', e.target.checked)}
              className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-ring"
            />
            <div>
              <div className="text-sm font-medium text-foreground">启用邮件服务</div>
              <div className="text-xs text-muted-foreground">关闭后系统将不会发送任何邮件</div>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* SMTP 服务器配置 */}
      <Card>
        <CardHeader>
          <CardTitle>SMTP 服务器配置</CardTitle>
          <CardDescription>配置 SMTP 服务器连接参数</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">SMTP 服务器地址</label>
              <Input
                value={formData.smtpHost || ''}
                onChange={(e) => updateField('smtpHost', e.target.value)}
                placeholder="smtp.example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">端口</label>
              <Input
                type="number"
                value={formData.smtpPort || 587}
                onChange={(e) => updateField('smtpPort', parseInt(e.target.value, 10))}
                placeholder="587"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.smtpSecure ?? false}
              onChange={(e) => updateField('smtpSecure', e.target.checked)}
              className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-ring"
            />
            <div>
              <div className="text-sm font-medium text-foreground">使用 SSL/TLS 加密</div>
              <div className="text-xs text-muted-foreground">通常 465 端口使用 SSL，587 端口使用 STARTTLS</div>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">SMTP 用户名</label>
              <Input
                value={formData.smtpUser || ''}
                onChange={(e) => updateField('smtpUser', e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-foreground mb-1.5">SMTP 密码</label>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={formData.smtpPassword || ''}
                onChange={(e) => updateField('smtpPassword', e.target.value)}
                placeholder="输入新密码以更新"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 发件人信息 */}
      <Card>
        <CardHeader>
          <CardTitle>发件人信息</CardTitle>
          <CardDescription>设置邮件发件人的显示信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">发件人邮箱</label>
              <Input
                type="email"
                value={formData.fromEmail || ''}
                onChange={(e) => updateField('fromEmail', e.target.value)}
                placeholder="noreply@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">发件人名称</label>
              <Input
                value={formData.fromName || ''}
                onChange={(e) => updateField('fromName', e.target.value)}
                placeholder="Cherry Agent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">回复邮箱（可选）</label>
            <Input
              type="email"
              value={formData.replyToEmail || ''}
              onChange={(e) => updateField('replyToEmail', e.target.value)}
              placeholder="support@example.com"
            />
            <p className="text-xs text-muted-foreground mt-1">用户回复邮件时的收件地址</p>
          </div>
        </CardContent>
      </Card>

      {/* 测试邮件配置 */}
      <Card>
        <CardHeader>
          <CardTitle>测试邮件配置</CardTitle>
          <CardDescription>发送测试邮件验证配置是否正确</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">测试邮箱地址</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Mail className="w-4 h-4" />
              </div>
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">输入一个有效的邮箱地址来接收测试邮件</p>
          </div>

          {testResult && (
            <div
              className={`p-4 rounded-lg border ${
                testResult.success
                  ? 'bg-success/10 border-success/20'
                  : 'bg-destructive/10 border-destructive/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-destructive" />
                )}
                <span className={`font-medium ${testResult.success ? 'text-success' : 'text-destructive'}`}>
                  {testResult.success ? '测试通过' : '测试失败'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{testResult.message}</p>
            </div>
          )}
        </CardContent>
        <div className="flex gap-3 px-6 pb-6">
          <Button
            variant="outline"
            onClick={handleTestConfig}
            disabled={!testEmail || sendingTest || testing}
          >
            {testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <CheckCircle2 className="w-4 h-4 mr-2" />
            测试连接
          </Button>
          <Button
            onClick={handleSendTestEmail}
            disabled={!testEmail || testing || sendingTest}
          >
            {sendingTest && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Send className="w-4 h-4 mr-2" />
            发送测试邮件
          </Button>
        </div>
      </Card>

      {/* 更新信息 */}
      {config?.updatedAt && (
        <div className="text-sm text-muted-foreground text-center">
          最后更新时间：{new Date(config.updatedAt).toLocaleString('zh-CN')}
          {config.updatedBy && ` -- 操作者：${config.updatedBy}`}
        </div>
      )}
    </div>
  )
}

// ============================================================
// 邮件模板 Tab
// ============================================================

function TemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ subject: string; htmlContent: string; isEnabled: boolean }>({
    subject: '',
    htmlContent: '',
    isEnabled: true,
  })
  const [saving, setSaving] = useState(false)
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const response = await emailsApi.getTemplates()
      if (response.success && response.data) {
        setTemplates(response.data.templates)
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '加载模板失败')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (template: EmailTemplate) => {
    setEditingSlug(template.slug)
    setEditForm({
      subject: template.subject,
      htmlContent: template.htmlContent,
      isEnabled: template.isEnabled,
    })
  }

  const handleSave = async () => {
    if (!editingSlug) return
    try {
      setSaving(true)
      const response = await emailsApi.updateTemplate(editingSlug, editForm)
      if (response.success && response.data) {
        setTemplates((prev) =>
          prev.map((t) => (t.slug === editingSlug ? response.data!.template : t))
        )
        setEditingSlug(null)
        showMessage('success', '模板更新成功')
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : '保存模板失败')
    } finally {
      setSaving(false)
    }
  }

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>加载模板中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
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

      {editingSlug ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                编辑模板: {templates.find((t) => t.slug === editingSlug)?.name}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditingSlug(null)}>
                  取消
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Save className="w-4 h-4 mr-2" />
                  保存
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">邮件主题</label>
              <Input
                value={editForm.subject}
                onChange={(e) => setEditForm((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder="邮件主题，支持 {{variable}} 变量"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-foreground">
                  HTML 内容
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewSlug(previewSlug === editingSlug ? null : editingSlug)}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  {previewSlug === editingSlug ? '关闭预览' : '预览'}
                </Button>
              </div>
              {previewSlug === editingSlug ? (
                <div className="border border-border rounded-md p-4 min-h-[300px] bg-white">
                  <iframe
                    srcDoc={editForm.htmlContent}
                    title="邮件模板预览"
                    className="w-full min-h-[300px] border-0"
                    sandbox=""
                  />
                </div>
              ) : (
                <textarea
                  value={editForm.htmlContent}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, htmlContent: e.target.value }))}
                  placeholder="HTML 邮件内容..."
                  rows={20}
                  className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[300px] font-mono"
                />
              )}
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.isEnabled}
                onChange={(e) => setEditForm((prev) => ({ ...prev, isEnabled: e.target.checked }))}
                className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-foreground">启用此模板</span>
            </label>

            <div className="text-xs text-muted-foreground">
              可用变量: {templates.find((t) => t.slug === editingSlug)?.variables}
            </div>
          </CardContent>
        </Card>
      ) : previewSlug ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                预览模板: {templates.find((t) => t.slug === previewSlug)?.name}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setPreviewSlug(null)}>
                  关闭预览
                </Button>
                <Button variant="outline" onClick={() => {
                  const tpl = templates.find((t) => t.slug === previewSlug)
                  if (tpl) handleEdit(tpl)
                  setPreviewSlug(null)
                }}>
                  编辑
                </Button>
              </div>
            </div>
            <CardDescription>
              主题: {templates.find((t) => t.slug === previewSlug)?.subject}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border border-border rounded-md bg-white">
              <iframe
                srcDoc={templates.find((t) => t.slug === previewSlug)?.htmlContent ?? ''}
                title="邮件模板预览"
                className="w-full min-h-[400px] border-0 rounded-md"
                sandbox=""
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => (
            <Card key={template.slug}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{template.name}</span>
                      <Badge variant={template.isEnabled ? 'default' : 'secondary'}>
                        {template.isEnabled ? '启用' : '禁用'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{template.subject}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPreviewSlug(template.slug)}>
                    <Eye className="w-4 h-4 mr-1" />
                    预览
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(template)}>
                    编辑
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {templates.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              暂无邮件模板，请先运行数据库迁移
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// 发送日志 Tab
// ============================================================

function LogsTab() {
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const limit = 20

  useEffect(() => {
    loadLogs()
  }, [page, statusFilter])

  const loadLogs = async () => {
    try {
      setLoading(true)
      const params: Record<string, string | number | boolean | undefined> = {
        page,
        limit,
      }
      if (statusFilter) {
        params.status = statusFilter
      }
      const response = await emailsApi.getLogs(params)
      if (response.success && response.data) {
        setLogs(response.data.logs)
        setTotal(response.data.meta.total)
      }
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge variant="default">已发送</Badge>
      case 'failed':
        return <Badge variant="destructive">失败</Badge>
      case 'pending':
        return <Badge variant="outline">待发送</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      {/* 筛选 */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="flex h-10 rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">全部状态</option>
          <option value="sent">已发送</option>
          <option value="failed">失败</option>
          <option value="pending">待发送</option>
        </select>
        <span className="text-sm text-muted-foreground">共 {total} 条记录</span>
      </div>

      {/* 日志表格 */}
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>收件人</TableHead>
              <TableHead>主题</TableHead>
              <TableHead>模板</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    加载中...
                  </div>
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="text-center py-8 text-muted-foreground">暂无邮件发送记录</div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <div>
                      <div className="text-sm text-foreground">{log.toEmail}</div>
                      {log.userName && (
                        <div className="text-xs text-muted-foreground">{log.userName}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-foreground/80 line-clamp-1">{log.subject}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.template}</Badge>
                  </TableCell>
                  <TableCell>{statusBadge(log.status)}</TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}
