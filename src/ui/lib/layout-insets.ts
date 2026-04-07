import type { CSSProperties } from "react";

const CHAT_VIEWPORT_HORIZONTAL_PADDING_REM = 1.5;

function normalizeInset(inset?: number): number {
  return inset != null && Number.isFinite(inset) && inset > 0 ? inset : 0;
}

export function buildChatViewportInsetStyle(rightInset?: number): CSSProperties | undefined {
  const safeRightInset = normalizeInset(rightInset);
  if (safeRightInset === 0) return undefined;

  return {
    paddingRight: `calc(${CHAT_VIEWPORT_HORIZONTAL_PADDING_REM}rem + ${safeRightInset}px)`,
  };
}

export function buildFixedBottomInsetStyle(options: {
  leftInset?: number;
  rightInset?: number;
}): CSSProperties | undefined {
  const safeLeftInset = normalizeInset(options.leftInset);
  const safeRightInset = normalizeInset(options.rightInset);

  if (safeLeftInset === 0 && safeRightInset === 0) return undefined;

  const style: CSSProperties = {};

  if (safeLeftInset > 0) {
    style.left = `${safeLeftInset}px`;
  }

  if (safeRightInset > 0) {
    style.right = `${safeRightInset}px`;
  }

  return style;
}
