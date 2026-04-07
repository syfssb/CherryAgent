/**
 * MessageCost 组件使用示例
 *
 * 本文件展示如何在不同场景下使用 MessageCost 组件
 */

import { MessageCost, type MessageUsageInfo } from '@/ui/components/chat/MessageCost';

// ============================================
// 示例 1: 完整的 usage 信息
// ============================================

const fullUsageExample: MessageUsageInfo = {
  inputTokens: 1500,
  outputTokens: 800,
  totalTokens: 2300,
  cost: 0.00345,  // 积分（原始值为美元，组件内部会转换）
  costBreakdown: {
    inputCost: 0.00225,
    outputCost: 0.00120,
  },
  latencyMs: 3500,
  firstTokenLatencyMs: 450,
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
  requestId: 'req_abc123',
};

// 使用示例
export function FullUsageExample() {
  return (
    <div>
      <h3>完整的 Usage 信息</h3>
      <MessageCost usage={fullUsageExample} />
    </div>
  );
}

// ============================================
// 示例 2: 简洁模式
// ============================================

export function CompactUsageExample() {
  return (
    <div>
      <h3>简洁模式（仅显示费用）</h3>
      <MessageCost usage={fullUsageExample} compact />
      {/* 输出: 0.25 积分 */}
    </div>
  );
}

// ============================================
// 示例 3: 默认展开
// ============================================

export function ExpandedUsageExample() {
  return (
    <div>
      <h3>默认展开详细信息</h3>
      <MessageCost usage={fullUsageExample} defaultExpanded />
    </div>
  );
}

// ============================================
// 示例 4: 降级模式（只有简单费用）
// ============================================

export function SimpleCostExample() {
  return (
    <div>
      <h3>降级模式（无详细信息）</h3>
      <MessageCost cost={0.00145} compact />
      {/* 当只有简单费用数据时使用 */}
    </div>
  );
}

// ============================================
// 示例 5: 在 MessageCard 中集成
// ============================================

import { MessageCard, type Message } from '@/ui/components/chat/MessageCard';

export function MessageCardWithCostExample() {
  const message: Message = {
    id: 'msg_123',
    role: 'assistant',
    content: '这是一个示例回复。',
    timestamp: Date.now(),
    usage: fullUsageExample,  // ← 传递 usage 信息
  };

  return (
    <MessageCard
      message={message}
      onCopy={(content) => console.log('已复制:', content)}
    />
  );
}

// ============================================
// 示例 6: 在 EventCard 中集成
// ============================================

import { MessageCard as EventCard } from '@/ui/components/EventCard';
import type { StreamMessage } from '@/ui/types';

export function EventCardWithCostExample() {
  // 模拟带 _usage 字段的消息
  const message: StreamMessage = {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '这是助手的回复。',
        },
      ],
    },
    _usage: fullUsageExample,  // ← SDK 附着的 usage 信息
  } as any;

  return (
    <EventCard
      message={message}
      usage={message._usage}  // ← 传递 usage 信息
      showCost={true}
    />
  );
}

// ============================================
// 示例 7: 从 runner.ts 提取的 usage 信息
// ============================================

/**
 * 这是后端 runner.ts 如何提取和附着 usage 信息的示例
 */
export function RunnerUsageExtraction() {
  // 在 runner.ts 中:
  /*
  const usageInfo = extractUsageFromResult(message as SDKResultMessage, currentModel);
  sendMessage(message, usageInfo || undefined);

  // sendMessage 函数会将 usageInfo 附着到消息:
  const extendedMessage: ExtendedStreamMessage = usageInfo
    ? { ...message, _usage: usageInfo }
    : message;
  */

  return null;  // 仅用于文档说明
}

// ============================================
// 示例 8: 在 App.tsx 中提取 usage 信息
// ============================================

export function AppUsageExtraction() {
  // 在 App.tsx 中:
  /*
  visibleMessages.map((item, idx) => {
    // 提取使用量信息
    const extendedMessage = item.message as any;
    const usage = extendedMessage._usage;

    return (
      <MessageCard
        key={`${activeSessionId}-msg-${item.originalIndex}`}
        message={item.message}
        usage={usage}  // ← 传递给组件
      />
    );
  })
  */

  return null;  // 仅用于文档说明
}

// ============================================
// 示例 9: 不同模型的 usage 信息
// ============================================

const sonnetUsage: MessageUsageInfo = {
  inputTokens: 2000,
  outputTokens: 1000,
  totalTokens: 3000,
  cost: 0.006,
  costBreakdown: {
    inputCost: 0.006,
    outputCost: 0.015,
  },
  latencyMs: 4200,
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
};

const haikuUsage: MessageUsageInfo = {
  inputTokens: 2000,
  outputTokens: 1000,
  totalTokens: 3000,
  cost: 0.0056,
  costBreakdown: {
    inputCost: 0.0016,
    outputCost: 0.004,
  },
  latencyMs: 1800,
  model: 'claude-3-5-haiku-20241022',
  provider: 'anthropic',
};

export function ModelComparisonExample() {
  return (
    <div className="space-y-4">
      <div>
        <h4>Sonnet 模型</h4>
        <MessageCost usage={sonnetUsage} />
      </div>
      <div>
        <h4>Haiku 模型</h4>
        <MessageCost usage={haikuUsage} />
      </div>
    </div>
  );
}

// ============================================
// 示例 10: 代理模式的售价倍率
// ============================================

/**
 * 代理模式下，售价会包含倍率
 * runner.ts 会自动处理这种情况
 */
const proxyModeUsage: MessageUsageInfo = {
  inputTokens: 1000,
  outputTokens: 500,
  totalTokens: 1500,
  cost: 0.00432,  // 成本价 × 1.2 倍率
  costBreakdown: {
    inputCost: 0.00360,  // (1000 / 1M) * 3.0 * 1.2
    outputCost: 0.00900,  // (500 / 1M) * 15.0 * 1.2
  },
  latencyMs: 2800,
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
  channelId: 'channel_xyz',
};

export function ProxyModeExample() {
  return (
    <div>
      <h3>代理模式（包含售价倍率）</h3>
      <MessageCost usage={proxyModeUsage} />
      <p className="text-sm text-muted mt-2">
        费用已包含 1.2x 倍率
      </p>
    </div>
  );
}

export default {
  FullUsageExample,
  CompactUsageExample,
  ExpandedUsageExample,
  SimpleCostExample,
  MessageCardWithCostExample,
  EventCardWithCostExample,
  ModelComparisonExample,
  ProxyModeExample,
};
