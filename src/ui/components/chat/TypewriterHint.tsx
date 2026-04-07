import type { HintPhase } from "../../hooks/useTypewriterHint";

interface TypewriterHintProps {
  displayText: string;
  isComplete: boolean;
  onAccept: () => void;
  phase: HintPhase;
}

/**
 * 滚动提示词展示组件
 * 整行从底部滑入，停留后向上滑出，切换下一条
 */
export function TypewriterHint({ displayText, isComplete, onAccept, phase }: TypewriterHintProps) {
  if (!displayText) return null;

  const style: React.CSSProperties = {
    transform:
      phase === "before-enter"
        ? "translateY(8px)"
        : phase === "leaving"
        ? "translateY(-6px)"
        : "translateY(0)",
    opacity: phase === "showing" ? 1 : 0,
    transition:
      phase === "before-enter"
        ? "none"
        : "transform 300ms ease, opacity 300ms ease",
  };

  return (
    <div className="absolute inset-0 flex items-start pointer-events-none py-[7px] overflow-hidden">
      <div style={style} className="flex items-center min-w-0 w-full">
        <span
          className="text-sm select-none truncate"
          style={{ color: "var(--color-ink-400)", opacity: 0.55 }}
        >
          {displayText}
        </span>
        {isComplete && (
          <button
            type="button"
            onClick={onAccept}
            className="pointer-events-auto inline-flex items-center ml-3 flex-shrink-0 typewriter-tab-hint"
            title="按 Tab 使用此提示词"
          >
            <span
              className="inline-flex items-center gap-[3px] rounded-[4px] px-[6px] py-[2px] text-[10px] tracking-wide transition-all duration-200"
              style={{
                background: "var(--color-accent-subtle)",
                color: "var(--color-accent)",
                border:
                  "1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)",
              }}
            >
              <span
                className="font-medium"
                style={{
                  fontFamily:
                    '"SF Mono", "Fira Code", ui-monospace, monospace',
                  fontSize: "9px",
                }}
              >
                tab
              </span>
              <svg
                width="8"
                height="8"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.7 }}
              >
                <path d="M2 8h10M9 5l3 3-3 3" />
              </svg>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
