import { describe, expect, it } from "vitest";
import { getPromptHistory, navigatePromptHistory, shouldHandlePromptHistoryNavigation } from "./prompt-history";
import type { StreamMessage } from "../types";

describe("prompt history utils", () => {
  it("从会话消息中提取用户输入历史，并补上乐观发送的最后一条", () => {
    const messages = [
      { type: "user_prompt", prompt: "第一条" },
      { type: "assistant", message: { role: "assistant", content: [] } },
      { type: "user_prompt", prompt: "第二条" },
    ] as unknown as StreamMessage[];

    expect(getPromptHistory(messages, "第三条")).toEqual(["第一条", "第二条", "第三条"]);
    expect(getPromptHistory(messages, "第二条")).toEqual(["第一条", "第二条"]);
  });

  it("只在首行或末行接管上下方向键", () => {
    expect(
      shouldHandlePromptHistoryNavigation({
        key: "ArrowUp",
        value: "单行文本",
        selectionStart: 2,
        selectionEnd: 2,
      })
    ).toBe(true);

    expect(
      shouldHandlePromptHistoryNavigation({
        key: "ArrowUp",
        value: "第一行\n第二行",
        selectionStart: 2,
        selectionEnd: 2,
      })
    ).toBe(true);

    expect(
      shouldHandlePromptHistoryNavigation({
        key: "ArrowUp",
        value: "第一行\n第二行",
        selectionStart: 6,
        selectionEnd: 6,
      })
    ).toBe(false);

    expect(
      shouldHandlePromptHistoryNavigation({
        key: "ArrowDown",
        value: "第一行\n第二行",
        selectionStart: 6,
        selectionEnd: 6,
      })
    ).toBe(true);

    expect(
      shouldHandlePromptHistoryNavigation({
        key: "ArrowDown",
        value: "第一行\n第二行",
        selectionStart: 2,
        selectionEnd: 2,
        metaKey: true,
      })
    ).toBe(false);
  });

  it("支持向上浏览历史并在向下回到底部时恢复草稿", () => {
    const history = ["第一条", "第二条", "第三条"];

    const firstUp = navigatePromptHistory({
      history,
      direction: "up",
      currentIndex: null,
      draft: null,
      currentValue: "我还没发出去的草稿",
    });
    expect(firstUp).toEqual({
      changed: true,
      nextIndex: 2,
      nextValue: "第三条",
      nextDraft: "我还没发出去的草稿",
    });

    const secondUp = navigatePromptHistory({
      history,
      direction: "up",
      currentIndex: firstUp.nextIndex,
      draft: firstUp.nextDraft,
      currentValue: firstUp.nextValue,
    });
    expect(secondUp.nextIndex).toBe(1);
    expect(secondUp.nextValue).toBe("第二条");

    const downToLatest = navigatePromptHistory({
      history,
      direction: "down",
      currentIndex: secondUp.nextIndex,
      draft: secondUp.nextDraft,
      currentValue: secondUp.nextValue,
    });
    expect(downToLatest.nextIndex).toBe(2);
    expect(downToLatest.nextValue).toBe("第三条");

    const restoreDraft = navigatePromptHistory({
      history,
      direction: "down",
      currentIndex: downToLatest.nextIndex,
      draft: downToLatest.nextDraft,
      currentValue: downToLatest.nextValue,
    });
    expect(restoreDraft).toEqual({
      changed: true,
      nextIndex: null,
      nextValue: "我还没发出去的草稿",
      nextDraft: null,
    });
  });
});
