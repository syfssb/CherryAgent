import type { StreamMessage } from "../types";

export type PromptHistoryDirection = "up" | "down";

interface PromptHistoryKeyInput {
  key: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

interface NavigatePromptHistoryInput {
  history: readonly string[];
  direction: PromptHistoryDirection;
  currentIndex: number | null;
  draft: string | null;
  currentValue: string;
}

interface NavigatePromptHistoryResult {
  changed: boolean;
  nextIndex: number | null;
  nextValue: string;
  nextDraft: string | null;
}

function isUserPromptMessage(message: StreamMessage): message is StreamMessage & { type: "user_prompt"; prompt: string } {
  return message.type === "user_prompt" && typeof (message as { prompt?: unknown }).prompt === "string";
}

export function getPromptHistory(
  messages: readonly StreamMessage[],
  optimisticPrompt?: string | null
): string[] {
  const history = messages.flatMap((message) => {
    if (!isUserPromptMessage(message)) {
      return [];
    }

    return message.prompt.trim() ? [message.prompt] : [];
  });

  if (optimisticPrompt?.trim() && history[history.length - 1] !== optimisticPrompt) {
    history.push(optimisticPrompt);
  }

  return history;
}

export function shouldHandlePromptHistoryNavigation({
  key,
  value,
  selectionStart,
  selectionEnd,
  altKey = false,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
}: PromptHistoryKeyInput): boolean {
  if (key !== "ArrowUp" && key !== "ArrowDown") {
    return false;
  }

  if (altKey || ctrlKey || metaKey || shiftKey) {
    return false;
  }

  if (selectionStart === null || selectionEnd === null || selectionStart !== selectionEnd) {
    return false;
  }

  if (key === "ArrowUp") {
    return value.lastIndexOf("\n", selectionStart - 1) === -1;
  }

  return value.indexOf("\n", selectionStart) === -1;
}

export function navigatePromptHistory({
  history,
  direction,
  currentIndex,
  draft,
  currentValue,
}: NavigatePromptHistoryInput): NavigatePromptHistoryResult {
  if (history.length === 0) {
    return {
      changed: false,
      nextIndex: currentIndex,
      nextValue: currentValue,
      nextDraft: draft,
    };
  }

  if (direction === "up") {
    const nextIndex = currentIndex === null ? history.length - 1 : Math.max(0, currentIndex - 1);
    return {
      changed: true,
      nextIndex,
      nextValue: history[nextIndex] ?? currentValue,
      nextDraft: currentIndex === null ? currentValue : draft,
    };
  }

  if (currentIndex === null) {
    return {
      changed: false,
      nextIndex: null,
      nextValue: currentValue,
      nextDraft: draft,
    };
  }

  if (currentIndex >= history.length - 1) {
    return {
      changed: true,
      nextIndex: null,
      nextValue: draft ?? "",
      nextDraft: null,
    };
  }

  const nextIndex = currentIndex + 1;
  return {
    changed: true,
    nextIndex,
    nextValue: history[nextIndex] ?? currentValue,
    nextDraft: draft,
  };
}
