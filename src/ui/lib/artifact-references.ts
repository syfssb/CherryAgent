import type { ArtifactFile } from '@/ui/hooks/useArtifacts';

export type ArtifactCategory =
  | 'document'
  | 'spreadsheet'
  | 'image'
  | 'code'
  | 'data'
  | 'archive'
  | 'file';

const OUTPUT_HINTS = [
  '已生成',
  '已创建',
  '已保存',
  '导出',
  '输出',
  '附件',
  '文件',
  'generated',
  'created',
  'saved',
  'exported',
  'attached',
  'file',
  'document',
  'report',
];

const RECENT_ARTIFACT_WINDOW_MS = 2 * 60 * 1000;

export function getArtifactFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function getArtifactExtensionLabel(filePath: string): string {
  const ext = filePath.split('.').pop()?.trim();
  return ext ? ext.toUpperCase() : 'FILE';
}

export function getArtifactCategory(filePath: string): ArtifactCategory {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';

  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'spreadsheet';
  if (['md', 'mdx', 'txt', 'doc', 'docx', 'pdf', 'rtf', 'pages', 'html', 'htm'].includes(ext)) return 'document';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return 'image';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'json', 'yaml', 'yml', 'sql'].includes(ext)) return 'code';
  if (['jsonl', 'parquet', 'feather', 'db'].includes(ext)) return 'data';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  return 'file';
}

function normalizeText(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}

function doesMessageReferenceArtifact(messageText: string, artifactPath: string): boolean {
  const normalizedText = normalizeText(messageText);
  const normalizedPath = normalizeText(artifactPath);
  const fileName = normalizeText(getArtifactFileName(artifactPath));
  const tail2 = normalizedPath.split('/').slice(-2).join('/');
  const tail3 = normalizedPath.split('/').slice(-3).join('/');

  return [normalizedPath, fileName, tail2, tail3]
    .filter((candidate) => candidate.length > 0)
    .some((candidate) => normalizedText.includes(candidate));
}

function messageSuggestsOutput(messageText: string): boolean {
  const normalizedText = normalizeText(messageText);
  return OUTPUT_HINTS.some((keyword) => normalizedText.includes(keyword.toLowerCase()));
}

function mentionsFileLikeToken(messageText: string): boolean {
  return /[\w-]+\.[a-z0-9]{2,8}/i.test(messageText);
}

export function findReferencedArtifacts(
  messageText: string,
  artifacts: ArtifactFile[],
  messageTimestamp?: number,
  limit = 3,
): ArtifactFile[] {
  const normalizedText = messageText.trim();
  if (!normalizedText) return [];

  const eligibleArtifacts = artifacts
    .filter((artifact) => (
      typeof messageTimestamp !== 'number' || artifact.timestamp <= messageTimestamp
    ))
    .sort((left, right) => right.timestamp - left.timestamp);

  const explicitMatches = eligibleArtifacts.filter((artifact) =>
    doesMessageReferenceArtifact(normalizedText, artifact.path),
  );

  if (explicitMatches.length > 0) {
    return explicitMatches.slice(0, limit);
  }

  if (mentionsFileLikeToken(normalizedText)) {
    return [];
  }

  if (typeof messageTimestamp !== 'number' || !messageSuggestsOutput(normalizedText)) {
    return [];
  }

  return eligibleArtifacts
    .filter((artifact) => messageTimestamp - artifact.timestamp <= RECENT_ARTIFACT_WINDOW_MS)
    .slice(0, limit);
}
