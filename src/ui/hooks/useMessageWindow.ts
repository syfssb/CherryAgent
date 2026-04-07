import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { StreamMessage } from "../types";
import type { PermissionRequest } from "../store/useAppStore";

const VISIBLE_WINDOW_SIZE = 5;
const LOAD_BATCH_SIZE = 5;

export interface IndexedMessage {
    originalIndex: number;
    message: StreamMessage;
}

export interface MessageWindowState {
    visibleMessages: IndexedMessage[];
    hasMoreHistory: boolean;
    isLoadingHistory: boolean;
    isAtBeginning: boolean;
    loadMoreMessages: () => void;
    resetToLatest: () => void;
    totalMessages: number;
    totalUserInputs: number;
    visibleUserInputs: number;
}

function getUserInputIndices(messages: StreamMessage[]): number[] {
    const indices: number[] = [];
    messages.forEach((msg, idx) => {
        if (msg.type === "user_prompt") {
            indices.push(idx);
        }
    });
    return indices;
}

function calculateVisibleStartIndex(
    messages: StreamMessage[],
    visibleUserInputCount: number
): number {
    const userInputIndices = getUserInputIndices(messages);
    const totalUserInputs = userInputIndices.length;

    if (totalUserInputs <= visibleUserInputCount) {
        return 0;
    }

    const startUserInputPosition = totalUserInputs - visibleUserInputCount;
    return userInputIndices[startUserInputPosition];
}

export interface ServerPaginationOptions {
    hasMoreServerHistory: boolean;
    oldestLoadedCreatedAt?: number;
    oldestLoadedRowid?: number;
    isLoadingServerHistory: boolean;
    onRequestMoreHistory: (sessionId: string, beforeCreatedAt: number, beforeRowid: number) => void;
}

export function useMessageWindow(
    messages: StreamMessage[],
    _permissionRequests: PermissionRequest[],
    sessionId: string | null,
    serverPagination?: ServerPaginationOptions
): MessageWindowState {
    const [visibleUserInputCount, setVisibleUserInputCount] = useState(VISIBLE_WINDOW_SIZE);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const prevSessionIdRef = useRef<string | null>(null);

    const userInputIndices = useMemo(() => getUserInputIndices(messages), [messages]);
    const totalUserInputs = userInputIndices.length;

    // Reset window state on session change
    useEffect(() => {
        if (sessionId !== prevSessionIdRef.current) {
            setVisibleUserInputCount(VISIBLE_WINDOW_SIZE);
            setIsLoadingHistory(false);
            prevSessionIdRef.current = sessionId;
        }
    }, [sessionId]);

    const { visibleMessages, visibleStartIndex } = useMemo(() => {
        if (messages.length === 0) {
            return { visibleMessages: [], visibleStartIndex: 0 };
        }

        const startIndex = calculateVisibleStartIndex(messages, visibleUserInputCount);

        const visible: IndexedMessage[] = messages
            .slice(startIndex)
            .map((message, idx) => ({
                originalIndex: startIndex + idx,
                message,
            }));

        return { visibleMessages: visible, visibleStartIndex: startIndex };
    }, [messages, visibleUserInputCount]);

    // 前端窗口是否还有更多（纯内存）
    const frontendHasMore = visibleStartIndex > 0;
    // 综合考虑服务端是否还有更多历史
    const hasMoreHistory = frontendHasMore || (serverPagination?.hasMoreServerHistory ?? false);

    const loadMoreMessages = useCallback(() => {
        if (isLoadingHistory) return;

        // 步骤 1：前端窗口扩展（纯内存操作，同步完成，无需 loading indicator）
        if (visibleUserInputCount < totalUserInputs) {
            setVisibleUserInputCount((prev) => Math.min(prev + LOAD_BATCH_SIZE, totalUserInputs));
            return;
        }

        // 步骤 2：前端窗口已展开到底，尝试从服务端加载更多
        if (
            serverPagination?.hasMoreServerHistory &&
            !serverPagination.isLoadingServerHistory &&
            sessionId &&
            serverPagination.oldestLoadedCreatedAt != null &&
            serverPagination.oldestLoadedRowid != null
        ) {
            serverPagination.onRequestMoreHistory(
                sessionId,
                serverPagination.oldestLoadedCreatedAt,
                serverPagination.oldestLoadedRowid
            );
        }
    }, [visibleUserInputCount, totalUserInputs, isLoadingHistory, serverPagination, sessionId]);

    const resetToLatest = useCallback(() => {
        setVisibleUserInputCount(VISIBLE_WINDOW_SIZE);
    }, []);

    const visibleUserInputs = useMemo(() => {
        return visibleMessages.filter((item) => item.message.type === "user_prompt").length;
    }, [visibleMessages]);

    return {
        visibleMessages,
        hasMoreHistory,
        isLoadingHistory: isLoadingHistory || (serverPagination?.isLoadingServerHistory ?? false),
        isAtBeginning: !hasMoreHistory && messages.length > 0,
        loadMoreMessages,
        resetToLatest,
        totalMessages: messages.length,
        totalUserInputs,
        visibleUserInputs,
    };
}
