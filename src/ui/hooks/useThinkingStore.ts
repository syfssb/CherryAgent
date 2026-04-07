import { create } from 'zustand';
import type { StreamMessage } from '../types';

/**
 * Thinking block 的实时状态
 */
export interface ThinkingBlockState {
  /** 内容块索引（来自 content_block_start 的 index） */
  index: number;
  /** 累积的 thinking 文本 */
  content: string;
  /** 是否正在 thinking */
  isThinking: boolean;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 签名（用于验证） */
  signature?: string;
}

/**
 * Thinking Store 接口
 */
interface ThinkingStore {
  /** 按 sessionId 维度存储，每个 session 可能有多个 thinking block（按 index 索引） */
  blocks: Record<string, Record<number, ThinkingBlockState>>;
  /** 开始一个新的 thinking block */
  startBlock: (sessionId: string, index: number) => void;
  /** 追加 thinking 增量文本（rAF 批处理，减少高频状态更新） */
  appendDelta: (sessionId: string, index: number, text: string) => void;
  /** 立即刷新所有待处理的增量文本（用于 block 结束前确保内容完整） */
  flushPendingDeltas: () => void;
  /** 设置签名 */
  setSignature: (sessionId: string, index: number, signature: string) => void;
  /** 结束一个 thinking block */
  stopBlock: (sessionId: string, index: number) => void;
  /** 获取指定 session 的所有 thinking blocks */
  getBlocks: (sessionId: string) => Record<number, ThinkingBlockState>;
  /** 获取指定 session 中最新的活跃 thinking block */
  getActiveBlock: (sessionId: string) => ThinkingBlockState | undefined;
  /** 清除指定 session 的 thinking 状态 */
  clearSession: (sessionId: string) => void;
  /** 清除所有状态 */
  clearAll: () => void;
  /** 从消息历史中恢复 thinking 状态 */
  hydrateFromMessages: (sessionId: string, messages: StreamMessage[]) => void;
}

/**
 * rAF 批处理：累积多帧内的 thinking delta，合并为一次 zustand 状态更新
 * 避免每个 content_block_delta 都触发组件重渲染
 */
let pendingDeltas = new Map<string, string>();
let batchRafId: number | null = null;

function flushThinkingDeltas(): void {
  batchRafId = null;
  if (pendingDeltas.size === 0) return;

  const deltas = pendingDeltas;
  pendingDeltas = new Map();

  useThinkingStore.setState((state) => {
    const nextBlocks = { ...state.blocks };
    for (const [key, text] of deltas) {
      const sepIdx = key.indexOf(':');
      const sessionId = key.substring(0, sepIdx);
      const index = parseInt(key.substring(sepIdx + 1), 10);
      const sessionBlocks = nextBlocks[sessionId];
      const existing = sessionBlocks?.[index];
      if (!existing) continue;
      nextBlocks[sessionId] = {
        ...sessionBlocks,
        [index]: {
          ...existing,
          content: existing.content + text,
        },
      };
    }
    return { blocks: nextBlocks };
  });
}

export const useThinkingStore = create<ThinkingStore>((set, get) => ({
  blocks: {},

  startBlock: (sessionId, index) => set((state) => {
    const sessionBlocks = state.blocks[sessionId] ?? {};
    return {
      blocks: {
        ...state.blocks,
        [sessionId]: {
          ...sessionBlocks,
          [index]: {
            index,
            content: '',
            isThinking: true,
            startTime: Date.now(),
          },
        },
      },
    };
  }),

  appendDelta: (_sessionId, index, text) => {
    const key = `${_sessionId}:${index}`;
    pendingDeltas.set(key, (pendingDeltas.get(key) ?? '') + text);
    if (batchRafId === null) {
      batchRafId = requestAnimationFrame(flushThinkingDeltas);
    }
  },

  flushPendingDeltas: () => {
    if (batchRafId !== null) {
      cancelAnimationFrame(batchRafId);
    }
    flushThinkingDeltas();
  },

  setSignature: (sessionId, index, signature) => set((state) => {
    const sessionBlocks = state.blocks[sessionId] ?? {};
    const existing = sessionBlocks[index];
    if (!existing) return state;
    return {
      blocks: {
        ...state.blocks,
        [sessionId]: {
          ...sessionBlocks,
          [index]: {
            ...existing,
            signature,
          },
        },
      },
    };
  }),

  stopBlock: (sessionId, index) => {
    // 先刷新该 block 的所有待处理增量，确保内容完整
    flushThinkingDeltas();
    set((state) => {
      const sessionBlocks = state.blocks[sessionId] ?? {};
      const existing = sessionBlocks[index];
      if (!existing) return state;
      return {
        blocks: {
          ...state.blocks,
          [sessionId]: {
            ...sessionBlocks,
            [index]: {
              ...existing,
              isThinking: false,
              endTime: Date.now(),
            },
          },
        },
      };
    });
  },

  getBlocks: (sessionId) => get().blocks[sessionId] ?? {},

  getActiveBlock: (sessionId) => {
    const sessionBlocks = get().blocks[sessionId] ?? {};
    const active = Object.values(sessionBlocks).find((b) => b.isThinking);
    return active;
  },

  clearSession: (sessionId) => {
    // 清理该 session 的待处理增量
    for (const key of pendingDeltas.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        pendingDeltas.delete(key);
      }
    }
    set((state) => {
      const next = { ...state.blocks };
      delete next[sessionId];
      return { blocks: next };
    });
  },

  clearAll: () => {
    // 清理所有待处理增量
    pendingDeltas.clear();
    if (batchRafId !== null) {
      cancelAnimationFrame(batchRafId);
      batchRafId = null;
    }
    set({ blocks: {} });
  },

  hydrateFromMessages: (sessionId, messages) => {
    const sessionBlocks: Record<number, ThinkingBlockState> = {};
    let blockIndex = 0;

    for (const message of messages) {
      if ((message as any).type === 'assistant' && (message as any).message?.content) {
        const contents = (message as any).message.content;
        for (const block of contents) {
          if (block.type === 'thinking') {
            sessionBlocks[blockIndex] = {
              index: blockIndex,
              content: block.thinking ?? '',
              isThinking: false,
              startTime: 0,
              endTime: 0,
            };
            blockIndex++;
          }
        }
      }
    }

    set((state) => ({
      blocks: {
        ...state.blocks,
        [sessionId]: sessionBlocks,
      },
    }));
  },
}));
