import {
  File,
  FileArchive,
  FileCode2,
  FileText,
  Image,
  Table2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/ui/hooks/use-toast';
import type { ArtifactFile } from '@/ui/hooks/useArtifacts';
import {
  getArtifactCategory,
  getArtifactExtensionLabel,
  getArtifactFileName,
} from '@/ui/lib/artifact-references';

interface MessageAttachmentCardProps {
  artifact: ArtifactFile;
  cwd?: string;
}

const DEFAULT_ATTACHMENT_LABELS = {
  document: '文档',
  spreadsheet: '表格',
  image: '图片',
  code: '代码',
  data: '数据',
  archive: '压缩包',
  file: '文件',
} as const;

function AttachmentIcon({ path }: { path: string }) {
  const category = getArtifactCategory(path);

  if (category === 'spreadsheet') {
    return <Table2 className="h-5 w-5 text-emerald-500" />;
  }
  if (category === 'document') {
    return <FileText className="h-5 w-5 text-blue-400" />;
  }
  if (category === 'image') {
    return <Image className="h-5 w-5 text-orange-400" />;
  }
  if (category === 'code' || category === 'data') {
    return <FileCode2 className="h-5 w-5 text-purple-400" />;
  }
  if (category === 'archive') {
    return <FileArchive className="h-5 w-5 text-amber-500" />;
  }
  return <File className="h-5 w-5 text-ink-500" />;
}

export function MessageAttachmentCard({ artifact, cwd }: MessageAttachmentCardProps) {
  const { t } = useTranslation();

  const handleOpen = async () => {
    const result = await window.electron.shell.openPath(artifact.path, cwd);
    if (!result.success) {
      toast({
        title: t('chat.attachments.open', '打开'),
        description: result.error || artifact.path,
        variant: 'error',
      });
    }
  };

  const category = getArtifactCategory(artifact.path);
  const categoryLabel = t(`chat.attachments.types.${category}`, {
    defaultValue: DEFAULT_ATTACHMENT_LABELS[category],
  });

  return (
    <div className="rounded-2xl border border-ink-900/8 bg-surface-secondary/55 px-3 py-3" title={artifact.path}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-primary shadow-sm">
          <AttachmentIcon path={artifact.path} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-800">
            {getArtifactFileName(artifact.path)}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {categoryLabel} · {getArtifactExtensionLabel(artifact.path)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleOpen()}
          className="shrink-0 rounded-full bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-white"
        >
          {t('chat.attachments.open', '打开')}
        </button>
      </div>
    </div>
  );
}
