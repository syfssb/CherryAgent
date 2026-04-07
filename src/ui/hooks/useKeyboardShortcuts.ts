import { useEffect, useMemo, useCallback } from "react";
import { isMac } from "../utils/platform";

/**
 * 快捷键定义
 */
export interface ShortcutDefinition {
  /** 快捷键唯一标识 */
  id: string;
  /** 按键组合（用于显示） */
  label: string;
  /** macOS 下的显示标签 */
  macLabel: string;
  /** 功能描述 */
  description: string;
  /** 分组 */
  group: "navigation" | "session" | "interface";
  /** 按键匹配条件 */
  key: string;
  /** 是否需要 Meta/Ctrl */
  metaKey: boolean;
  /** 是否需要 Shift */
  shiftKey: boolean;
  /** 当焦点在输入框时是否仍然触发 */
  activeInInput: boolean;
}

/**
 * 快捷键回调集合
 */
export interface ShortcutCallbacks {
  onNewSession?: () => void;
  onFocusInput?: () => void;
  onOpenSettings?: () => void;
  onPrevSession?: () => void;
  onNextSession?: () => void;
  onCloseSession?: () => void;
  onToggleFileExplorer?: () => void;
  onToggleSidebar?: () => void;
  onCloseModal?: () => void;
  onNavigateChat?: () => void;
  onNavigateSkills?: () => void;
  onNavigateMemory?: () => void;
  onNavigateUsage?: () => void;
  onNavigateSettings?: () => void;
  onShowShortcutsHelp?: () => void;
}

/**
 * 构建快捷键定义列表
 */
function buildShortcutDefinitions(): readonly ShortcutDefinition[] {
  return [
    // --- 会话管理 ---
    {
      id: "new-session",
      label: "Ctrl + N",
      macLabel: "Cmd + N",
      description: "新建会话",
      group: "session",
      key: "n",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "prev-session",
      label: "Ctrl + [",
      macLabel: "Cmd + [",
      description: "切换到上一个会话",
      group: "session",
      key: "[",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "next-session",
      label: "Ctrl + ]",
      macLabel: "Cmd + ]",
      description: "切换到下一个会话",
      group: "session",
      key: "]",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "close-session",
      label: "Ctrl + W",
      macLabel: "Cmd + W",
      description: "关闭/删除当前会话",
      group: "session",
      key: "w",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },

    // --- 导航 ---
    {
      id: "navigate-chat",
      label: "Ctrl + 1",
      macLabel: "Cmd + 1",
      description: "导航到聊天页",
      group: "navigation",
      key: "1",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "navigate-skills",
      label: "Ctrl + 2",
      macLabel: "Cmd + 2",
      description: "导航到技能市场",
      group: "navigation",
      key: "2",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "navigate-memory",
      label: "Ctrl + 3",
      macLabel: "Cmd + 3",
      description: "打开设置-记忆管理",
      group: "navigation",
      key: "3",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "navigate-usage",
      label: "Ctrl + 4",
      macLabel: "Cmd + 4",
      description: "导航到使用量页面",
      group: "navigation",
      key: "4",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "navigate-settings",
      label: "Ctrl + 5",
      macLabel: "Cmd + 5",
      description: "导航到设置页面",
      group: "navigation",
      key: "5",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },

    // --- 界面控制 ---
    {
      id: "focus-input",
      label: "Ctrl + K",
      macLabel: "Cmd + K",
      description: "聚焦到输入框",
      group: "interface",
      key: "k",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "open-settings",
      label: "Ctrl + ,",
      macLabel: "Cmd + ,",
      description: "打开设置",
      group: "interface",
      key: ",",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "toggle-file-explorer",
      label: "Ctrl + Shift + E",
      macLabel: "Cmd + Shift + E",
      description: "切换文件浏览器",
      group: "interface",
      key: "e",
      metaKey: true,
      shiftKey: true,
      activeInInput: true,
    },
    {
      id: "toggle-sidebar",
      label: "Ctrl + B",
      macLabel: "Cmd + B",
      description: "切换侧边栏",
      group: "interface",
      key: "b",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "close-modal",
      label: "Escape",
      macLabel: "Escape",
      description: "关闭模态框 / 停止会话",
      group: "interface",
      key: "Escape",
      metaKey: false,
      shiftKey: false,
      activeInInput: true,
    },
    {
      id: "show-shortcuts-help",
      label: "Ctrl + /",
      macLabel: "Cmd + /",
      description: "显示快捷键帮助",
      group: "interface",
      key: "/",
      metaKey: true,
      shiftKey: false,
      activeInInput: true,
    },
  ] as const;
}

const SHORTCUT_DEFINITIONS = buildShortcutDefinitions();

/**
 * 检查焦点是否在可编辑元素中
 */
function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return false;
}

/**
 * 检查事件是否匹配快捷键定义
 */
function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutDefinition): boolean {
  const mac = isMac();
  const modifierKey = mac ? event.metaKey : event.ctrlKey;

  // 检查修饰键
  if (shortcut.metaKey && !modifierKey) return false;
  if (!shortcut.metaKey && modifierKey) return false;
  if (shortcut.shiftKey && !event.shiftKey) return false;
  if (!shortcut.shiftKey && event.shiftKey) return false;

  // 检查按键（不区分大小写）
  return event.key.toLowerCase() === shortcut.key.toLowerCase();
}

/**
 * 快捷键管理 Hook
 *
 * 注册全局 keydown 事件监听器，根据快捷键定义分发回调。
 * 自动检测平台（macOS 用 Cmd，其他平台用 Ctrl）。
 * 当焦点在 input/textarea 中时，仅触发标记为 activeInInput 的快捷键。
 *
 * @param callbacks - 快捷键回调函数集合
 * @returns shortcuts - 快捷键定义列表（供 UI 显示）
 */
export function useKeyboardShortcuts(callbacks: ShortcutCallbacks) {
  const {
    onNewSession,
    onFocusInput,
    onOpenSettings,
    onPrevSession,
    onNextSession,
    onCloseSession,
    onToggleFileExplorer,
    onToggleSidebar,
    onCloseModal,
    onNavigateChat,
    onNavigateSkills,
    onNavigateMemory,
    onNavigateUsage,
    onNavigateSettings,
    onShowShortcutsHelp,
  } = callbacks;

  const callbackMap = useMemo<Record<string, (() => void) | undefined>>(() => ({
    "new-session": onNewSession,
    "focus-input": onFocusInput,
    "open-settings": onOpenSettings,
    "prev-session": onPrevSession,
    "next-session": onNextSession,
    "close-session": onCloseSession,
    "toggle-file-explorer": onToggleFileExplorer,
    "toggle-sidebar": onToggleSidebar,
    "close-modal": onCloseModal,
    "navigate-chat": onNavigateChat,
    "navigate-skills": onNavigateSkills,
    "navigate-memory": onNavigateMemory,
    "navigate-usage": onNavigateUsage,
    "navigate-settings": onNavigateSettings,
    "show-shortcuts-help": onShowShortcutsHelp,
  }), [
    onNewSession,
    onFocusInput,
    onOpenSettings,
    onPrevSession,
    onNextSession,
    onCloseSession,
    onToggleFileExplorer,
    onToggleSidebar,
    onCloseModal,
    onNavigateChat,
    onNavigateSkills,
    onNavigateMemory,
    onNavigateUsage,
    onNavigateSettings,
    onShowShortcutsHelp,
  ]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const inEditable = isEditableElement(event.target);

    for (const shortcut of SHORTCUT_DEFINITIONS) {
      if (!matchesShortcut(event, shortcut)) continue;

      // 如果焦点在可编辑元素中，且该快捷键不允许在输入框中触发，则跳过
      if (inEditable && !shortcut.activeInInput) continue;

      const callback = callbackMap[shortcut.id];
      if (callback) {
        event.preventDefault();
        event.stopPropagation();
        callback();
        return;
      }
    }
  }, [callbackMap]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleKeyDown]);

  const shortcuts = useMemo(() => {
    const mac = isMac();
    return SHORTCUT_DEFINITIONS.map((s) => ({
      ...s,
      displayLabel: mac ? s.macLabel : s.label,
    }));
  }, []);

  return { shortcuts };
}
