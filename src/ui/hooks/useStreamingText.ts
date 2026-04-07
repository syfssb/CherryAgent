import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * 流式文本配置
 */
export interface StreamingTextConfig {
  /** 每个字符的延迟（毫秒） */
  charDelay?: number;
  /** 是否启用打字机效果 */
  typewriterEffect?: boolean;
  /** 初始内容 */
  initialContent?: string;
  /** 文本更新回调 */
  onUpdate?: (text: string) => void;
  /** 完成回调 */
  onComplete?: () => void;
  /** 取消回调 */
  onCancel?: () => void;
}

/**
 * 流式文本状态
 */
export interface StreamingTextState {
  /** 当前显示的文本 */
  displayText: string;
  /** 完整文本（包括未显示的部分） */
  fullText: string;
  /** 是否正在流式传输 */
  isStreaming: boolean;
  /** 是否已完成 */
  isComplete: boolean;
  /** 是否已取消 */
  isCancelled: boolean;
  /** 光标是否可见（用于闪烁效果） */
  cursorVisible: boolean;
}

/**
 * 流式文本操作
 */
export interface StreamingTextActions {
  /** 追加文本 */
  append: (text: string) => void;
  /** 设置完整文本（替换） */
  setText: (text: string) => void;
  /** 完成流式传输 */
  complete: () => void;
  /** 取消流式传输 */
  cancel: () => void;
  /** 重置状态 */
  reset: () => void;
  /** 立即显示所有文本（跳过动画） */
  showAll: () => void;
}

/**
 * useStreamingText Hook 返回值
 */
export type UseStreamingTextReturn = [StreamingTextState, StreamingTextActions];

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<StreamingTextConfig> = {
  charDelay: 20,
  typewriterEffect: true,
  initialContent: '',
  onUpdate: () => {},
  onComplete: () => {},
  onCancel: () => {},
};

/**
 * 光标闪烁间隔（毫秒）
 */
const CURSOR_BLINK_INTERVAL = 500;

/**
 * 流式文本显示 Hook
 * 提供打字机效果、光标闪烁、取消支持
 *
 * @param config - 配置选项
 * @returns [state, actions] - 状态和操作方法
 *
 * @example
 * // 基础用法
 * const [state, actions] = useStreamingText({
 *   charDelay: 30,
 *   typewriterEffect: true,
 * });
 *
 * // 追加文本
 * useEffect(() => {
 *   actions.append('Hello ');
 *   actions.append('World!');
 *   actions.complete();
 * }, []);
 *
 * // 渲染
 * return (
 *   <div>
 *     {state.displayText}
 *     {state.isStreaming && state.cursorVisible && <span>|</span>}
 *   </div>
 * );
 *
 * @example
 * // 与流式 API 配合使用
 * const [state, actions] = useStreamingText();
 *
 * useEffect(() => {
 *   const fetchStream = async () => {
 *     const response = await fetch('/api/stream');
 *     const reader = response.body?.getReader();
 *     if (!reader) return;
 *
 *     while (true) {
 *       const { done, value } = await reader.read();
 *       if (done) {
 *         actions.complete();
 *         break;
 *       }
 *       const text = new TextDecoder().decode(value);
 *       actions.append(text);
 *     }
 *   };
 *
 *   fetchStream();
 *
 *   return () => actions.cancel();
 * }, []);
 */
export function useStreamingText(config: StreamingTextConfig = {}): UseStreamingTextReturn {
  // 合并配置
  const mergedConfig = useMemo(
    () => ({
      ...DEFAULT_CONFIG,
      ...config,
    }),
    [config]
  );

  // 状态
  const [displayText, setDisplayText] = useState(mergedConfig.initialContent);
  const [fullText, setFullText] = useState(mergedConfig.initialContent);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Refs
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingTextRef = useRef<string>('');

  /**
   * 清理动画
   */
  const cleanupAnimation = useCallback(() => {
    if (typingIntervalRef.current !== null) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }, []);

  /**
   * 清理光标闪烁
   */
  const cleanupCursor = useCallback(() => {
    if (cursorIntervalRef.current !== null) {
      clearInterval(cursorIntervalRef.current);
      cursorIntervalRef.current = null;
    }
  }, []);

  /**
   * 动画循环 - 逐字符显示
   */
  const startAnimation = useCallback(() => {
    if (typingIntervalRef.current !== null) return;

    typingIntervalRef.current = setInterval(() => {
      if (pendingTextRef.current.length === 0) {
        setIsStreaming(false);
        cleanupAnimation();
        return;
      }

      const nextChar = pendingTextRef.current[0];
      pendingTextRef.current = pendingTextRef.current.slice(1);

      setDisplayText((prev) => {
        const newText = prev + nextChar;
        mergedConfig.onUpdate(newText);
        return newText;
      });

      if (pendingTextRef.current.length === 0) {
        setIsStreaming(false);
        cleanupAnimation();
      }
    }, mergedConfig.charDelay);
  }, [cleanupAnimation, mergedConfig.charDelay, mergedConfig.onUpdate]);

  /**
   * 追加文本
   */
  const append = useCallback(
    (text: string) => {
      if (isCancelled || isComplete) return;

      setFullText((prev) => prev + text);
      setIsStreaming(true);

      if (mergedConfig.typewriterEffect) {
        pendingTextRef.current += text;
        startAnimation();
      } else {
        setDisplayText((prev) => {
          const newText = prev + text;
          mergedConfig.onUpdate(newText);
          return newText;
        });
      }
    },
    [isCancelled, isComplete, mergedConfig, startAnimation]
  );

  /**
   * 设置完整文本（替换）
   */
  const setText = useCallback(
    (text: string) => {
      if (isCancelled) return;

      cleanupAnimation();
      pendingTextRef.current = '';

      setFullText(text);
      setIsStreaming(true);

      if (mergedConfig.typewriterEffect) {
        setDisplayText('');
        pendingTextRef.current = text;
        startAnimation();
      } else {
        setDisplayText(text);
        mergedConfig.onUpdate(text);
        setIsStreaming(false);
      }
    },
    [isCancelled, cleanupAnimation, mergedConfig, startAnimation]
  );

  /**
   * 完成流式传输
   */
  const complete = useCallback(() => {
    setIsComplete(true);
    setIsStreaming(false);

    // 立即显示所有剩余文本
    if (pendingTextRef.current.length > 0) {
      setDisplayText((prev) => {
        const newText = prev + pendingTextRef.current;
        mergedConfig.onUpdate(newText);
        return newText;
      });
      pendingTextRef.current = '';
    }

    cleanupAnimation();
    cleanupCursor();
    mergedConfig.onComplete();
  }, [cleanupAnimation, cleanupCursor, mergedConfig]);

  /**
   * 取消流式传输
   */
  const cancel = useCallback(() => {
    setIsCancelled(true);
    setIsStreaming(false);
    cleanupAnimation();
    cleanupCursor();
    mergedConfig.onCancel();
  }, [cleanupAnimation, cleanupCursor, mergedConfig]);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    cleanupAnimation();
    cleanupCursor();
    pendingTextRef.current = '';

    setDisplayText(mergedConfig.initialContent);
    setFullText(mergedConfig.initialContent);
    setIsStreaming(false);
    setIsComplete(false);
    setIsCancelled(false);
    setCursorVisible(true);
  }, [cleanupAnimation, cleanupCursor, mergedConfig.initialContent]);

  /**
   * 立即显示所有文本
   */
  const showAll = useCallback(() => {
    cleanupAnimation();
    pendingTextRef.current = '';

    setDisplayText(fullText);
    setIsStreaming(false);
    mergedConfig.onUpdate(fullText);
  }, [cleanupAnimation, fullText, mergedConfig]);

  /**
   * 光标闪烁效果
   */
  useEffect(() => {
    if (isStreaming && !isComplete && !isCancelled) {
      setCursorVisible(true);
      cursorIntervalRef.current = setInterval(() => {
        setCursorVisible((prev) => !prev);
      }, CURSOR_BLINK_INTERVAL);
    } else {
      cleanupCursor();
      setCursorVisible(false);
    }

    return cleanupCursor;
  }, [isStreaming, isComplete, isCancelled, cleanupCursor]);

  /**
   * 清理 effect
   */
  useEffect(() => {
    return () => {
      cleanupAnimation();
      cleanupCursor();
    };
  }, [cleanupAnimation, cleanupCursor]);

  // 状态对象
  const state: StreamingTextState = useMemo(
    () => ({
      displayText,
      fullText,
      isStreaming,
      isComplete,
      isCancelled,
      cursorVisible,
    }),
    [displayText, fullText, isStreaming, isComplete, isCancelled, cursorVisible]
  );

  // 操作对象
  const actions: StreamingTextActions = useMemo(
    () => ({
      append,
      setText,
      complete,
      cancel,
      reset,
      showAll,
    }),
    [append, setText, complete, cancel, reset, showAll]
  );

  return [state, actions];
}

export default useStreamingText;
