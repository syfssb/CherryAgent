import { describe, expect, it } from 'vitest';
import { findReferencedArtifacts, getArtifactCategory, getArtifactFileName } from '@/ui/lib/artifact-references';
import type { ArtifactFile } from '@/ui/hooks/useArtifacts';

describe('artifact references', () => {
  const artifacts: ArtifactFile[] = [
    { path: '/tmp/reports/rag-system-analysis-report.docx', timestamp: 1000 },
    { path: '/tmp/reports/summary.xlsx', timestamp: 1100 },
    { path: '/tmp/reports/late.md', timestamp: 3000 },
  ];

  it('matches explicit file name mentions', () => {
    expect(
      findReferencedArtifacts('我已生成 `rag-system-analysis-report.docx`，你可以打开它。', artifacts, 2000),
    ).toEqual([{ path: '/tmp/reports/rag-system-analysis-report.docx', timestamp: 1000 }]);
  });

  it('filters out artifacts created after the message time', () => {
    expect(
      findReferencedArtifacts('我已生成 late.md', artifacts, 2000),
    ).toEqual([]);
  });

  it('falls back to recent artifacts when output intent is obvious', () => {
    expect(
      findReferencedArtifacts('已生成报告文件，见下方附件。', artifacts, 1250),
    ).toEqual([
      { path: '/tmp/reports/summary.xlsx', timestamp: 1100 },
      { path: '/tmp/reports/rag-system-analysis-report.docx', timestamp: 1000 },
    ]);
  });

  it('classifies artifact metadata', () => {
    expect(getArtifactFileName('/tmp/reports/summary.xlsx')).toBe('summary.xlsx');
    expect(getArtifactCategory('/tmp/reports/summary.xlsx')).toBe('spreadsheet');
  });
});
