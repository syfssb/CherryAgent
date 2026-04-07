import { useState, type ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'
import { Input } from './input'
import { Textarea } from './textarea'
import { cn } from '@/lib/utils'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-TW', label: '繁體中文' },
] as const

interface I18nEditorProps {
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
  label: string
  multiline?: boolean
  required?: boolean
  placeholder?: string
  /** 可选：为当前语言内容渲染预览，传入后会显示 编辑/预览 切换按钮 */
  renderPreview?: (content: string) => ReactNode
}

export function I18nEditor({
  value,
  onChange,
  label,
  multiline = false,
  required = false,
  placeholder,
  renderPreview,
}: I18nEditorProps) {
  const [activeTab, setActiveTab] = useState<string>('en')
  const [previewMode, setPreviewMode] = useState(false)

  const handleChange = (lang: string, text: string) => {
    onChange({ ...value, [lang]: text })
  }

  const hasContent = (lang: string): boolean => {
    return Boolean(value[lang]?.trim())
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        {renderPreview && multiline && (
          <div className="inline-flex h-7 items-center rounded-md bg-muted p-0.5 text-muted-foreground">
            <button
              type="button"
              onClick={() => setPreviewMode(false)}
              className={cn(
                'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium transition-colors',
                !previewMode && 'bg-background text-foreground shadow-sm'
              )}
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode(true)}
              className={cn(
                'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium transition-colors',
                previewMode && 'bg-background text-foreground shadow-sm'
              )}
            >
              预览
            </button>
          </div>
        )}
      </div>
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPreviewMode(false) }}>
        <TabsList className="h-8">
          {LANGUAGES.map((lang) => (
            <TabsTrigger
              key={lang.code}
              value={lang.code}
              className={cn(
                'text-xs px-2.5 py-1',
                !hasContent(lang.code) && activeTab !== lang.code && 'text-muted-foreground/50'
              )}
            >
              {lang.label}
              {lang.code === 'en' && required && (
                <span className="text-destructive ml-0.5 text-[10px]">*</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {LANGUAGES.map((lang) => (
          <TabsContent key={lang.code} value={lang.code} className="mt-2">
            {renderPreview && previewMode ? (
              <div className="min-h-[120px] w-full rounded-md border border-input bg-muted/30 px-4 py-3 text-sm">
                {hasContent(lang.code)
                  ? renderPreview(value[lang.code] ?? '')
                  : <span className="text-muted-foreground italic">暂无内容</span>
                }
              </div>
            ) : multiline ? (
              <Textarea
                value={value[lang.code] ?? ''}
                onChange={(e) => handleChange(lang.code, e.target.value)}
                placeholder={
                  placeholder
                    ?? (lang.code === 'en'
                      ? `请输入${label}（英文，主语言）`
                      : `请输入${label}（${lang.label}，可选）`)
                }
                rows={4}
                required={required && lang.code === 'en'}
              />
            ) : (
              <Input
                value={value[lang.code] ?? ''}
                onChange={(e) => handleChange(lang.code, e.target.value)}
                placeholder={
                  placeholder
                    ?? (lang.code === 'en'
                      ? `请输入${label}（英文，主语言）`
                      : `请输入${label}（${lang.label}，可选）`)
                }
                required={required && lang.code === 'en'}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

/**
 * 从嵌套的 i18n 对象中提取某个字段的扁平语言映射
 * 例如: extractFieldI18n({ zh: { title: "标题" }, ja: { title: "タイトル" } }, "title", "English Title")
 * 返回: { en: "English Title", zh: "标题", ja: "タイトル", "zh-TW": "" }
 */
export function extractFieldI18n(
  i18n: Record<string, Record<string, string>> | null | undefined,
  field: string,
  enValue: string
): Record<string, string> {
  const result: Record<string, string> = { en: enValue }
  if (i18n) {
    for (const lang of ['zh', 'ja', 'zh-TW']) {
      result[lang] = i18n[lang]?.[field] ?? ''
    }
  }
  return result
}

/**
 * 从多个扁平语言映射构建嵌套的 i18n 对象
 * 例如: buildI18nPayload({ title: { en: "...", zh: "标题" }, content: { en: "...", zh: "内容" } })
 * 返回: { zh: { title: "标题", content: "内容" } }
 * 注意: en 值不放入 i18n，因为英文存在原始字段中
 */
export function buildI18nPayload(
  fields: Record<string, Record<string, string>>
): Record<string, Record<string, string>> {
  const i18n: Record<string, Record<string, string>> = {}
  for (const lang of ['zh', 'ja', 'zh-TW']) {
    const langData: Record<string, string> = {}
    for (const [fieldName, langMap] of Object.entries(fields)) {
      const val = langMap[lang]?.trim()
      if (val) {
        langData[fieldName] = val
      }
    }
    if (Object.keys(langData).length > 0) {
      i18n[lang] = langData
    }
  }
  return i18n
}
