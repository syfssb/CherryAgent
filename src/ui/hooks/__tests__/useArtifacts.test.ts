import { describe, expect, it } from 'vitest';
import type { SystemObservableEvent } from '@/ui/store/types';
import {
  type ToolExecutionState,
  listExecutionsForSession,
} from '@/ui/hooks/useToolExecutionStore';
import { collectArtifacts } from '@/ui/hooks/useArtifacts';

describe('collectArtifacts', () => {
  it('merges persisted files and successful write tools, then deduplicates by path', () => {
    const events: SystemObservableEvent[] = [
      { kind: 'files_persisted', files: ['/tmp/a.md', '/tmp/b.md'], timestamp: 10 },
    ];
    const executions: ToolExecutionState[] = [
      { toolUseId: '1', toolName: 'Write', status: 'success', input: { file_path: '/tmp/a.md' }, endTime: 20 },
      { toolUseId: '2', toolName: 'Edit', status: 'success', input: { file_path: '/tmp/c.md' }, endTime: 15 },
      { toolUseId: '3', toolName: 'Read', status: 'success', input: { file_path: '/tmp/ignored.md' }, endTime: 30 },
    ];

    const { artifacts, accessedFiles } = collectArtifacts(events, executions);
    expect(artifacts).toEqual([
      { path: '/tmp/a.md', timestamp: 20 },
      { path: '/tmp/c.md', timestamp: 15 },
      { path: '/tmp/b.md', timestamp: 10 },
    ]);
    // Read tool files go to accessedFiles, not artifacts
    expect(artifacts.map((a) => a.path)).not.toContain('/tmp/ignored.md');
    expect(accessedFiles.map((f) => f.path)).toContain('/tmp/ignored.md');
  });

  it('routes code files written by tools to workingFiles, not artifacts', () => {
    const events: SystemObservableEvent[] = [];
    const executions: ToolExecutionState[] = [
      { toolUseId: '1', toolName: 'Write', status: 'success', input: { file_path: '/tmp/main.py' }, endTime: 10 },
      { toolUseId: '2', toolName: 'Edit', status: 'success', input: { file_path: '/tmp/report.md' }, endTime: 20 },
    ];

    const { artifacts, workingFiles } = collectArtifacts(events, executions);
    expect(artifacts.map((a) => a.path)).toContain('/tmp/report.md');
    expect(artifacts.map((a) => a.path)).not.toContain('/tmp/main.py');
    expect(workingFiles.map((f) => f.path)).toContain('/tmp/main.py');
    expect(workingFiles.map((f) => f.path)).not.toContain('/tmp/report.md');
  });

  it('routes Read tool files to accessedFiles regardless of file type', () => {
    const events: SystemObservableEvent[] = [];
    const executions: ToolExecutionState[] = [
      { toolUseId: '1', toolName: 'Read', status: 'success', input: { file_path: '/tmp/main.py' }, endTime: 10 },
      { toolUseId: '2', toolName: 'Read', status: 'success', input: { file_path: '/tmp/notes.md' }, endTime: 20 },
    ];

    const { artifacts, workingFiles, accessedFiles } = collectArtifacts(events, executions);
    expect(artifacts).toHaveLength(0);
    expect(workingFiles).toHaveLength(0);
    expect(accessedFiles.map((f) => f.path)).toContain('/tmp/main.py');
    expect(accessedFiles.map((f) => f.path)).toContain('/tmp/notes.md');
  });

  it('filters out noisy node_modules paths', () => {
    const events: SystemObservableEvent[] = [
      { kind: 'files_persisted', files: ['/project/node_modules/some-pkg/file.md', '/project/report.pdf'], timestamp: 10 },
    ];
    const { artifacts } = collectArtifacts(events, []);
    const paths = artifacts.map((a) => a.path);
    expect(paths).not.toContain('/project/node_modules/some-pkg/file.md');
    expect(paths).toContain('/project/report.pdf');
  });

  it('filters tool executions by session before building the work panel', () => {
    const executions: Record<string, ToolExecutionState> = {
      a: { toolUseId: 'a', sessionId: 'session-a', toolName: 'Write', status: 'success', input: { file_path: '/tmp/a.md' }, endTime: 10 },
      b: { toolUseId: 'b', sessionId: 'session-b', toolName: 'Write', status: 'success', input: { file_path: '/tmp/b.md' }, endTime: 20 },
    };

    expect(listExecutionsForSession(executions, 'session-a').map((item) => item.toolUseId)).toEqual(['a']);
    expect(listExecutionsForSession(executions, 'session-b').map((item) => item.toolUseId)).toEqual(['b']);
    expect(listExecutionsForSession(executions, 'missing')).toEqual([]);
  });
});
