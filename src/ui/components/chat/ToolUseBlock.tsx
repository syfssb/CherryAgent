/**
 * ToolUseBlock - 独立的工具调用渲染组件
 *
 * 将 tool_use 渲染逻辑拆分为独立组件，避免在循环内调用 hook
 * 使用 useToolExecutionStore 响应式获取工具执行状态
 */

import { useToolExecutionStore } from '@/ui/hooks/useToolExecutionStore';
import { ToolCallCard, type ToolCallStatus } from './ToolCallCard';

interface ToolUseBlockProps {
  /** 工具调用 ID */
  toolUseId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具输入参数 */
  input: Record<string, unknown>;
  /** 是否显示执行中指示器（用于最后一条消息） */
  showIndicator?: boolean;
}

/**
 * 将 store 中的状态映射为 ToolCallCard 的状态
 */
function mapExecutionStatus(
  storeStatus: string | undefined,
  showIndicator: boolean
): ToolCallStatus {
  // 如果是最后一条消息且正在运行，显示 running 状态
  if (showIndicator) {
    return 'running';
  }

  // 根据 store 中的状态映射
  switch (storeStatus) {
    case 'running':
      return 'running';
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'pending':
    default:
      return 'pending';
  }
}

/**
 * 工具调用块组件
 *
 * 独立组件，可以安全地在内部使用 hook
 */
export function ToolUseBlock({
  toolUseId,
  toolName,
  input,
  showIndicator = false,
}: ToolUseBlockProps) {
  // 使用 selector 只订阅当前工具的执行状态
  const execution = useToolExecutionStore((state) => state.executions[toolUseId]);

  // 映射状态
  const status = mapExecutionStatus(execution?.status, showIndicator);

  // 计算执行时间
  const executionTimeMs =
    execution?.endTime && execution?.startTime
      ? execution.endTime - execution.startTime
      : undefined;

  return (
    <ToolCallCard
      toolName={toolName}
      toolUseId={toolUseId}
      status={status}
      input={input}
      output={execution?.output}
      executionTimeMs={executionTimeMs}
    />
  );
}

export default ToolUseBlock;
