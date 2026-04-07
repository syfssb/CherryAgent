import { useRef, useState } from 'react';

interface SectionTooltipProps {
  text: string;
}

/**
 * 区域标题旁的说明图标 — 极细 ⓘ SVG，无背景，hover 浮出通俗解释。
 * 使用 position:fixed 避免被父级 overflow-y-auto 裁剪。
 */
export function SectionTooltip({ text }: SectionTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 7, left: rect.left + rect.width / 2 });
    }
    setVisible(true);
  };

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex cursor-help items-center text-[#b0aea5]/50 transition-colors duration-150 hover:text-[#87867f]"
      >
        {/* 极细圆形 info 图标，无填充背景 */}
        <svg
          viewBox="0 0 14 14"
          className="h-[11px] w-[11px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        >
          <circle cx="7" cy="7" r="5.5" />
          {/* 小点（上） */}
          <circle cx="7" cy="4.8" r="0.55" fill="currentColor" stroke="none" />
          {/* 竖线（下） */}
          <line x1="7" y1="6.6" x2="7" y2="9.6" />
        </svg>
      </span>

      {visible && (
        <div
          className="pointer-events-none fixed z-[9999] w-44 -translate-x-1/2 rounded-xl border border-[#1414131a] bg-white px-3 py-2.5 text-[11px] leading-relaxed text-[#6b6a68] shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] dark:border-[#faf9f51a] dark:bg-[#2b2a27] dark:text-[#9a9893]"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* 向上小箭头 */}
          <div className="absolute -top-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-l border-t border-[#1414131a] bg-white dark:border-[#faf9f51a] dark:bg-[#2b2a27]" />
          {text}
        </div>
      )}
    </>
  );
}
