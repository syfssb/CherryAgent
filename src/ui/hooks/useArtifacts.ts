import { useMemo } from 'react';
import { useAppStore } from '@/ui/store/useAppStore';
import {
  useToolExecutionStore,
  listExecutionsForSession,
  type ToolExecutionState,
} from '@/ui/hooks/useToolExecutionStore';
import type { SystemObservableEvent } from '@/ui/store/types';

export interface ArtifactFile {
  path: string;
  timestamp: number;
}

const ARTIFACT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

/**
 * 代码/脚本类扩展名 — 属于工作文件，不作为产出物展示给用户
 */
const CODE_EXTENSIONS = new Set([
  'py', 'sh', 'bash', 'zsh', 'fish', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'swift', 'kt', 'r', 'scala', 'lua',
  // 配置/数据格式 — 通常是工作文件而非可交付产出物
  'json', 'yaml', 'yml', 'toml', 'xml', 'sql', 'env', 'ini', 'conf', 'cfg', 'lock', 'log',
]);

function isCodeFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return CODE_EXTENSIONS.has(ext);
}

/**
 * 噪声路径过滤 — 这些目录下的文件不应出现在产出物或工作文件中
 */
const NOISY_PATH_SEGMENTS = [
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit',
  'dist', 'build', '__pycache__', '.venv', 'venv', '.tox',
];

function isNoisyPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return NOISY_PATH_SEGMENTS.some((seg) => normalized.includes(`/${seg}/`) || normalized.includes(`/${seg}`));
}


export interface CollectResult {
  artifacts: ArtifactFile[];
  workingFiles: ArtifactFile[];
  accessedFiles: ArtifactFile[];
}

export function collectArtifacts(
  events: SystemObservableEvent[],
  executions: ToolExecutionState[],
): CollectResult {
  // 产出物：非代码的可交付文件（文档、表格、图片等）
  const artifactMap = new Map<string, number>();
  // 工作文件：代码/脚本类文件（Write/Edit/NotebookEdit 写入的源码）
  const workingFileMap = new Map<string, number>();
  // 已读文件：Read 工具访问的文件
  const accessedFileMap = new Map<string, number>();

  for (const event of events) {
    if (event.kind !== 'files_persisted') continue;
    for (const filePath of event.files) {
      if (isNoisyPath(filePath)) continue;
      const target = isCodeFile(filePath) ? workingFileMap : artifactMap;
      target.set(filePath, Math.max(target.get(filePath) ?? 0, event.timestamp));
    }
  }

  for (const execution of executions) {
    if (execution.status !== 'success') continue;

    // Read 工具 — 记录到 accessedFiles（不区分代码/非代码，只读不生产）
    if (execution.toolName === 'Read') {
      const filePath = typeof execution.input?.file_path === 'string'
        ? execution.input.file_path
        : undefined;
      if (filePath && !isNoisyPath(filePath)) {
        accessedFileMap.set(filePath, Math.max(accessedFileMap.get(filePath) ?? 0, execution.endTime ?? 0));
      }
      continue;
    }

    if (ARTIFACT_TOOLS.has(execution.toolName)) {
      const filePath = typeof execution.input?.file_path === 'string'
        ? execution.input.file_path
        : undefined;
      if (filePath && !isNoisyPath(filePath)) {
        const target = isCodeFile(filePath) ? workingFileMap : artifactMap;
        target.set(filePath, Math.max(target.get(filePath) ?? 0, execution.endTime ?? 0));
      }
      continue;
    }
  }

  const toSorted = (map: Map<string, number>): ArtifactFile[] =>
    Array.from(map.entries())
      .map(([path, timestamp]) => ({ path, timestamp }))
      .sort((left, right) => right.timestamp - left.timestamp);

  return { artifacts: toSorted(artifactMap), workingFiles: toSorted(workingFileMap), accessedFiles: toSorted(accessedFileMap) };
}

export interface UseArtifactsResult {
  /** 非代码产出物：文档、表格、图片等可交付文件 */
  artifacts: ArtifactFile[];
  /** 工作文件：Write/Edit/NotebookEdit 写入的代码/脚本文件 */
  workingFiles: ArtifactFile[];
  /** 已读文件：Read 工具访问的文件 */
  accessedFiles: ArtifactFile[];
  /** 正在写入中的文件（liveWrites 仅用于 ArtifactsSection 动画） */
  liveWrites: ArtifactFile[];
}

export function useArtifacts(): UseArtifactsResult {
  const session = useAppStore((state) => {
    const sessionId = state.activeSessionId;
    return sessionId ? state.sessions[sessionId] : null;
  });
  const executions = useToolExecutionStore((state) => state.executions);

  const { artifacts, workingFiles, accessedFiles } = useMemo(() => {
    const executionList = listExecutionsForSession(
      executions,
      session?.id ?? null,
    ) as ToolExecutionState[];
    return collectArtifacts(session?.observableEvents ?? [], executionList);
  }, [session?.id, session?.observableEvents, executions]);

  const liveWrites = useMemo(() => {
    return listExecutionsForSession(executions, session?.id ?? null)
      .filter(
        (e) =>
          ARTIFACT_TOOLS.has(e.toolName) &&
          e.status === 'running' &&
          typeof e.input?.file_path === 'string',
      )
      .map((e) => ({ path: e.input!.file_path as string, timestamp: Date.now() }));
  }, [session?.id, executions]);

  return { artifacts, workingFiles, accessedFiles, liveWrites };
}
