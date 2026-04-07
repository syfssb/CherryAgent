import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, FileText, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { I18nEditor, extractFieldI18n, buildI18nPayload } from '@/components/ui/I18nEditor'
import { MarkdownPreview } from '@/components/ui/MarkdownPreview'
import { legalContentsService } from '@/services/legal-contents'
import { toast } from 'sonner'

export default function TermsOfServicePage() {
  const queryClient = useQueryClient()
  const [contentI18n, setContentI18n] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // 加载服务条款
  const { data, isLoading, error } = useQuery({
    queryKey: ['legal-content', 'terms_of_service'],
    queryFn: () => legalContentsService.getLegalContent('terms_of_service'),
  })

  const legalContent = data?.data?.legalContent

  // 初始化表单数据
  useEffect(() => {
    if (legalContent) {
      setContentI18n(extractFieldI18n(legalContent.i18n, 'content', legalContent.content))
    }
  }, [legalContent])

  // 保存更新
  const handleSave = async () => {
    if (!contentI18n.en?.trim()) {
      toast.error('请填写英文内容')
      return
    }

    setSaving(true)
    try {
      const i18n = buildI18nPayload({ content: contentI18n })
      await legalContentsService.updateLegalContent('terms_of_service', {
        content: contentI18n.en,
        i18n,
      })

      queryClient.invalidateQueries({ queryKey: ['legal-content', 'terms_of_service'] })
      toast.success('服务条款更新成功')
    } catch (err) {
      console.error('保存失败:', err)
      toast.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">加载失败，请刷新重试</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">服务条款</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理服务条款内容，支持多语言编辑
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              保存更新
            </>
          )}
        </Button>
      </div>

      {/* 版本信息 */}
      {legalContent && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">版本:</span> v{legalContent.version}
              </div>
              <div>
                <span className="font-medium">最后更新:</span>{' '}
                {new Date(legalContent.updatedAt).toLocaleString('zh-CN')}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 内容编辑器 */}
      <Card>
        <CardHeader>
          <CardTitle>服务条款内容</CardTitle>
        </CardHeader>
        <CardContent>
          <I18nEditor
            value={contentI18n}
            onChange={setContentI18n}
            label="内容"
            multiline
            required
            placeholder="请输入服务条款内容（支持 Markdown 格式）"
            renderPreview={(content) => <MarkdownPreview content={content} />}
          />
        </CardContent>
      </Card>
    </div>
  )
}
