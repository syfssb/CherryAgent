import electron from "electron";

const electronAPI = {
    // Claude Agent IPC APIs
    sendClientEvent: (event: any) => {
        electron.ipcRenderer.send("client-event", event);
    },
    dispatchClientEvent: (event: any) => {
        return electron.ipcRenderer.invoke("client-event-dispatch", event);
    },
    // 通用 invoke 已移除（安全风险：允许调用任意 IPC channel）
    onServerEvent: (callback: (event: any) => void) => {
        const cb = (_: Electron.IpcRendererEvent, payload: string) => {
            try {
                const parsed = JSON.parse(payload);
                // flushBatch() 将整批作为 JSON 数组发送；broadcast() 仍发送单个对象
                if (Array.isArray(parsed)) {
                    for (const event of parsed) { callback(event); }
                } else {
                    callback(parsed);
                }
            } catch (error) {
                console.error("Failed to parse server event:", error);
            }
        };
        electron.ipcRenderer.on("server-event", cb);
        return () => electron.ipcRenderer.off("server-event", cb);
    },
    generateSessionTitle: (userInput: string | null) =>
        ipcInvoke("generate-session-title", userInput),
    selectDirectory: () =>
        ipcInvoke("select-directory"),

    // Tags APIs
    tags: {
        getAll: () =>
            electron.ipcRenderer.invoke("tags:getAll"),
        create: (name: string, color: string) =>
            electron.ipcRenderer.invoke("tags:create", name, color),
        update: (id: string, updates: { name?: string; color?: string }) =>
            electron.ipcRenderer.invoke("tags:update", id, updates),
        delete: (id: string) =>
            electron.ipcRenderer.invoke("tags:delete", id)
    },

    // Session Operations APIs
    session: {
        addTag: (sessionId: string, tagId: string) =>
            electron.ipcRenderer.invoke("session:addTag", sessionId, tagId),
        removeTag: (sessionId: string, tagId: string) =>
            electron.ipcRenderer.invoke("session:removeTag", sessionId, tagId),
        getTags: (sessionId: string) =>
            electron.ipcRenderer.invoke("session:getTags", sessionId),
        togglePinned: (sessionId: string) =>
            electron.ipcRenderer.invoke("session:togglePinned", sessionId),
        toggleArchived: (sessionId: string) =>
            electron.ipcRenderer.invoke("session:toggleArchived", sessionId),
        search: (query: string, options?: { includeArchived?: boolean; tagId?: string }) =>
            electron.ipcRenderer.invoke("session:search", query, options),
        listWithOptions: (options?: { includeArchived?: boolean; tagId?: string; query?: string }) =>
            electron.ipcRenderer.invoke("session:listWithOptions", options),
        // 标题相关 API
        updateTitle: (sessionId: string, title: string) =>
            electron.ipcRenderer.invoke("session:updateTitle", sessionId, title),
        generateTitle: (sessionId: string) =>
            electron.ipcRenderer.invoke("session:generateTitle", sessionId),
        // 全文搜索 API
        fullSearch: (query: string, options?: { includeArchived?: boolean; tagId?: string; messageLimit?: number; messageOffset?: number }) =>
            electron.ipcRenderer.invoke("session:fullSearch", query, options),
        // 通用更新 API（支持 skill 配置等）
        update: (sessionId: string, updates: { activeSkillIds?: string[]; skillMode?: "manual" | "auto"; title?: string; cwd?: string; autoCleanScripts?: boolean }) =>
            electron.ipcRenderer.invoke("session:update", sessionId, updates)
    },

    // Auth APIs
    auth: {
        login: (accessToken: string) =>
            electron.ipcRenderer.invoke("auth:login", accessToken),
        loginWithCode: (code: string, state?: string) =>
            electron.ipcRenderer.invoke("auth:loginWithCode", code, state),
        logout: () =>
            electron.ipcRenderer.invoke("auth:logout"),
        refresh: () =>
            electron.ipcRenderer.invoke("auth:refresh"),
        getStatus: () =>
            electron.ipcRenderer.invoke("auth:getStatus"),
        getCredentials: () =>
            electron.ipcRenderer.invoke("auth:getCredentials"),
        isAuthenticated: () =>
            electron.ipcRenderer.invoke("auth:isAuthenticated"),
        // 同步 token 到主进程 secure-storage
        syncTokens: (tokens: { accessToken: string; refreshToken?: string }) =>
            electron.ipcRenderer.invoke("auth:syncTokens", tokens),
        getUser: () =>
            electron.ipcRenderer.invoke("auth:getUser"),
        startOAuthFlow: (config: any) =>
            electron.ipcRenderer.invoke("auth:startOAuthFlow", config),
        cancelOAuthFlow: () =>
            electron.ipcRenderer.invoke("auth:cancelOAuthFlow"),
        hasActiveOAuthFlow: () =>
            electron.ipcRenderer.invoke("auth:hasActiveOAuthFlow"),
        // OAuth 配置
        createOAuthConfig: (provider: 'google' | 'github') =>
            electron.ipcRenderer.invoke("auth:createOAuthConfig", provider),
        openOAuthWindow: (provider: 'google' | 'github') =>
            electron.ipcRenderer.invoke("auth:openOAuthWindow", provider),
        // 关闭 OAuth 弹窗
        closeOAuthWindows: () =>
            electron.ipcRenderer.invoke("auth:closeOAuthWindows"),
        // 监听认证回调
        onAuthCallback: (callback: (data: any) => void) => {
            const cb = (_: Electron.IpcRendererEvent, data: any) => callback(data);
            electron.ipcRenderer.on("auth:callback", cb);
            return () => electron.ipcRenderer.off("auth:callback", cb);
        }
    },

    // Billing APIs
    billing: {
        getBalance: (forceRefresh?: boolean) =>
            electron.ipcRenderer.invoke("billing:getBalance", forceRefresh),
        recharge: (
            amount: number,
            method: 'stripe' | 'xunhupay',
            options?: {
                currency?: string;
                paymentType?: 'wechat' | 'alipay';
                returnUrl?: string;
            }
        ) => electron.ipcRenderer.invoke("billing:recharge", amount, method, options),
        getRechargeStatus: (orderId: string) =>
            electron.ipcRenderer.invoke("billing:getRechargeStatus", orderId),
        getUsageHistory: (params?: {
            page?: number;
            limit?: number;
            startDate?: string;
            endDate?: string;
            model?: string;
        }) => electron.ipcRenderer.invoke("billing:getUsageHistory", params),
        getUsageStats: (params?: {
            startDate?: string;
            endDate?: string;
        }) => electron.ipcRenderer.invoke("billing:getUsageStats", params),
        getTransactionHistory: (params?: {
            page?: number;
            limit?: number;
            type?: string;
        }) => electron.ipcRenderer.invoke("billing:getTransactionHistory", params),
        getPricing: () =>
            electron.ipcRenderer.invoke("billing:getPricing"),
        exportUsage: (params: {
            format: 'csv' | 'json';
            fileName?: string;
            startDate?: string;
            endDate?: string;
            model?: string;
        }) => electron.ipcRenderer.invoke("billing:exportUsage", params),
        openExternalUrl: (url: string) =>
            electron.ipcRenderer.invoke("billing:openExternalUrl", url),
        getPeriodCard: () =>
            electron.ipcRenderer.invoke("billing:getPeriodCard"),
        getPeriodCardPlans: () =>
            electron.ipcRenderer.invoke("billing:getPeriodCardPlans"),
        purchasePeriodCard: (planId: string, paymentType: 'wechat' | 'alipay') =>
            electron.ipcRenderer.invoke("billing:purchasePeriodCard", planId, paymentType),
    },

    // Workspace APIs
    workspace: {
        watch: (path: string) =>
            electron.ipcRenderer.invoke("workspace:watch", path),
        exists: (path: string) =>
            electron.ipcRenderer.invoke("workspace:exists", path),
        getRecent: (limit?: number) =>
            electron.ipcRenderer.invoke("workspace:getRecent", limit),
        addRecent: (path: string) =>
            electron.ipcRenderer.invoke("workspace:addRecent", path),
        removeRecent: (path: string) =>
            electron.ipcRenderer.invoke("workspace:removeRecent", path),
        getCommonDirs: () =>
            electron.ipcRenderer.invoke("workspace:getCommonDirs"),
        listDir: (path: string, options?: { ignorePatterns?: string[]; limit?: number }) =>
            electron.ipcRenderer.invoke("workspace:listDir", path, options),
        searchFiles: (query: string, options?: { ignorePatterns?: string[]; limit?: number }) =>
            electron.ipcRenderer.invoke("workspace:searchFiles", query, options),
        copyEntry: (path: string) =>
            electron.ipcRenderer.invoke("workspace:copyEntry", path),
        pasteEntry: (targetDirPath?: string) =>
            electron.ipcRenderer.invoke("workspace:pasteEntry", targetDirPath),
        deleteEntry: (path: string) =>
            electron.ipcRenderer.invoke("workspace:deleteEntry", path),
        deleteFile: (path: string) =>
            electron.ipcRenderer.invoke("workspace:deleteFile", path),
        setDefaultCwd: (path: string) =>
            electron.ipcRenderer.invoke("workspace:setDefaultCwd", path),
        // 监听工作区事件
        onWorkspaceEvent: (callback: (event: any) => void) => {
            const cb = (_: Electron.IpcRendererEvent, payload: string) => {
                try {
                    const event = JSON.parse(payload);
                    callback(event);
                } catch (error) {
                    console.error("Failed to parse workspace event:", error);
                }
            };
            electron.ipcRenderer.on("workspace-event", cb);
            return () => electron.ipcRenderer.off("workspace-event", cb);
        }
    },

    // Shell APIs
    shell: {
        showItemInFolder: (filePath: string, cwd: string) =>
            electron.ipcRenderer.invoke("shell:showItemInFolder", filePath, cwd),
        openPath: (filePath: string, cwd?: string) =>
            electron.ipcRenderer.invoke("shell:openPath", filePath, cwd),
    },

    // Clipboard APIs
    clipboard: {
        writeImage: (base64Data: string, mediaType: string) =>
            electron.ipcRenderer.invoke("clipboard:writeImage", base64Data, mediaType),
    },

    // Notification APIs
    notifications: {
        show: (payload: { title: string; body?: string; silent?: boolean; sessionId?: string }) =>
            electron.ipcRenderer.invoke("notification:show", payload),
        check: () =>
            electron.ipcRenderer.invoke("notification:check"),
        onClick: (callback: (data: { sessionId?: string | null }) => void) => {
            const cb = (_: Electron.IpcRendererEvent, data: any) => callback(data);
            electron.ipcRenderer.on("notification:click", cb);
            return () => electron.ipcRenderer.off("notification:click", cb);
        }
    },

    // Update APIs
    update: {
        check: () =>
            electron.ipcRenderer.invoke("update:check"),
        download: () =>
            electron.ipcRenderer.invoke("update:download"),
        install: (silent?: boolean) =>
            electron.ipcRenderer.invoke("update:install", silent),
        getStatus: () =>
            electron.ipcRenderer.invoke("update:getStatus"),
        onStatus: (callback: (data: any) => void) => {
            const cb = (_: Electron.IpcRendererEvent, data: any) => callback(data);
            electron.ipcRenderer.on("update:status", cb);
            return () => electron.ipcRenderer.off("update:status", cb);
        },
        onProgress: (callback: (data: any) => void) => {
            const cb = (_: Electron.IpcRendererEvent, data: any) => callback(data);
            electron.ipcRenderer.on("update:progress", cb);
            return () => electron.ipcRenderer.off("update:progress", cb);
        },
        onAvailable: (callback: (info: { version: string; releaseNotes?: string | null; releaseDate?: string }) => void) => {
            const cb = (_: Electron.IpcRendererEvent, info: any) => callback(info);
            electron.ipcRenderer.on("update:available-optional", cb);
            return () => electron.ipcRenderer.off("update:available-optional", cb);
        },
        onDownloaded: (callback: (info: { version: string; releaseDate?: string; isInApplications: boolean }) => void) => {
            const cb = (_: Electron.IpcRendererEvent, info: any) => callback(info);
            electron.ipcRenderer.on("update:downloaded", cb);
            return () => electron.ipcRenderer.off("update:downloaded", cb);
        }
    },

    // Window APIs
    window: {
        onFullscreen: (callback: (isFullscreen: boolean) => void) => {
            const cb = (_: Electron.IpcRendererEvent, value: boolean) => callback(value);
            electron.ipcRenderer.on("window:fullscreen", cb);
            return () => electron.ipcRenderer.off("window:fullscreen", cb);
        },
        isFullscreen: () => electron.ipcRenderer.invoke("window:isFullscreen"),
        setTitleBarOverlayTheme: (theme: "light" | "dark") =>
            electron.ipcRenderer.invoke("window:setTitleBarOverlayTheme", theme),
    },

    // App APIs
    app: {
        bootstrap: () =>
            electron.ipcRenderer.invoke("app:bootstrap"),
        setLanguage: (language: string) =>
            electron.ipcRenderer.invoke("app:setLanguage", language),
        getFeatureFlags: () =>
            electron.ipcRenderer.invoke("app:getFeatureFlags"),
        setFeatureFlag: (
            path: "desktop.enableCodexRunner" | "desktop.enableProviderSwitch",
            value: boolean
        ) => electron.ipcRenderer.invoke("app:setFeatureFlag", path, value),
        resetFeatureFlags: () =>
            electron.ipcRenderer.invoke("app:resetFeatureFlags"),
        getVersion: () =>
            electron.ipcRenderer.invoke("app:getVersion"),
        getPlatform: () => process.platform,
        getArch: () => process.arch,
        /**
         * 设置 macOS Dock 徐标数字（未读消息计数）。
         * 传入 0 清除徐标。仅在 macOS / Linux 下生效。
         */
        setBadgeCount: (count: number) =>
            electron.ipcRenderer.invoke("app:setBadgeCount", count),
    },

    // Memory APIs
    memory: {
        get: () =>
            electron.ipcRenderer.invoke("memory:get"),
        set: (content: string) =>
            electron.ipcRenderer.invoke("memory:set", content)
    },

    // Skill APIs
    skill: {
        getAll: () =>
            electron.ipcRenderer.invoke("skill:getAll"),
        refresh: () =>
            electron.ipcRenderer.invoke("skill:refresh"),
        get: (id: string) =>
            electron.ipcRenderer.invoke("skill:get", id),
        create: (input: any) =>
            electron.ipcRenderer.invoke("skill:create", input),
        update: (id: string, input: any) =>
            electron.ipcRenderer.invoke("skill:update", id, input),
        delete: (id: string) =>
            electron.ipcRenderer.invoke("skill:delete", id),
        toggle: (id: string) =>
            electron.ipcRenderer.invoke("skill:toggle", id),
        validate: (content: string) =>
            electron.ipcRenderer.invoke("skill:validate", content),
        search: (options: any) =>
            electron.ipcRenderer.invoke("skill:search", options),
        getByCategory: (category: string) =>
            electron.ipcRenderer.invoke("skill:getByCategory", category),
        getStats: () =>
            electron.ipcRenderer.invoke("skill:getStats"),
        export: (id: string) =>
            electron.ipcRenderer.invoke("skill:export", id),
        import: (content: string, options?: any) =>
            electron.ipcRenderer.invoke("skill:import", content, options),
        getEnabled: () =>
            electron.ipcRenderer.invoke("skill:getEnabled"),
        getContext: (options?: any) =>
            electron.ipcRenderer.invoke("skill:getContext", options),
        getPrompt: (skillId: string, variables?: Record<string, string>) =>
            electron.ipcRenderer.invoke("skill:getPrompt", skillId, variables),
    },

    // Error reporting
    reportError: (entry: any) =>
        electron.ipcRenderer.invoke("renderer-error-log", entry),

    // Data APIs
    data: {
        exportSimple: () =>
            electron.ipcRenderer.invoke("data:exportSimple"),
        importSimple: (data: unknown, options?: any) =>
            electron.ipcRenderer.invoke("data:importSimple", data, options),
        export: (options?: any) =>
            electron.ipcRenderer.invoke("data:export", options),
        import: (filePath: string, options?: any) =>
            electron.ipcRenderer.invoke("data:import", filePath, options),
        validate: (filePath: string) =>
            electron.ipcRenderer.invoke("data:validate", filePath)
    },

    // Sync APIs
    sync: {
        push: () =>
            electron.ipcRenderer.invoke("sync:push"),
        pull: () =>
            electron.ipcRenderer.invoke("sync:pull"),
        sync: (options?: { accessToken?: string }) =>
            electron.ipcRenderer.invoke("sync:sync", options),
        getStatus: () =>
            electron.ipcRenderer.invoke("sync:getStatus"),
        enable: () =>
            electron.ipcRenderer.invoke("sync:enable"),
        disable: () =>
            electron.ipcRenderer.invoke("sync:disable"),
        setAccessToken: (token: string | null) =>
            electron.ipcRenderer.invoke("sync:setAccessToken", token),
        getConflicts: () =>
            electron.ipcRenderer.invoke("sync:getConflicts"),
        resolveConflict: (conflictId: string, resolution: "keep_local" | "keep_remote" | "manual_merge") =>
            electron.ipcRenderer.invoke("sync:resolveConflict", conflictId, resolution),
        getConfig: () =>
            electron.ipcRenderer.invoke("sync:getConfig"),
        updateConfig: (updates: any) =>
            electron.ipcRenderer.invoke("sync:updateConfig", updates),
        getPendingChanges: () =>
            electron.ipcRenderer.invoke("sync:getPendingChanges"),
        getLastSyncTime: () =>
            electron.ipcRenderer.invoke("sync:getLastSyncTime"),
    },

    // Debug / Diagnostics APIs（仅开发模式可见，生产隐藏）
    debug: {
        getSessionDiagnostics: (sessionId: string) =>
            electron.ipcRenderer.invoke("debug:getSessionDiagnostics", sessionId),
        exportDiagnostics: (sessionId: string) =>
            electron.ipcRenderer.invoke("debug:exportDiagnostics", sessionId),
    }
};

electron.contextBridge.exposeInMainWorld("electron", electronAPI);
electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);

function ipcInvoke<Key extends keyof EventPayloadMapping>(key: Key, ...args: any[]): Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}
