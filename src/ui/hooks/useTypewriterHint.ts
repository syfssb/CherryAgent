import { useEffect, useRef, useState } from "react";

/** 每条提示词展示时长（毫秒） */
const SHOW_MS = 3000;
/** 进入 / 离开过渡时长（毫秒），与 CSS transition 保持一致 */
const TRANSITION_MS = 300;

export type HintPhase = "before-enter" | "showing" | "leaving";

interface ScrollHintState {
  /** 当前展示的完整提示词 */
  displayText: string;
  /** 同 displayText，供 Tab 填充使用 */
  fullText: string;
  /** showing 阶段为 true，显示 Tab 按钮 */
  isComplete: boolean;
  /** 当前动画阶段 */
  phase: HintPhase;
}

/**
 * 滚动切换提示词 hook
 * 整行从底部滚入 → 展示 3s → 向上滚出 → 下一条
 */
export function useTypewriterHint(
  hints: readonly string[],
  enabled: boolean,
): ScrollHintState {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<HintPhase>("before-enter");
  const indexRef = useRef(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || hints.length === 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setText("");
      setPhase("before-enter");
      indexRef.current = -1;
      return;
    }

    const pickNext = (): string => {
      if (hints.length === 1) return hints[0];
      let next: number;
      do {
        next = Math.floor(Math.random() * hints.length);
      } while (next === indexRef.current);
      indexRef.current = next;
      return hints[next];
    };

    const startCycle = (hint: string) => {
      // 1. 设置初始位置（在可见区域下方，无过渡）
      setText(hint);
      setPhase("before-enter");

      // 2. 下一帧触发进入动画
      rafRef.current = requestAnimationFrame(() => {
        setPhase("showing");

        // 3. 展示 3s 后开始离开动画
        timerRef.current = setTimeout(() => {
          setPhase("leaving");

          // 4. 离开动画结束后切换下一条
          timerRef.current = setTimeout(() => {
            startCycle(pickNext());
          }, TRANSITION_MS);
        }, SHOW_MS);
      });
    };

    startCycle(pickNext());

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, hints]);

  return {
    displayText: text,
    fullText: text,
    isComplete: phase === "showing",
    phase,
  };
}
