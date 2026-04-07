import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  FileCode2,
  FileText,
  FolderSearch,
  Image,
  Table2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/ui/hooks/use-toast';
import { useAppStore } from '@/ui/store/useAppStore';
import { useArtifacts, type ArtifactFile } from '@/ui/hooks/useArtifacts';
import { SectionTooltip } from './SectionTooltip';

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function getFileIcon(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return <Table2 className="h-3.5 w-3.5 text-[#87867f]" />;
  if (['md', 'mdx', 'txt', 'doc', 'docx', 'pdf', 'html', 'htm'].includes(ext)) return <FileText className="h-3.5 w-3.5 text-[#87867f]" />;
  if (['py', 'ts', 'tsx', 'js', 'jsx', 'json', 'sh'].includes(ext)) return <FileCode2 className="h-3.5 w-3.5 text-[#87867f]" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return <Image className="h-3.5 w-3.5 text-[#87867f]" />;
  return <File className="h-3.5 w-3.5 text-[#87867f]" />;
}

export function ArtifactsSection() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const { artifacts, liveWrites } = useArtifacts();
  const cwd = useAppStore((state) => {
    const sessionId = state.activeSessionId;
    return sessionId ? state.sessions[sessionId]?.cwd : undefined;
  });

  const handleOpenArtifact = async (artifact: ArtifactFile) => {
    const result = await window.electron.shell.openPath(artifact.path, cwd);
    if (!result.success) {
      toast({ title: t('workspace.openFile', '打开文件'), description: result.error || artifact.path, variant: 'error' });
    }
  };

  const handleRevealArtifact = async (artifact: ArtifactFile) => {
    const result = await window.electron.shell.showItemInFolder(artifact.path, cwd ?? '');
    if (!result.success) {
      toast({ title: t('workspace.revealInFolder', '在文件夹中定位'), description: result.error || artifact.path, variant: 'error' });
    }
  };

  const handleCopyPath = async (artifact: ArtifactFile) => {
    await navigator.clipboard.writeText(artifact.path);
    setCopiedPath(artifact.path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  return (
    <section className="border-b border-[#1414130d] dark:border-[#faf9f50d]">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]"
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[#87867f]">
            {t('workspace.artifacts', '产出物')}
          </span>
          {artifacts.length > 0 && (
            <span className="rounded-full bg-[#1414130d] dark:bg-[#faf9f50d] px-2 py-0.5 text-[11px] font-medium text-[#87867f]">
              {artifacts.length}
            </span>
          )}
          <SectionTooltip text={t('workspace.tooltipArtifacts', 'Files Claude created for you — spreadsheets, documents, images. Click to open.')} />
        </div>
        {collapsed
          ? <ChevronRight className="h-3 w-3 text-[#b0aea5]" />
          : <ChevronDown className="h-3 w-3 text-[#b0aea5]" />
        }
      </button>

      {!collapsed && (
        <div className="pb-3">
          {liveWrites.length > 0 && (
            <div className="space-y-0.5 px-2 pb-1">
              {liveWrites.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors duration-150"
                  title={file.path}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#1414130a] dark:bg-[#faf9f50a]">
                    <svg
                      className="h-3.5 w-3.5 animate-spin text-[#ae5630]/60"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-[#141413] dark:text-[#faf9f5]">
                      {getFileName(file.path)}
                    </p>
                    <p className="text-[10px] text-[#b0aea5]">
                      {t('workspace.writing', '写入中...')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {artifacts.length === 0 && liveWrites.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <div className="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-lg bg-[#1414130a] dark:bg-[#faf9f50a]">
                <FileText className="h-3.5 w-3.5 text-[#b0aea5]" />
              </div>
              <p className="text-[12px] text-[#b0aea5]">
                {t('workspace.outputsPlaceholder', '任务产出物将在这里显示')}
              </p>
            </div>
          ) : artifacts.length > 0 ? (
            <div className="space-y-0.5 px-2">
              {artifacts.map((artifact) => (
                <div
                  key={artifact.path}
                  className="group relative flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]"
                  title={artifact.path}
                >
                  <button
                    type="button"
                    onClick={() => void handleOpenArtifact(artifact)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#1414130a] dark:bg-[#faf9f50a]">
                      {getFileIcon(artifact.path)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-[#141413] dark:text-[#faf9f5]">
                        {getFileName(artifact.path)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyPath(artifact)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#87867f] opacity-0 transition-all duration-150 hover:bg-[#1414130d] hover:text-[#141413] group-hover:opacity-100 dark:hover:bg-[#faf9f50d] dark:hover:text-[#faf9f5]"
                    title={t('workspace.copyPath', '复制文件路径')}
                    aria-label={t('workspace.copyPath', '复制文件路径')}
                  >
                    {copiedPath === artifact.path ? (
                      <Check className="h-3.5 w-3.5 text-[#788c5d]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRevealArtifact(artifact)}
                    className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#87867f] opacity-0 transition-all duration-150 hover:bg-[#1414130d] hover:text-[#141413] group-hover:opacity-100 dark:hover:bg-[#faf9f50d] dark:hover:text-[#faf9f5]"
                    title={t('workspace.revealInFolder', '在文件夹中定位')}
                    aria-label={t('workspace.revealInFolder', '在文件夹中定位')}
                  >
                    <FolderSearch className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
