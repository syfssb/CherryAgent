import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Mail,
  Gift,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

// ============================================================
// 类型定义
// ============================================================

interface ConfigItem {
  key: string
  value: string
  description: string | null
  updatedAt: string
  updatedBy: string | null
}

interface ConfigsResponse {
  configs: ConfigItem[]
}

// ============================================================
// 配置项定义
// ============================================================

const CONFIG_SECTIONS = [
  {
    key: 'contact_email',
    label: '联系邮箱',
    description: '用户联系我们时显示的邮箱地址',
    icon: Mail,
    type: 'input' as const,
  },
  {
    key: 'welcome_credits',
    label: '新用户欢迎积分',
    description: '新用户注册时赠送的积分数量',
    icon: Gift,
    type: 'input' as const,
  },
]

// ============================================================
// 服务
// ============================================================

const configsService = {
  async getConfigs() {
    return api.get<ConfigsResponse>('/admin/configs')
  },

  async updateConfig(key: string, value: string) {
    return api.put<{ message: string; config: ConfigItem }>(
      `/admin/configs/${encodeURIComponent(key)}`,
      { value }
    )
  },
}

// ============================================================
// 组件
// ============================================================

export default function ContentConfigPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('contact_email')
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 查询所有配置
  const { data: response, isLoading } = useQuery({
    queryKey: ['admin-configs'],
    queryFn: () => configsService.getConfigs(),
  })

  const configs = response?.data?.configs ?? []

  // 初始化编辑值
  useEffect(() => {
    if (configs.length > 0) {
      const values: Record<string, string> = {}
      for (const config of configs) {
        values[config.key] = config.value
      }
      setEditValues((prev) => {
        // 只在首次加载时设置，避免覆盖用户编辑
        const hasValues = Object.keys(prev).length > 0
        return hasValues ? prev : values
      })
    }
  }, [configs])

  // 保存配置
  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      configsService.updateConfig(key, value),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-configs'] })
      const section = CONFIG_SECTIONS.find((s) => s.key === variables.key)
      showMessage('success', `${section?.label ?? '配置'}保存成功`)
    },
    onError: (err: Error) => {
      showMessage('error', `保存失败: ${err.message}`)
    },
  })

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleSave = (key: string) => {
    const value = editValues[key] ?? ''
    saveMutation.mutate({ key, value })
  }

  const handleValueChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }))
  }

  const activeSection = CONFIG_SECTIONS.find((s) => s.key === activeTab)
  const activeConfig = configs.find((c) => c.key === activeTab)

  if (isLoading) {
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">内容配置</h1>
        <p className="text-muted-foreground mt-1">管理系统基础配置（法律文档请前往"内容管理"菜单）</p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={cn(
            'flex items-center gap-3 p-4 rounded-lg',
            message.type === 'success'
              ? 'bg-success/10 border border-success/20 text-success'
              : 'bg-destructive/10 border border-destructive/20 text-destructive'
          )}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="flex gap-6">
        {/* 左侧 Tab 导航 */}
        <div className="w-56 shrink-0">
          <nav className="space-y-1">
            {CONFIG_SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = activeTab === section.key

              return (
                <button
                  key={section.key}
                  onClick={() => setActiveTab(section.key)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all',
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Icon size={18} />
                  <span className="text-sm">{section.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 min-w-0">
          {activeSection && (
            <Card>
              <CardHeader>
                <CardTitle>{activeSection.label}</CardTitle>
                <CardDescription>{activeSection.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeSection.type === 'textarea' ? (
                  <textarea
                    value={editValues[activeSection.key] ?? ''}
                    onChange={(e) => handleValueChange(activeSection.key, e.target.value)}
                    placeholder={`请输入${activeSection.label}内容...`}
                    rows={20}
                    className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[300px] font-mono"
                  />
                ) : (
                  <Input
                    value={editValues[activeSection.key] ?? ''}
                    onChange={(e) => handleValueChange(activeSection.key, e.target.value)}
                    placeholder={`请输入${activeSection.label}`}
                  />
                )}

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-muted-foreground">
                    {activeConfig?.updatedAt && (
                      <span>
                        最后更新: {new Date(activeConfig.updatedAt).toLocaleString('zh-CN')}
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => handleSave(activeSection.key)}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending && <Loader2 size={16} className="mr-2 animate-spin" />}
                    <Save size={16} className="mr-2" />
                    保存
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
