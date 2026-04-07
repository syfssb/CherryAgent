import { type ReactNode, memo, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import {
  FileText,
  FilePlus,
  FileEdit,
  BookOpen,
  Terminal,
  Search,
  CheckSquare,
  Globe,
  Cpu,
  Wrench,
} from 'lucide-react';
import { useToolExecutionStore } from '@/ui/hooks/useToolExecutionStore';
import { ExecutionLogItem, type ExecutionLogStatus } from './ExecutionLogItem';
import { ToolCallCard, type ToolCallStatus } from './ToolCallCard';

export interface ToolLogItemProps {
  toolUseId: string;
  toolName: string;
  input?: Record<string, unknown>;
  defaultExpanded?: boolean;
  showIndicator?: boolean;
  /** 权限等待暂停：工具等用户授权，之后会恢复 → pending */
  isPaused?: boolean;
  /** 会话正在终止：工具不会恢复 → error/cancelled */
  isStopping?: boolean;
}

const TOOL_ICONS: Record<string, ReactNode> = {
  // 文件操作
  Read:        <FileText className="w-3.5 h-3.5 text-blue-400" />,
  Write:       <FilePlus className="w-3.5 h-3.5 text-green-400" />,
  Edit:        <FileEdit className="w-3.5 h-3.5 text-yellow-400" />,
  NotebookEdit: <BookOpen className="w-3.5 h-3.5 text-purple-400" />,
  // Shell
  Bash:        <Terminal className="w-3.5 h-3.5 text-ink-500" />,
  // 搜索
  Glob:        <Search className="w-3.5 h-3.5 text-ink-400" />,
  Grep:        <Search className="w-3.5 h-3.5 text-ink-400" />,
  // Todo
  TodoWrite:   <CheckSquare className="w-3.5 h-3.5 text-accent" />,
  // Web
  WebFetch:    <Globe className="w-3.5 h-3.5 text-blue-300" />,
  WebSearch:   <Globe className="w-3.5 h-3.5 text-blue-300" />,
  // Agent
  Task:        <Cpu className="w-3.5 h-3.5 text-purple-400" />,
};

function getToolIcon(toolName: string): ReactNode {
  return TOOL_ICONS[toolName] ?? <Wrench className="w-3.5 h-3.5 text-ink-400" />;
}

function truncateSummary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || path;
}

function getToolSummary(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return '';

  switch (toolName) {
    case 'Bash': {
      const cmd = typeof input.command === 'string' ? input.command : '';
      return truncateSummary(cmd, 48);
    }
    case 'Read':
    case 'Write':
    case 'Edit': {
      const path = typeof input.file_path === 'string' ? input.file_path : '';
      const name = path ? getFileName(path) : '';
      return truncateSummary(name || path, 48);
    }
    case 'Glob':
    case 'Grep': {
      const pattern = typeof input.pattern === 'string' ? input.pattern : '';
      return truncateSummary(pattern, 48);
    }
    case 'Task': {
      const desc = typeof input.description === 'string' ? input.description : '';
      return truncateSummary(desc, 48);
    }
    case 'WebFetch': {
      const url = typeof input.url === 'string' ? input.url : '';
      return truncateSummary(url, 48);
    }
    case 'WebSearch': {
      const query = typeof input.query === 'string' ? input.query : '';
      return truncateSummary(query, 48);
    }
    case 'NotebookEdit': {
      const nbPath = typeof input.notebook_path === 'string' ? input.notebook_path : '';
      const name = nbPath ? getFileName(nbPath) : '';
      return truncateSummary(name || nbPath, 48);
    }
    case 'Agent': {
      const desc = typeof input.task === 'string' ? input.task : (typeof input.description === 'string' ? input.description : '');
      return truncateSummary(desc, 48);
    }
    case 'Skill': {
      const skillName = typeof input.name === 'string' ? input.name : '';
      return truncateSummary(skillName, 48);
    }
    default:
      return '';
  }
}

/** 执行中活动行：返回完整内容（不截断），让用户看到正在执行的具体命令/路径 */
function getFullToolActivity(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return '';

  switch (toolName) {
    case 'Bash': {
      const cmd = typeof input.command === 'string' ? input.command : '';
      // 多行命令只取第一行，避免撑开布局
      return cmd.split('\n')[0]?.trim() ?? '';
    }
    case 'Read':
    case 'Write':
    case 'Edit': {
      const path = typeof input.file_path === 'string' ? input.file_path : '';
      return path;
    }
    case 'Glob': {
      const pattern = typeof input.pattern === 'string' ? input.pattern : '';
      const dir = typeof input.path === 'string' ? input.path : '';
      return dir ? `${pattern}  in  ${dir}` : pattern;
    }
    case 'Grep': {
      const pattern = typeof input.pattern === 'string' ? input.pattern : '';
      const dir = typeof input.path === 'string' ? input.path : '';
      return dir ? `${pattern}  in  ${dir}` : pattern;
    }
    case 'Task': {
      const desc = typeof input.description === 'string' ? input.description : '';
      return desc;
    }
    case 'WebFetch': {
      const url = typeof input.url === 'string' ? input.url : '';
      return url;
    }
    case 'WebSearch': {
      const query = typeof input.query === 'string' ? input.query : '';
      return query;
    }
    case 'NotebookEdit': {
      const nbPath = typeof input.notebook_path === 'string' ? input.notebook_path : '';
      return nbPath;
    }
    case 'Agent': {
      const desc = typeof input.task === 'string' ? input.task : (typeof input.description === 'string' ? input.description : '');
      return desc;
    }
    case 'Skill': {
      const skillName = typeof input.name === 'string' ? input.name : '';
      return skillName;
    }
    default:
      return '';
  }
}

function mapExecutionStatus(
  storeStatus: ExecutionLogStatus | undefined,
  showIndicator: boolean,
  isPaused: boolean,
  isStopping: boolean
): ToolCallStatus {
  // 已到终态的工具不受暂停/停止影响
  if (storeStatus === 'success') return 'success';
  if (storeStatus === 'error') return 'error';

  // 会话正在终止：非终态工具标记为 error（不会恢复）
  if (isStopping) return 'error';

  // 权限等待暂停：非终态工具标记为 pending（等待用户授权后恢复）
  if (isPaused) return 'pending';

  if (showIndicator) return 'running';
  switch (storeStatus) {
    case 'running':
      return 'running';
    case 'pending':
    default:
      return 'pending';
  }
}

/**
 * ToolLogItem — 工具调用日志行
 *
 * memo 理由：
 * 1. 历史工具条目在 status=success/error 后完全冻结，父组件 streaming 期间的每次更新
 *    都不需要重渲染它们。
 * 2. useToolExecutionStore selector 已精确到单个 toolUseId 的执行状态，zustand 内部
 *    会做浅比较；但父组件仍可能传入新的 input 对象引用，memo 可在该场景下拦截。
 * 3. 自定义比较函数：在终态时只比较稳定的标量 props，避免 input 对象引用变化导致
 *    无意义重渲染。
 */
export const ToolLogItem = memo(function ToolLogItem({
  toolUseId,
  toolName,
  input,
  defaultExpanded = false,
  showIndicator = false,
  isPaused = false,
  isStopping = false,
}: ToolLogItemProps) {
  // 精确选取单个工具的执行状态，避免 executions 整体对象更新触发所有 ToolLogItem 重渲染
  const execution = useToolExecutionStore(
    useCallback((state) => state.executions[toolUseId], [toolUseId])
  );

  const shouldPauseActiveExecution =
    (isPaused || isStopping) && execution?.status !== 'success' && execution?.status !== 'error';
  const status = mapExecutionStatus(execution?.status, showIndicator, isPaused, isStopping);

  // isPaused/isStopping 时冻结 elapsedSeconds，防止服务端持续推送 tool_progress 导致计时器在暂停状态下仍增长
  // ref mutation 放在 useLayoutEffect 中，确保 concurrent mode / StrictMode 下安全
  const frozenElapsedRef = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (shouldPauseActiveExecution) {
      if (frozenElapsedRef.current === undefined) {
        frozenElapsedRef.current = execution?.elapsedSeconds;
      }
    } else {
      frozenElapsedRef.current = undefined;
    }
  });

  // 首次进入暂停的那帧 layoutEffect 尚未执行时，fallback 到当前值（即暂停瞬间的值）
  const effectiveElapsedSeconds = shouldPauseActiveExecution
    ? (frozenElapsedRef.current ?? execution?.elapsedSeconds)
    : execution?.elapsedSeconds;

  const executionTimeMs = useMemo(
    () =>
      execution?.endTime && execution?.startTime
        ? execution.endTime - execution.startTime
        : undefined,
    [execution?.endTime, execution?.startTime]
  );

  const effectiveInput = execution?.input ?? input;
  const summary = useMemo(
    () => getToolSummary(toolName, effectiveInput),
    [toolName, effectiveInput]
  );
  const liveActivity = useMemo(
    () => (status === 'running' ? getFullToolActivity(toolName, effectiveInput) : undefined),
    [status, toolName, effectiveInput]
  );

  return (
    <ExecutionLogItem
      type="tool_use"
      name={toolName}
      status={status}
      summary={summary || undefined}
      startTime={execution?.startTime}
      elapsedSeconds={effectiveElapsedSeconds}
      durationMs={executionTimeMs}
      liveActivity={liveActivity}
      defaultExpanded={defaultExpanded}
      icon={getToolIcon(toolName)}
      expandedContent={
        <ToolCallCard
          toolName={toolName}
          toolUseId={toolUseId}
          status={status}
          input={effectiveInput}
          output={execution?.output}
          executionTimeMs={executionTimeMs}
        />
      }
    />
  );
},
/**
 * 自定义比较：终态下只比较稳定的标量，完全跳过对象引用比较；
 * 运行态时 showIndicator/isPaused 可能变化，退回完整浅比较
 */
(prev, next) => {
  if (prev.toolUseId !== next.toolUseId || prev.toolName !== next.toolName) return false;
  if (prev.showIndicator !== next.showIndicator || prev.isPaused !== next.isPaused) return false;
  if (prev.isStopping !== next.isStopping) return false;
  if (prev.defaultExpanded !== next.defaultExpanded) return false;
  // input 对象引用稳定时直接跳过深比较
  if (prev.input !== next.input) return false;
  return true;
});

export default ToolLogItem;
