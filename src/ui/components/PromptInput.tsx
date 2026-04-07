import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ClientEvent, ImageContent, PermissionMode } from "../types";
import { useAppStore } from "../store/useAppStore";
import { useAuthStore } from "../store/useAuthStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useToolExecutionStore } from "../hooks/useToolExecutionStore";
import { useModelStore } from "../hooks/useModels";
import { SkillSelector } from "./chat/SkillSelector";
import { PermissionModeSelector } from "./chat/PermissionModeSelector";
import { TypewriterHint } from "./chat/TypewriterHint";
import { InlineCwdSelector } from "./chat/InlineCwdSelector";
import { ModelSelector } from "./ModelSelector";
import { useTypewriterHint } from "../hooks/useTypewriterHint";
import { toast } from "../hooks/use-toast";
import { buildFastSessionTitle } from "../lib/session-title";
import { buildFixedBottomInsetStyle } from "../lib/layout-insets";
import { formatShortcut } from "../utils/platform";
import {
  getPromptHistory,
  navigatePromptHistory,
  shouldHandlePromptHistoryNavigation,
} from "../utils/prompt-history";

const DEFAULT_ALLOWED_TOOLS = "Read,Edit,Bash";
const MAX_ROWS = 12;
const LINE_HEIGHT = 21;
const MAX_HEIGHT = MAX_ROWS * LINE_HEIGHT;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** 打字机提示词列表（来源：NewWelcomeGuide 所有推荐卡片的 prompt） */
const TYPEWRITER_HINTS = [
  // 文件管理类
  "帮我整理下载文件夹，自动分类、重命名并检测重复文件",
  "帮我批量重命名这些照片，按拍摄日期和地点分类",
  "帮我检测并清理电脑中的重复文件",
  // 数据处理类
  "帮我处理这些发票照片，提取数据并生成Excel报表",
  "帮我清洗这个Excel文件中的数据，去重并修复格式问题",
  "帮我合并这些CSV文件，处理格式不一致的问题",
  "帮我从这个网站抓取产品信息并整理成表格",
  // 内容创作类
  "帮我处理这些会议录音，生成纪要并提取待办事项",
  "帮我批量处理这些视频，添加字幕和生成缩略图",
  "帮我写一篇关于[主题]的SEO优化文章",
  "帮我为这个产品生成社交媒体营销内容",
  // 财务管理类
  "帮我分析这些消费记录，生成财务报告",
  "帮我计算个人所得税并准备申报材料",
  "帮我分析投资组合的表现并提供优化建议",
  // 学习研究类
  "帮我分析这些客户反馈，进行情感分析并生成报告",
  "帮我分析这些研究论文并生成文献综述",
  "帮我制定英语学习计划并推荐学习资源",
  // 工作协作类
  "帮我整理项目文档，按类型分类并创建索引",
  "帮我为这个项目制定详细的执行计划",
  "帮我处理这些邮件，分类并生成回复建议",
  // 个人生活类
  "帮我制定一周的健康膳食计划",
  "帮我规划去[目的地]的旅行攻略",
  "帮我分析健康数据并提供改善建议",
] as const;

interface PendingImage {
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  preview: string;
  size: number;
}

export type DispatchAck = { success: boolean; error?: string; code?: string };
type DispatchClientEvent = (event: ClientEvent) => Promise<DispatchAck>;

interface PromptInputProps {
  sendEvent: (event: ClientEvent) => void;
  dispatchEvent?: DispatchClientEvent;
  onSendMessage?: () => void;
  disabled?: boolean;
  leftInset?: number;
  rightInset?: number;
  /** 未登录时点击底部提示触发登录 */
  onLoginClick?: () => void;
  /** 新会话场景：Skill 模式 */
  startSkillMode?: "auto" | "manual";
  /** 新会话场景：打开高级设置（StartSessionModal） */
  onAdvancedSettings?: () => void;
  /** 新会话场景：高级设置里的权限模式 */
  startPermissionMode?: PermissionMode;
  /** 新会话场景：高级设置里手动选定的 skill IDs */
  startActiveSkillIds?: string[];
}

function inferProviderFromModelProvider(modelProvider?: string): "claude" | "codex" | null {
  if (!modelProvider) return null;
  const provider = modelProvider.trim().toLowerCase();

  if (provider.includes("openai")) {
    return "codex";
  }

  if (provider.includes("anthropic") || provider.includes("claude")) {
    return "claude";
  }

  return null;
}

function inferProviderFromModelId(modelId?: string | null): "claude" | "codex" | null {
  if (!modelId) return null;
  const model = modelId.trim().toLowerCase();

  if (!model) return null;
  if (model.includes("claude") || model.includes("anthropic")) return "claude";
  if (
    model.includes("codex") ||
    model.includes("gpt") ||
    model.includes("openai") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4")
  ) {
    return "codex";
  }
  return null;
}

function shouldFallbackToNewSessionByMessage(error?: string): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes("会话尚未准备完成") ||
    normalized.includes("session has no resume id yet") ||
    normalized.includes("session has no resume id")
  );
}

function isSessionNotReadyAck(ack: DispatchAck): boolean {
  if (ack.code === "SESSION_NOT_READY") {
    return true;
  }
  return shouldFallbackToNewSessionByMessage(ack.error);
}

function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session-start-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ContinueFailureDecision =
  | { action: "stay_with_error"; message?: string }
  | { action: "fallback_to_new_session" }
  | { action: "show_error"; message?: string };

export function decideContinueFailureStrategy(
  ack: DispatchAck,
  sessionStatus?: string,
): ContinueFailureDecision {
  const isSessionNotReady = isSessionNotReadyAck(ack);
  if (isSessionNotReady && sessionStatus === "error") {
    return {
      action: "stay_with_error",
      message: ack.error,
    };
  }

  if (isSessionNotReady) {
    return { action: "fallback_to_new_session" };
  }

  return {
    action: "show_error",
    message: ack.error,
  };
}

/**
 * 将 File 转换为 base64 字符串
 */
async function fileToBase64(file: File): Promise<{ base64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 移除 data:image/xxx;base64, 前缀
      const base64 = result.split(",")[1];
      resolve({ base64, dataUrl: result });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function usePromptActions(
  sendEvent: (event: ClientEvent) => void,
  dispatchEvent: DispatchClientEvent | undefined,
  images: PendingImage[],
  clearImages: () => void,
  permissionModeForStart?: PermissionMode,
  skillModeForStart?: "manual" | "auto",
  activeSkillIdsForStart?: string[]
) {
  const { t } = useTranslation();
  const prompt = useAppStore((state) => state.prompt);
  const cwd = useAppStore((state) => state.cwd);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const sessions = useAppStore((state) => state.sessions);
  const setPrompt = useAppStore((state) => state.setPrompt);
  const setPendingStart = useAppStore((state) => state.setPendingStart);
  const setPendingStartRequestId = useAppStore((state) => state.setPendingStartRequestId);
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const defaultProvider = useSettingsStore((state) => state.provider.defaultProvider);
  const models = useModelStore((state) => state.models);
  const selectedModelId = useModelStore((state) => state.selectedModelId);
  const thinkingEffort = "medium" as const;

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const isRunning = activeSession?.status === "running";
  const sessionPermissionMode = activeSession?.permissionMode ?? "bypassPermissions";
  const selectedModel = models.find((m) => m.id === selectedModelId);
  const inferredStartProvider = inferProviderFromModelProvider(selectedModel?.provider);
  const inferredFromModelId = inferProviderFromModelId(selectedModelId);
  const startProvider = inferredStartProvider ?? inferredFromModelId ?? defaultProvider ?? "claude";
  const continueProvider =
    inferredStartProvider ??
    inferredFromModelId ??
    activeSession?.provider ??
    defaultProvider ??
    "claude";
  const startPermissionMode = permissionModeForStart ?? sessionPermissionMode;
  const startSkillMode = skillModeForStart ?? "auto";
  const startActiveSkillIds = useMemo(
    () => (startSkillMode === "manual" ? (activeSkillIdsForStart ?? []) : []),
    [activeSkillIdsForStart, startSkillMode]
  );

  const handleSend = useCallback(async (): Promise<boolean> => {
    // 命令式读取 prompt，避免将 prompt 加入依赖导致每次按键重建回调
    const currentPrompt = useAppStore.getState().prompt;
    if (!currentPrompt.trim() && images.length === 0) return false;

    if (!activeSessionId && useAppStore.getState().pendingStart) {
      return false;
    }

    // 构建图片内容
    const imageContents: ImageContent[] = images.map((img) => ({
      data: img.data,
      mediaType: img.mediaType,
    }));
    const normalizedPrompt =
      currentPrompt ||
      (images.length > 0
        ? t("chat.input.analyzeImagePrompt", "请分析这张图片")
        : "");
    const selectedModelIdForSend = selectedModelId || localStorage.getItem("selected-model-id") || undefined;
    let eventToDispatch: ClientEvent;
    let shouldResetPendingStartOnError = false;

    if (!activeSessionId) {
      // 兜底：若 cwd 为空但已有 activeSession.cwd，就用它
      let effectiveCwd = cwd.trim();
      if (!effectiveCwd && activeSession?.cwd) {
        effectiveCwd = activeSession.cwd;
      }

      const titleSeed = currentPrompt || t("chat.input.analyzeImageTitle", "图片分析");
      const title = buildFastSessionTitle(titleSeed, t("session.defaultTitle", "新对话"));
      const clientRequestId = createClientRequestId();
      setPendingStart(true);
      setPendingStartRequestId(clientRequestId);
      shouldResetPendingStartOnError = true;

      eventToDispatch = {
        type: "session.start",
        payload: {
          title,
          prompt: normalizedPrompt,
          cwd: effectiveCwd || undefined,
          allowedTools: DEFAULT_ALLOWED_TOOLS,
          images: imageContents.length > 0 ? imageContents : undefined,
          permissionMode: startPermissionMode,
          skillMode: startSkillMode,
          activeSkillIds: startActiveSkillIds,
          modelId: selectedModelIdForSend,
          provider: startProvider,
          thinkingEffort,
          clientRequestId,
        },
      };
    } else {
      if (activeSession?.status === "running") {
        setGlobalError(
          t("error.sessionRunning", "会话仍在运行，请稍后再试。")
        );
        return false;
      }
      eventToDispatch = {
        type: "session.continue",
        payload: {
          sessionId: activeSessionId,
          prompt: normalizedPrompt,
          images: imageContents.length > 0 ? imageContents : undefined,
          permissionMode: sessionPermissionMode,
          modelId: selectedModelIdForSend,
          provider: continueProvider,
          thinkingEffort,
        },
      };
    }

    const dispatchWithAck = async (event: ClientEvent): Promise<DispatchAck> => {
      try {
        if (dispatchEvent) {
          return await dispatchEvent(event);
        }
        sendEvent(event);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };

    let ack: DispatchAck = await dispatchWithAck(eventToDispatch);
    if (!ack.success) {
      if (shouldResetPendingStartOnError) {
        setPendingStart(false);
        setPendingStartRequestId(null);
      }

      if (eventToDispatch.type === "session.continue") {
        const decision = decideContinueFailureStrategy(ack, activeSession?.status);

        // 当前会话已明确失败时，不自动新建任务，直接给出可操作的错误提示。
        if (decision.action === "stay_with_error") {
          setGlobalError(
            decision.message ||
            t(
              "error.previousRequestFailed",
              "上一条请求失败，请检查网络或切换模型后重试。"
            )
          );
          return false;
        }

        // 旧会话残留状态导致 continue 失败时，自动降级为新会话，避免用户“无法发送”。
        if (decision.action === "fallback_to_new_session") {
          let effectiveCwd = cwd.trim();
          if (!effectiveCwd && activeSession?.cwd) {
            effectiveCwd = activeSession.cwd;
          }

          const titleSeed = currentPrompt || t("chat.input.analyzeImageTitle", "图片分析");
          const title = buildFastSessionTitle(titleSeed, t("session.defaultTitle", "新对话"));
          const clientRequestId = createClientRequestId();
          setPendingStart(true);
          setPendingStartRequestId(clientRequestId);

          ack = await dispatchWithAck({
            type: "session.start",
            payload: {
              title,
              prompt: normalizedPrompt,
              cwd: effectiveCwd || undefined,
              allowedTools: DEFAULT_ALLOWED_TOOLS,
              images: imageContents.length > 0 ? imageContents : undefined,
              permissionMode: startPermissionMode,
              skillMode: startSkillMode,
              activeSkillIds: startActiveSkillIds,
              modelId: selectedModelIdForSend,
              provider: startProvider,
              thinkingEffort,
              clientRequestId,
            },
          });

          if (!ack.success) {
            setPendingStart(false);
            setPendingStartRequestId(null);
            setGlobalError(ack.error || t("error.sendFailed", "发送失败，请重试。"));
            return false;
          }

          setPrompt("");
          clearImages();
          return true;
        }
      }

      setGlobalError(ack.error || t("error.sendFailed", "发送失败，请重试。"));
      return false;
    }
    setPrompt("");
    clearImages();
    return true;
  }, [
    activeSession,
    activeSessionId,
    cwd,
    dispatchEvent,
    images,
    selectedModelId,
    sessionPermissionMode,
    startProvider,
    continueProvider,
    startPermissionMode,
    startSkillMode,
    startActiveSkillIds,
    sendEvent,
    setGlobalError,
    setPendingStart,
    setPendingStartRequestId,
    setPrompt,
    clearImages,
    t,
  ]);

  const handleStop = useCallback(() => {
    if (!activeSessionId) return;
    useAppStore.getState().setSessionStopping(activeSessionId, true);
    const executions = useToolExecutionStore.getState().executions;
    const hasBlockingEdit = Object.values(executions).some((exec) => {
      if (exec.status !== "running") return false;
      const name = (exec.toolName || "").toLowerCase();
      return name === "edit" || name === "write" || name.includes("edit") || name.includes("write");
    });
    if (hasBlockingEdit) {
      toast({
        title: t("chat.stopping", "正在停止…"),
        description: t("chat.waitingForToolStop", "等待工具结束"),
        variant: "warning"
      });
    }
    sendEvent({ type: "session.stop", payload: { sessionId: activeSessionId } });
  }, [activeSessionId, sendEvent, t]);

  const handleStartFromModal = useCallback(() => {
    if (!cwd.trim()) {
      setGlobalError(
        t("error.workingDirectoryRequired", "需要设置工作目录才能开始会话")
      );
      return;
    }
    // 创建空会话，不发送消息，让用户在对话框中输入
    setPendingStart(false);
    setPendingStartRequestId(null);
    // 清空 prompt，准备在对话框中输入
    setPrompt("");
  }, [cwd, setGlobalError, setPendingStart, setPendingStartRequestId, setPrompt, t]);

  return { prompt, setPrompt, isRunning, sessionPermissionMode, handleSend, handleStop, handleStartFromModal };
}

export const PromptInput = React.memo(function PromptInput({
  sendEvent,
  dispatchEvent,
  onSendMessage,
  disabled = false,
  leftInset = 0,
  rightInset = 0,
  onLoginClick,
  startSkillMode,
  onAdvancedSettings,
  startPermissionMode,
  startActiveSkillIds,
}: PromptInputProps) {
  const { t } = useTranslation();
  const [images, setImages] = useState<PendingImage[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [expandedText, setExpandedText] = useState('');
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const expandedRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const sessions = useAppStore((state) => state.sessions);
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const sessionHasMessages = (activeSession?.messages?.length ?? 0) > 0;
  const currentSessionHistoryKey = activeSessionId ?? "__pending__";
  const promptHistoryIndexRef = useRef<number | null>(null);
  const promptHistoryDraftRef = useRef<string | null>(null);
  const optimisticPromptRef = useRef<{ sessionKey: string; prompt: string } | null>(null);
  const promptHistorySessionKeyRef = useRef(currentSessionHistoryKey);

  const clearImages = useCallback(() => {
    setImages([]);
  }, []);

  const { prompt, setPrompt, isRunning, sessionPermissionMode, handleSend, handleStop } = usePromptActions(
    sendEvent,
    dispatchEvent,
    images,
    clearImages,
    startPermissionMode,   // 高级设置里设定的权限模式（undefined 时用默认）
    startSkillMode,        // skillModeForStart — 从 props 透传
    startActiveSkillIds    // 高级设置里手动选定的 skill IDs
  );

  /** 是否显示打字机提示词：已登录 + 无消息 + 输入框为空 */
  const showTypewriter = isAuthenticated && !sessionHasMessages && !prompt.trim();

  const typewriterHints = useMemo(() => [...TYPEWRITER_HINTS], []);
  const { displayText: twDisplayText, fullText: twFullText, isComplete: twIsComplete, phase: twPhase } =
    useTypewriterHint(typewriterHints, showTypewriter);

  const resetPromptHistoryNavigation = useCallback(() => {
    promptHistoryIndexRef.current = null;
    promptHistoryDraftRef.current = null;
  }, []);

  const ensurePromptHistorySession = useCallback(() => {
    if (promptHistorySessionKeyRef.current === currentSessionHistoryKey) {
      return;
    }

    promptHistorySessionKeyRef.current = currentSessionHistoryKey;
    promptHistoryIndexRef.current = null;
    promptHistoryDraftRef.current = null;
  }, [currentSessionHistoryKey]);

  const syncTextareaCaretToEnd = useCallback(
    (targetRef: React.RefObject<HTMLTextAreaElement | null>) => {
      requestAnimationFrame(() => {
        const target = targetRef.current;
        if (!target) return;
        target.focus();
        const cursor = target.value.length;
        target.setSelectionRange(cursor, cursor);
      });
    },
    []
  );

  const resolvePromptHistory = useCallback(() => {
    ensurePromptHistorySession();
    const optimisticPrompt =
      optimisticPromptRef.current?.sessionKey === currentSessionHistoryKey
        ? optimisticPromptRef.current.prompt
        : null;
    return getPromptHistory(activeSession?.messages ?? [], optimisticPrompt);
  }, [activeSession?.messages, currentSessionHistoryKey, ensurePromptHistorySession]);

  const rememberSubmittedPrompt = useCallback(
    (submittedPrompt: string) => {
      if (!submittedPrompt.trim()) return;
      optimisticPromptRef.current = {
        sessionKey: currentSessionHistoryKey,
        prompt: submittedPrompt,
      };
      resetPromptHistoryNavigation();
    },
    [currentSessionHistoryKey, resetPromptHistoryNavigation]
  );

  const applyPromptHistoryNavigation = useCallback(
    (
      direction: "up" | "down",
      currentValue: string,
      applyValue: (value: string) => void,
      targetRef: React.RefObject<HTMLTextAreaElement | null>
    ) => {
      const nextState = navigatePromptHistory({
        history: resolvePromptHistory(),
        direction,
        currentIndex: promptHistoryIndexRef.current,
        draft: promptHistoryDraftRef.current,
        currentValue,
      });

      if (!nextState.changed) {
        return false;
      }

      promptHistoryDraftRef.current = nextState.nextDraft;
      promptHistoryIndexRef.current = nextState.nextIndex;
      applyValue(nextState.nextValue);
      syncTextareaCaretToEnd(targetRef);
      return true;
    },
    [resolvePromptHistory, syncTextareaCaretToEnd]
  );

  const maybeHandlePromptHistoryNavigation = useCallback(
    (
      event: React.KeyboardEvent<HTMLTextAreaElement>,
      currentValue: string,
      applyValue: (value: string) => void,
      targetRef: React.RefObject<HTMLTextAreaElement | null>
    ) => {
      if (images.length > 0) {
        return false;
      }

      if (
        !shouldHandlePromptHistoryNavigation({
          key: event.key,
          value: currentValue,
          selectionStart: event.currentTarget.selectionStart,
          selectionEnd: event.currentTarget.selectionEnd,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        })
      ) {
        return false;
      }

      const handled = applyPromptHistoryNavigation(
        event.key === "ArrowUp" ? "up" : "down",
        currentValue,
        applyValue,
        targetRef
      );

      if (handled) {
        event.preventDefault();
      }

      return handled;
    },
    [applyPromptHistoryNavigation, images.length]
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      resetPromptHistoryNavigation();
      setPrompt(value);
    },
    [resetPromptHistoryNavigation, setPrompt]
  );

  const handleExpandedChange = useCallback(
    (value: string) => {
      resetPromptHistoryNavigation();
      setExpandedText(value);
    },
    [resetPromptHistoryNavigation]
  );

  /** 接受打字机提示词，填入输入框 */
  const acceptTypewriterHint = useCallback(() => {
    if (!twFullText) return;
    resetPromptHistoryNavigation();
    setPrompt(twFullText);
    requestAnimationFrame(() => {
      const el = promptRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(twFullText.length, twFullText.length);
      }
    });
  }, [resetPromptHistoryNavigation, twFullText, setPrompt]);

  /**
   * 处理图片文件
   */
  const processImageFile = useCallback(
    async (file: File) => {
      // 检查类型
      if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        setGlobalError(
          t("error.unsupportedImageType", "不支持的图片格式：{{type}}", {
            type: file.type,
          })
        );
        return;
      }

      // 检查大小
      if (file.size > MAX_IMAGE_SIZE) {
        setGlobalError(
          t("error.imageTooLarge", "图片大小不能超过 {{max}}", { max: "5MB" })
        );
        return;
      }

      // 检查数量限制
      if (images.length >= 5) {
        setGlobalError(
          t("error.imageLimit", "最多只能添加 {{count}} 张图片", { count: 5 })
        );
        return;
      }

      try {
        const { base64, dataUrl } = await fileToBase64(file);

        setImages((prev) => [
          ...prev,
          {
            data: base64,
            mediaType: file.type as PendingImage["mediaType"],
            preview: dataUrl,
            size: file.size,
          },
        ]);
      } catch (error) {
        console.error("Failed to process image:", error);
        setGlobalError(t("error.imageProcessingFailed", "图片处理失败"));
      }
    },
    [images.length, setGlobalError, t]
  );

  /**
   * 处理粘贴事件
   */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            processImageFile(file);
          }
          break;
        }
      }
    },
    [processImageFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      for (const file of files) {
        void processImageFile(file);
      }
      e.target.value = "";
    },
    [processImageFile]
  );

  const openFilePicker = useCallback(() => {
    if (disabled && !isRunning) return;
    fileInputRef.current?.click();
  }, [disabled, isRunning]);

  /**
   * 删除图片
   */
  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      const newImages = [...prev];
      newImages.splice(index, 1);
      return newImages;
    });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled && !isRunning) return;
    if (e.nativeEvent.isComposing) return;

    if (maybeHandlePromptHistoryNavigation(e, prompt, setPrompt, promptRef)) {
      return;
    }

    // Tab 键：接受打字机提示词
    if (e.key === "Tab" && showTypewriter && twFullText) {
      e.preventDefault();
      acceptTypewriterHint();
      return;
    }

    if (e.key !== "Enter" || e.shiftKey) return;
    if (isRunning) {
      return;
    }
    e.preventDefault();
    void (async () => {
      const submittedPrompt = useAppStore.getState().prompt;
      const sent = await handleSend();
      if (sent) {
        rememberSubmittedPrompt(submittedPrompt);
        onSendMessage?.();
        // 发送成功后确保输入框保持 focus
        requestAnimationFrame(() => promptRef.current?.focus());
      }
    })();
  };

  const handleButtonClick = () => {
    if (disabled && !isRunning) return;
    if (isRunning) {
      handleStop();
      // 停止后聚焦输入框，方便继续输入
      requestAnimationFrame(() => promptRef.current?.focus());
    } else {
      void (async () => {
        const submittedPrompt = useAppStore.getState().prompt;
        const sent = await handleSend();
        if (sent) {
          rememberSubmittedPrompt(submittedPrompt);
          onSendMessage?.();
        }
        // 无论成功失败，都把焦点还给输入框
        requestAnimationFrame(() => promptRef.current?.focus());
      })();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = "auto";
    const scrollHeight = target.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      target.style.height = `${MAX_HEIGHT}px`;
      target.style.overflowY = "auto";
    } else {
      target.style.height = `${scrollHeight}px`;
      target.style.overflowY = "hidden";
    }
  };

  useEffect(() => {
    if (!promptRef.current) return;
    promptRef.current.style.height = "auto";
    const scrollHeight = promptRef.current.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      promptRef.current.style.height = `${MAX_HEIGHT}px`;
      promptRef.current.style.overflowY = "auto";
    } else {
      promptRef.current.style.height = `${scrollHeight}px`;
      promptRef.current.style.overflowY = "hidden";
    }
  }, [prompt]);

  const shellInsetStyle = useMemo(
    () => buildFixedBottomInsetStyle({ leftInset, rightInset }),
    [leftInset, rightInset]
  );
  const pasteShortcut = useMemo(() => formatShortcut(["Mod", "V"]), []);

  const openExpanded = useCallback(() => {
    // 用当前全局 prompt 初始化本地 state，之后打字只更新本地 state
    setExpandedText(useAppStore.getState().prompt);
    setExpanded(true);
    requestAnimationFrame(() => {
      const el = expandedRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }, []);

  const closeExpanded = useCallback(() => {
    // 关闭时才把本地 state 同步回全局 store
    setPrompt(expandedText);
    setExpanded(false);
    requestAnimationFrame(() => promptRef.current?.focus());
  }, [expandedText, setPrompt]);

  // Escape 关闭展开框
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeExpanded();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, closeExpanded]);

  return (
    <section
      data-tour="prompt-input"
      className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-surface-cream via-surface-cream via-[85%] to-transparent pb-6 px-2 lg:pb-8 pt-8 pointer-events-none"
      style={shellInsetStyle}
    >
      <div className="mx-auto w-full max-w-full lg:max-w-3xl pointer-events-auto">
        {/* 未登录提示 — 可点击触发登录 */}
        {!isAuthenticated && (
          <button
            type="button"
            onClick={onLoginClick}
            className="group relative flex w-full items-center gap-3 rounded-2xl border border-ink-900/10 bg-surface px-5 py-4 shadow-card animate-fade-in transition-all duration-200 hover:border-accent/30 hover:shadow-[0_2px_8px_rgba(174,86,48,0.08)] active:scale-[0.98] cursor-pointer dark:border-[#faf9f50d] dark:hover:border-accent/30"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/8 transition-colors group-hover:bg-accent/14">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-ink-900 dark:text-[#faf9f5]">
                {t('auth.loginToChat', '登录后开始对话')}
              </span>
              <span className="text-xs text-muted">
                {t('auth.loginHint', '登录以使用 AI 助手功能')}
              </span>
            </div>
            <svg viewBox="0 0 24 24" className="ml-auto h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}

        {/* 已登录：正常输入区域 */}
        {isAuthenticated && (
          <>
            {/* 技能选择器和权限模式切换 - 仅在有活动会话时显示 */}
        {activeSessionId && (
          <div className="mb-2 flex items-center gap-1.5 px-0.5">
            <SkillSelector sessionId={activeSessionId} disabled={disabled && !isRunning} />
            <div className="h-3.5 w-px bg-ink-900/10" />
            <PermissionModeSelector
              value={sessionPermissionMode}
              onChange={(mode: PermissionMode) => {
                window.electron.session.update(activeSessionId, { permissionMode: mode });
                useAppStore.setState((state) => ({
                  sessions: {
                    ...state.sessions,
                    [activeSessionId]: {
                      ...state.sessions[activeSessionId],
                      permissionMode: mode,
                    },
                  },
                }));
              }}
              disabled={isRunning}
              compact
              dropUp
            />
          </div>
        )}

        {/* 输入框 */}
        <div className="group/input relative flex w-full flex-col rounded-2xl border border-[#1414130a] dark:border-[#ffffff10] bg-white dark:bg-[#2b2a27] px-4 pt-3 pb-2 shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.035)] dark:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.12)] transition-all duration-150 focus-within:border-[#ae5630]/30 focus-within:shadow-[0_0_0_3px_rgba(174,86,48,0.10)]">
          {/* 展开按钮 — 悬停时显示 */}
          <button
            type="button"
            onClick={openExpanded}
            className="absolute top-2.5 right-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-md text-ink-400 opacity-0 transition-all group-hover/input:opacity-100 hover:bg-ink-900/8 hover:text-ink-600"
            title={t("chat.input.expand", "展开输入框")}
            aria-label={t("chat.input.expand", "展开输入框")}
            tabIndex={-1}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15,3 21,3 21,9" />
              <polyline points="9,21 3,21 3,15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          {/* 图片预览（浮层，不占布局高度） */}
          {images.length > 0 && (
            <div className="absolute -top-16 left-0 right-0">
              <div className="flex items-center gap-2 overflow-x-auto rounded-lg border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#2b2a27] px-2 py-1 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]">
                {images.map((img, index) => (
                  <div
                    key={index}
                    className="relative group rounded-md overflow-hidden border border-[#1414130a] dark:border-[#ffffff08] bg-surface animate-fade-in-scale"
                  >
                    <img
                      src={img.preview}
                      alt={t("chat.input.imagePreviewAlt", "预览 {{index}}", {
                        index: index + 1,
                      })}
                      className="h-12 w-12 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#DC2626] text-[#faf9f5] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title={t("chat.input.removeImage", "删除图片")}
                    >
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-[#141413]/60 text-[#faf9f5] text-[8px] text-center py-0.5">
                      {(img.size / 1024).toFixed(0)}KB
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_IMAGE_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {/* 上行：textarea */}
          <div className="relative">
            {/* 打字机提示词叠加层 */}
            {showTypewriter && (
              <TypewriterHint
                displayText={twDisplayText}
                isComplete={twIsComplete}
                onAccept={acceptTypewriterHint}
                phase={twPhase}
              />
            )}
            <textarea
              rows={1}
              data-prompt-input
              className="w-full resize-none bg-transparent py-1.5 text-sm text-[#141413] dark:text-[#faf9f5] placeholder:text-[#87867f] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              placeholder={
                showTypewriter
                  ? ""
                  : disabled
                  ? t("chat.input.disabledPlaceholder", "创建/选择任务后开始...")
                  : images.length > 0
                  ? t("chat.input.imagePlaceholder", "描述图片或直接发送...")
                  : t(
                      "chat.input.defaultPlaceholder",
                      "描述你希望 Agent 处理的任务... (点击上传或 {{pasteShortcut}} 粘贴图片)",
                      { pasteShortcut }
                    )
              }
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onPaste={handlePaste}
              ref={promptRef}
              disabled={disabled && !isRunning}
            />
          </div>

          {/* 下行：底部工具栏 */}
          <div className="mt-1 flex items-center justify-between border-t border-[#1414130a] dark:border-[#ffffff08] pt-1.5">
            {/* 左侧：工作目录 + 图片上传 */}
            <div className="flex items-center gap-0.5">
              {!activeSessionId ? (
                <InlineCwdSelector onAdvancedSettings={onAdvancedSettings} />
              ) : activeSession?.cwd ? (
                <button
                  type="button"
                  onClick={() => void window.electron.shell.openPath(activeSession.cwd!)}
                  className="flex max-w-[200px] items-center gap-1.5 rounded-lg bg-ink-900/8 px-2.5 py-1.5 text-[11px] font-medium text-ink-700 transition-colors hover:bg-ink-900/12"
                  title={activeSession.cwd}
                  aria-label={t("workspace.cwdButtonHint", "工作目录 — 点击打开")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 shrink-0 text-ink-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="truncate">
                    {activeSession.cwd.split(/[/\\]/).filter(Boolean).slice(-2).join('/') || activeSession.cwd}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={openFilePicker}
                className="flex items-center justify-center h-7 w-7 rounded-lg text-ink-400 transition-colors hover:bg-ink-900/8 hover:text-ink-600 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={t("chat.input.uploadImage", "上传图片")}
                disabled={disabled && !isRunning}
                title={t("chat.input.uploadImage", "上传图片")}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {/* 右侧：模型选择 + keyboard hints + 发送按钮 */}
            <div className="flex items-center gap-2">
              <ModelSelector compact disabled={disabled && !isRunning} />
              {(!disabled || isRunning) && (
                <div className="hidden sm:flex flex-col items-end text-[11px] leading-tight text-[#87867f]">
                  {isRunning ? (
                    <span>Esc 停止</span>
                  ) : (
                    <>
                      <span>{t("chat.input.shortcutSend", "Enter 发送")}</span>
                      <span>{t("chat.input.shortcutNewline", "Shift+Enter 换行")}</span>
                    </>
                  )}
                </div>
              )}
              <button
                className={`shrink-0 flex items-center justify-center rounded-full bg-[#ae5630] text-[#faf9f5] transition-all duration-200 hover:bg-[#c4633a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
                  isRunning
                    ? "h-8 w-8"
                    : "h-8 gap-1.5 px-3.5"
                }`}
                onClick={handleButtonClick}
                aria-label={
                  isRunning
                    ? t("chat.stopGeneration", "停止生成")
                    : t("chat.sendMessage", "发送消息")
                }
                disabled={disabled && !isRunning}
              >
                {isRunning ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-[#faf9f5] text-[#faf9f5]" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    <span className="text-[12px] font-medium">{t("chat.sendMessage", "发送")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 版权信息 */}
        {!disabled && images.length === 0 && (
          <p className="absolute bottom-1.5 left-0 right-0 text-center text-[10px] text-[#87867f]/50 pointer-events-none select-none">
            © 2026 Cherry Agent
          </p>
        )}
          </>
        )}
      </div>

      {/* 展开的全屏输入框 */}
      {expanded && isAuthenticated && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in-0 duration-150 pointer-events-auto"
          onClick={(e) => { if (e.target === e.currentTarget) closeExpanded(); }}
        >
          <div className="relative flex w-[min(92vw,860px)] flex-col rounded-2xl border border-[#1414130a] dark:border-[#ffffff10] bg-white dark:bg-[#2b2a27] shadow-[0_8px_48px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_48px_rgba(0,0,0,0.4)] animate-in zoom-in-95 fade-in-0 duration-150"
            style={{ maxHeight: "min(88vh, 700px)" }}
          >
            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={closeExpanded}
              className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-900/8 hover:text-ink-700"
              aria-label={t("chat.input.collapse", "收起输入框")}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* 大文本框 */}
            <div className="relative flex-1 overflow-hidden px-5 pt-5 pb-3">
              <div className="relative h-full">
                {showTypewriter && !expandedText.trim() && (
                  <TypewriterHint
                    displayText={twDisplayText}
                    isComplete={twIsComplete}
                    onAccept={acceptTypewriterHint}
                    phase={twPhase}
                  />
                )}
                <textarea
                  ref={expandedRef}
                  className="h-full min-h-[320px] w-full resize-none bg-transparent py-[7px] text-sm text-[#141413] dark:text-[#faf9f5] placeholder:text-[#87867f] focus-visible:outline-none"
                  style={{ maxHeight: "min(56vh, 480px)" }}
                placeholder={
                  (showTypewriter && !expandedText.trim())
                    ? ""
                    : disabled
                    ? t("chat.input.disabledPlaceholder", "创建/选择任务后开始...")
                    : images.length > 0
                    ? t("chat.input.imagePlaceholder", "描述图片或直接发送...")
                    : t(
                        "chat.input.defaultPlaceholder",
                        "描述你希望 Agent 处理的任务... (点击上传或 {{pasteShortcut}} 粘贴图片)",
                        { pasteShortcut }
                      )
                }
                value={expandedText}
                onChange={(e) => handleExpandedChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (maybeHandlePromptHistoryNavigation(e, expandedText, setExpandedText, expandedRef)) {
                    return;
                  }
                  if (e.key === "Tab" && showTypewriter && twFullText) {
                    e.preventDefault();
                    resetPromptHistoryNavigation();
                    setExpandedText(twFullText);
                    return;
                  }
                  if (e.key !== "Enter" || e.shiftKey) return;
                  if (isRunning) return;
                  e.preventDefault();
                  void (async () => {
                    const submittedPrompt = expandedText;
                    useAppStore.getState().setPrompt(expandedText);
                    const sent = await handleSend();
                    if (sent) {
                      rememberSubmittedPrompt(submittedPrompt);
                      onSendMessage?.();
                      setExpanded(false);
                      requestAnimationFrame(() => promptRef.current?.focus());
                    }
                  })();
                }}
                onPaste={handlePaste}
                disabled={disabled && !isRunning}
              />
              </div>
            </div>

            {/* 图片预览 */}
            {images.length > 0 && (
              <div className="mx-5 mb-2">
                <div className="flex items-center gap-2 overflow-x-auto rounded-lg border border-[#1414130a] dark:border-[#ffffff08] bg-white dark:bg-[#2b2a27] px-2 py-1">
                  {images.map((img, index) => (
                    <div key={index} className="relative group rounded-md overflow-hidden border border-[#1414130a] dark:border-[#ffffff08] animate-fade-in-scale">
                      <img src={img.preview} alt="" className="h-12 w-12 object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#DC2626] text-[#faf9f5] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 底部工具栏 */}
            <div className="flex items-center justify-between border-t border-[#1414130a] dark:border-[#ffffff08] px-4 py-2.5">
              <div className="flex items-center gap-0.5">
                {!activeSessionId ? (
                  <InlineCwdSelector onAdvancedSettings={onAdvancedSettings} />
                ) : activeSession?.cwd ? (
                  <button
                    type="button"
                    onClick={() => void window.electron.shell.openPath(activeSession.cwd!)}
                    className="flex max-w-[200px] items-center gap-1.5 rounded-lg bg-ink-900/8 px-2.5 py-1.5 text-[11px] font-medium text-ink-700 transition-colors hover:bg-ink-900/12"
                    title={activeSession.cwd}
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink-500" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="truncate">
                      {activeSession.cwd.split(/[/\\]/).filter(Boolean).slice(-2).join('/') || activeSession.cwd}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={openFilePicker}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-900/8 hover:text-ink-600 disabled:opacity-60"
                  aria-label={t("chat.input.uploadImage", "上传图片")}
                  disabled={disabled && !isRunning}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <ModelSelector compact disabled={disabled && !isRunning} />
                {(!disabled || isRunning) && (
                  <div className="hidden sm:flex flex-col items-end text-[11px] leading-tight text-[#87867f]">
                    {isRunning ? (
                      <span>Esc 停止</span>
                    ) : (
                      <>
                        <span>{t("chat.input.shortcutSend", "Enter 发送")}</span>
                        <span>{t("chat.input.shortcutNewline", "Shift+Enter 换行")}</span>
                      </>
                    )}
                  </div>
                )}
                <button
                  data-tour="send-button"
                  className={`shrink-0 flex items-center justify-center rounded-full bg-[#ae5630] text-[#faf9f5] transition-all duration-200 hover:bg-[#c4633a] active:scale-[0.98] disabled:opacity-60 ${
                    isRunning ? "h-8 w-8" : "h-8 gap-1.5 px-3.5"
                  }`}
                  onClick={() => {
                    if (isRunning) {
                      handleStop();
                    } else {
                      void (async () => {
                        const submittedPrompt = expandedText;
                        useAppStore.getState().setPrompt(expandedText);
                        const sent = await handleSend();
                        if (sent) {
                          rememberSubmittedPrompt(submittedPrompt);
                          onSendMessage?.();
                          setExpanded(false);
                          requestAnimationFrame(() => promptRef.current?.focus());
                        }
                      })();
                    }
                  }}
                  aria-label={isRunning ? t("chat.stopGeneration", "停止生成") : t("chat.sendMessage", "发送消息")}
                  disabled={disabled && !isRunning}
                >
                  {isRunning ? (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-[#faf9f5]" fill="currentColor" aria-hidden="true">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                      <span className="text-[12px] font-medium">{t("chat.sendMessage", "发送")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
});
