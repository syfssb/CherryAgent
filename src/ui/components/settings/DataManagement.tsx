import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/ui/components/ui/dialog'
import { Checkbox } from '@/ui/components/ui/checkbox'
import { cn } from '@/ui/lib/utils'

/**
 * 导出选项
 */
interface ExportOptions {
  sessions: boolean
  memories: boolean
  skills: boolean
  settings: boolean
}

/**
 * 导入选项
 */
interface ImportOptions {
  mode: 'merge' | 'overwrite'
  sessions: boolean
  memories: boolean
  skills: boolean
  settings: boolean
}

/**
 * 导入结果
 */
interface ImportResult {
  success: boolean
  imported: {
    sessions: number
    memories: number
    skills: number
    settings: boolean
  }
  errors: string[]
}

/**
 * 数据管理组件 Props
 */
interface DataManagementProps {
  className?: string
}

/**
 * 数据管理组件
 *
 * 提供数据导出和导入功能，包括：
 * - 导出数据按钮和选项
 * - 导出进度显示
 * - 导入数据按钮和选项
 * - 导入确认对话框
 * - 导入结果显示
 */
export function DataManagement({ className }: DataManagementProps) {
  const { t } = useTranslation()

  // 导出状态
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    sessions: true,
    memories: true,
    skills: true,
    settings: true,
  })

  // 导入状态
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showImportResultDialog, setShowImportResultDialog] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    mode: 'merge',
    sessions: true,
    memories: true,
    skills: true,
    settings: true,
  })
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  /**
   * 处理导出选项变更
   */
  const handleExportOptionChange = useCallback((key: keyof ExportOptions) => {
    setExportOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  /**
   * 处理导入选项变更
   */
  const handleImportOptionChange = useCallback((key: keyof Omit<ImportOptions, 'mode'>) => {
    setImportOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  /**
   * 执行导出
   */
  const handleExport = useCallback(async () => {
    setIsExporting(true)
    setExportProgress(0)

    try {
      // 调用 Electron IPC 获取真实数据
      setExportProgress(20)
      const result = await window.electron?.data?.exportSimple?.()

      if (!result?.success || !result.data) {
        throw new Error(result?.error || 'Export failed')
      }

      setExportProgress(60)

      // 根据用户选项过滤数据
      const exportData = {
        version: result.data.version,
        exportedAt: result.data.exportedAt,
        data: {
          sessions: exportOptions.sessions ? result.data.data.sessions : undefined,
          messages: exportOptions.sessions ? result.data.data.messages : undefined,
          tags: exportOptions.sessions ? result.data.data.tags : undefined,
          sessionTags: exportOptions.sessions ? result.data.data.sessionTags : undefined,
          memories: exportOptions.memories ? result.data.data.memories : undefined,
          skills: exportOptions.skills ? result.data.data.skills : undefined,
          settings: exportOptions.settings ? result.data.data.settings : undefined,
        }
      }

      setExportProgress(80)

      // 创建下载
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cherry-agent-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setExportProgress(100)
    } catch (error) {
      console.error('Export failed:', error)
      alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsExporting(false)
      setExportProgress(0)
    }
  }, [exportOptions])

  /**
   * 处理文件选择
   */
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setShowImportDialog(true)
    }
    // 重置 input 以便可以重新选择同一文件
    event.target.value = ''
  }, [])

  /**
   * 执行导入
   */
  const handleImport = useCallback(async () => {
    if (!selectedFile) return

    setIsImporting(true)
    setImportProgress(0)

    try {
      // 读取文件
      const text = await selectedFile.text()
      const data = JSON.parse(text)

      setImportProgress(20)

      const result = await window.electron?.data?.importSimple?.(data, {
        strategy: importOptions.mode,
        conflictResolution: importOptions.mode === 'overwrite' ? 'keep_remote' : 'keep_newer',
        include: {
          sessions: importOptions.sessions,
          messages: importOptions.sessions,
          tags: importOptions.sessions,
          memories: importOptions.memories,
          archivalMemories: false,
          skills: importOptions.skills,
          settings: importOptions.settings,
        },
      })

      setImportProgress(90)

      if (!result?.success || !result.data?.stats) {
        throw new Error(result?.error || 'Import failed')
      }

      const stats = result.data.stats
      const importResultData: ImportResult = {
        success: true,
        imported: {
          sessions: (stats.sessions?.imported ?? 0) + (stats.sessions?.updated ?? 0),
          memories: (stats.memoryBlocks?.imported ?? 0) + (stats.memoryBlocks?.updated ?? 0),
          skills: (stats.skills?.imported ?? 0) + (stats.skills?.updated ?? 0),
          settings: ((stats.settings?.imported ?? 0) + (stats.settings?.updated ?? 0)) > 0,
        },
        errors: result.data.warnings ?? [],
      }

      setImportProgress(100)
      setImportResult(importResultData)
      setShowImportDialog(false)
      setShowImportResultDialog(true)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setImportResult({
        success: false,
        imported: { sessions: 0, memories: 0, skills: 0, settings: false },
        errors: [errorMessage],
      })
      setShowImportDialog(false)
      setShowImportResultDialog(true)
    } finally {
      setIsImporting(false)
      setImportProgress(0)
      setSelectedFile(null)
    }
  }, [selectedFile, importOptions])

  /**
   * 检查是否有导出选项被选中
   */
  const hasExportOptions = Object.values(exportOptions).some(Boolean)

  /**
   * 检查是否有导入选项被选中
   */
  const hasImportOptions = importOptions.sessions || importOptions.memories || importOptions.skills || importOptions.settings

  return (
    <div className={cn('space-y-6', className)}>
      {/* 导出部分 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-ink-900 dark:text-ink-900">
            {t('dataManagement.export.title')}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {t('dataManagement.export.description')}
          </p>
        </div>

        {/* 导出选项 */}
        <div className="grid grid-cols-2 gap-3">
          <ExportOptionItem
            label={t('dataManagement.export.sessions')}
            checked={exportOptions.sessions}
            onChange={() => handleExportOptionChange('sessions')}
          />
          <ExportOptionItem
            label={t('dataManagement.export.memories')}
            checked={exportOptions.memories}
            onChange={() => handleExportOptionChange('memories')}
          />
          <ExportOptionItem
            label={t('dataManagement.export.skills')}
            checked={exportOptions.skills}
            onChange={() => handleExportOptionChange('skills')}
          />
          <ExportOptionItem
            label={t('dataManagement.export.settings')}
            checked={exportOptions.settings}
            onChange={() => handleExportOptionChange('settings')}
          />
        </div>

        {/* 导出进度 */}
        {isExporting && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{t('dataManagement.export.exporting')}</span>
              <span>{exportProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary dark:bg-surface-tertiary">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* 导出按钮 */}
        <Button
          onClick={handleExport}
          disabled={isExporting || !hasExportOptions}
          className="w-full"
        >
          {isExporting ? (
            <>
              <LoadingSpinner />
              {t('dataManagement.export.exporting')}
            </>
          ) : (
            <>
              <ExportIcon />
              {t('dataManagement.export.button')}
            </>
          )}
        </Button>
      </div>

      {/* 分隔线 */}
      <div className="border-t border-ink-200 dark:border-ink-700" />

      {/* 导入部分 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-ink-900 dark:text-ink-900">
            {t('dataManagement.import.title')}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {t('dataManagement.import.description')}
          </p>
        </div>

        {/* 导入按钮 */}
        <label className="block">
          <input
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button variant="outline" className="w-full cursor-pointer" asChild>
            <span>
              <ImportIcon />
              {t('dataManagement.import.button')}
            </span>
          </Button>
        </label>
      </div>

      {/* 导入确认对话框 */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dataManagement.import.confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('dataManagement.import.confirmDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 文件信息 */}
            {selectedFile && (
              <div className="rounded-lg bg-surface-secondary dark:bg-surface-tertiary p-3">
                <div className="flex items-center gap-2">
                  <FileIcon />
                  <span className="text-sm text-ink-900 dark:text-ink-900 truncate">
                    {selectedFile.name}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </div>
              </div>
            )}

            {/* 导入模式 */}
            <div className="space-y-2.5">
              <label className="text-sm font-medium text-ink-900 dark:text-ink-900">
                {t('dataManagement.import.mode')}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImportOptions(prev => ({ ...prev, mode: 'merge' }))}
                  className={cn(
                    "flex-1 rounded-xl border-[1.5px] px-4 py-2.5 text-sm transition-all duration-150",
                    importOptions.mode === 'merge'
                      ? "border-accent/40 bg-accent/[0.06] text-accent font-medium dark:border-accent/30 dark:bg-accent/[0.08]"
                      : "border-ink-900/8 text-ink-700 hover:border-ink-900/15 dark:border-ink-100/10 dark:text-ink-700 dark:hover:border-ink-100/20"
                  )}
                >
                  {t('dataManagement.import.merge')}
                </button>
                <button
                  type="button"
                  onClick={() => setImportOptions(prev => ({ ...prev, mode: 'overwrite' }))}
                  className={cn(
                    "flex-1 rounded-xl border-[1.5px] px-4 py-2.5 text-sm transition-all duration-150",
                    importOptions.mode === 'overwrite'
                      ? "border-accent/40 bg-accent/[0.06] text-accent font-medium dark:border-accent/30 dark:bg-accent/[0.08]"
                      : "border-ink-900/8 text-ink-700 hover:border-ink-900/15 dark:border-ink-100/10 dark:text-ink-700 dark:hover:border-ink-100/20"
                  )}
                >
                  {t('dataManagement.import.overwrite')}
                </button>
              </div>
            </div>

            {/* 导入选项 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-900 dark:text-ink-900">
                {t('dataManagement.import.options')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <ExportOptionItem
                  label={t('dataManagement.export.sessions')}
                  checked={importOptions.sessions}
                  onChange={() => handleImportOptionChange('sessions')}
                />
                <ExportOptionItem
                  label={t('dataManagement.export.memories')}
                  checked={importOptions.memories}
                  onChange={() => handleImportOptionChange('memories')}
                />
                <ExportOptionItem
                  label={t('dataManagement.export.skills')}
                  checked={importOptions.skills}
                  onChange={() => handleImportOptionChange('skills')}
                />
                <ExportOptionItem
                  label={t('dataManagement.export.settings')}
                  checked={importOptions.settings}
                  onChange={() => handleImportOptionChange('settings')}
                />
              </div>
            </div>

            {/* 导入进度 */}
            {isImporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{t('dataManagement.import.importing')}</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary dark:bg-surface-tertiary">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* 覆盖警告 */}
            {importOptions.mode === 'overwrite' && (
              <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
                <div className="flex items-start gap-2">
                  <WarningIcon className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <p className="text-xs text-warning">
                    {t('dataManagement.import.overwriteWarning')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportDialog(false)
                setSelectedFile(null)
              }}
              disabled={isImporting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleImport}
              disabled={isImporting || !hasImportOptions}
            >
              {isImporting ? (
                <>
                  <LoadingSpinner />
                  {t('dataManagement.import.importing')}
                </>
              ) : (
                t('dataManagement.import.confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入结果对话框 */}
      <Dialog open={showImportResultDialog} onOpenChange={setShowImportResultDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {importResult?.success
                ? t('dataManagement.import.successTitle')
                : t('dataManagement.import.failedTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {importResult?.success ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="rounded-full bg-success/10 p-3">
                    <SuccessIcon className="h-6 w-6 text-success" />
                  </div>
                </div>

                <div className="space-y-2">
                  <ImportResultItem
                    label={t('dataManagement.export.sessions')}
                    count={importResult.imported.sessions}
                  />
                  <ImportResultItem
                    label={t('dataManagement.export.memories')}
                    count={importResult.imported.memories}
                  />
                  <ImportResultItem
                    label={t('dataManagement.export.skills')}
                    count={importResult.imported.skills}
                  />
                  {importResult.imported.settings && (
                    <ImportResultItem
                      label={t('dataManagement.export.settings')}
                      imported
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="rounded-full bg-error/10 p-3">
                    <ErrorIcon className="h-6 w-6 text-error" />
                  </div>
                </div>

                {importResult?.errors && importResult.errors.length > 0 && (
                  <div className="rounded-lg bg-error/10 border border-error/20 p-3">
                    <ul className="list-disc list-inside text-xs text-error space-y-1">
                      {importResult.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setShowImportResultDialog(false)}>
              {t('common.ok')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * 导出选项项组件
 */
interface ExportOptionItemProps {
  label: string
  checked: boolean
  onChange: () => void
}

function ExportOptionItem({ label, checked, onChange }: ExportOptionItemProps) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 cursor-pointer rounded-xl border-[1.5px] p-3.5 transition-all duration-150",
        checked
          ? "border-accent/30 bg-accent/[0.04] dark:border-accent/25 dark:bg-accent/[0.06]"
          : "border-ink-900/8 bg-surface hover:border-ink-900/15 dark:border-ink-100/10 dark:bg-surface-tertiary dark:hover:border-ink-100/20"
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={() => onChange()}
      />
      <span className="text-sm text-ink-700 dark:text-ink-700">{label}</span>
    </label>
  )
}

/**
 * 导入结果项组件
 */
interface ImportResultItemProps {
  label: string
  count?: number
  imported?: boolean
}

function ImportResultItem({ label, count, imported }: ImportResultItemProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-ink-900 dark:text-ink-900 font-medium">
        {count !== undefined ? count : imported ? 'OK' : '-'}
      </span>
    </div>
  )
}

/**
 * Loading Spinner 组件
 */
function LoadingSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

/**
 * Export Icon
 */
function ExportIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

/**
 * Import Icon
 */
function ImportIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

/**
 * File Icon
 */
function FileIcon() {
  return (
    <svg className="h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

/**
 * Warning Icon
 */
function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

/**
 * Success Icon
 */
function SuccessIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

/**
 * Error Icon
 */
function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

export default DataManagement
