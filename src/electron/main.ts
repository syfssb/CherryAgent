import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, shell, session, powerMonitor, nativeTheme } from "electron"
import { appendFileSync, writeFileSync, existsSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";
import { applyRuntimeEnvDefaults } from "./libs/runtime-config.js";

function loadEnvIfExists(path: string): void {
    if (existsSync(path)) {
        dotenv.config({ path });
    }
}

// 加载 .env 文件，确保 Electron 主进程能读取到环境变量
// 优先级：.env.local > .env
const appRoot = app.getAppPath();
const envCandidates = [
    join(appRoot, ".env.local"),
    join(appRoot, ".env"),
    join(process.resourcesPath, ".env.local"),
    join(process.resourcesPath, ".env"),
    join(process.cwd(), ".env.local"),
    join(process.cwd(), ".env"),
];
const loadedEnvPaths = new Set<string>();
for (const envPath of envCandidates) {
    if (loadedEnvPaths.has(envPath)) continue;
    loadEnvIfExists(envPath);
    loadedEnvPaths.add(envPath);
}
applyRuntimeEnvDefaults();
import { ipcMainHandle, isDev, DEV_HOST, DEV_PORT, validateEventFrame } from "./util.js";
import { getPreloadPath, getUIPath, getIconPath } from "./pathResolver.js";
import { getStaticData, pollResources, stopPolling } from "./test.js";
import { handleClientEvent, sessions, cleanupAllSessions, registerAuthHandlers, registerTagHandlers, registerSessionOperationHandlers, registerWorkspaceHandlers, registerMemoryHandlers, registerSkillHandlers, handleAuthDeepLink, registerDataHandlers, registerSyncHandlers, registerBillingHandlers, registerNotificationHandlers, setupProxyHandlers, registerTaskManagerHandlers, cleanupTaskManager, initializeSessions, registerBootstrapHandler, skillStore, registerDebugHandlers } from "./ipc-handlers.js";
import { installPresetSkills, syncUserCreatedSkillsToDb, syncRemotePresetSkills } from "./libs/preset-skills-installer.js";
import { setupBundledRuntime } from "./libs/bundled-runtime.js";
import { setupGitShim } from "./libs/git-shim.js";
import { ContentPoller } from "./libs/content-poller.js";
import { generateSessionTitle } from "./libs/util.js";
import { DEEP_LINK_PROTOCOL } from "./libs/auth-handler.js";
import { registerUpdateHandlers } from "./libs/auto-updater.js";
import type { ClientEvent } from "./types.js";
import { appendLogWithRotation } from "./libs/log-utils.js";
import "./libs/claude-settings.js";

// ─── 全局异常兜底：主进程未捕获错误写入 error.log ───────────────────────────
function writeMainErrorLog(label: string, err: unknown): void {
  const logDir = app.isReady()
    ? app.getPath("userData")
    : (process.env.ELECTRON_USER_DATA_DIR ?? require("os").tmpdir());
  const logPath = join(logDir, "error.log");
  const line = `[${new Date().toISOString()}] [${label}] ${String(err)}\n${(err as any)?.stack ?? ""}\n\n`;
  appendLogWithRotation(logPath, line);
}

process.on("uncaughtException", (err) => {
  writeMainErrorLog("uncaughtException", err);
  console.error("[main] uncaughtException:", err);
  // 同时写入 crash.log（合并原 whenReady 内 handler 的职责）
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  writeCrashLog("uncaughtException", message, stack);
});

process.on("unhandledRejection", (reason) => {
  writeMainErrorLog("unhandledRejection", reason);
  console.error("[main] unhandledRejection:", reason);
  // 同时写入 crash.log
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  writeCrashLog("unhandledRejection", message, stack);
});
// ─────────────────────────────────────────────────────────────────────────────

let cleanupComplete = false;
let mainWindow: BrowserWindow | null = null;
let contentPoller: ContentPoller | null = null;
const debugLogPath = join(app.getPath("userData"), "dev-debug.log");
const crashLogPath = join(app.getPath("userData"), "crash.log");
const gpuFallbackFlagPath = join(app.getPath("userData"), "gpu-fallback.json");
const GPU_FALLBACK_STABLE_RUNS = 3;
const GPU_FALLBACK_OK_DELAY_MS = 30_000;
const WINDOWS_TITLE_BAR_HEIGHT = 36;
// Update base URL: set DESKTOP_UPDATE_BASE_URL in .env for self-hosted distribution
// Leave unset to disable auto-update in open-source builds
const DEFAULT_UPDATE_BASE_URL = "";
let gpuCrashDetected = false;
let isRelaunchingAfterGpuCrash = false;

function resolveWindowsTitleBarOverlay(theme: "light" | "dark") {
    return {
        color: theme === "dark" ? "#141413" : "#FAF9F5",
        symbolColor: theme === "dark" ? "#FAF9F5" : "#141413",
        height: WINDOWS_TITLE_BAR_HEIGHT,
    };
}

function applyMainWindowTitleBarOverlay(theme: "light" | "dark") {
    if (process.platform !== "win32") {
        return { success: false, reason: "unsupported_platform" };
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, reason: "window_unavailable" };
    }

    try {
        mainWindow.setTitleBarOverlay(resolveWindowsTitleBarOverlay(theme));
        return { success: true };
    } catch (error) {
        console.warn("[window] failed to update titleBarOverlay:", error);
        return { success: false, reason: "apply_failed" };
    }
}

function normalizeBaseURL(url: string | undefined): string | undefined {
    if (!url) return undefined;
    const trimmed = url.trim();
    if (!trimmed) return undefined;
    return trimmed.replace(/\/+$/, "");
}

function getUpdateBaseURL(): string {
    return normalizeBaseURL(process.env.DESKTOP_UPDATE_BASE_URL)
        ?? DEFAULT_UPDATE_BASE_URL;
}

function resolveUpdateFeedURL(): string {
    const explicitFeedURL = normalizeBaseURL(process.env.DESKTOP_UPDATE_FEED_URL);
    if (explicitFeedURL) return explicitFeedURL;

    const baseURL = getUpdateBaseURL();
    if (process.platform === "darwin" && process.arch === "arm64") {
        return `${baseURL}/update-feed/mac-arm64`;
    }
    if (process.platform === "darwin" && process.arch === "x64") {
        return `${baseURL}/update-feed/mac-x64`;
    }
    return baseURL;
}

function resolveUpdateApiURL(): string | undefined {
    // 更新策略 API 是可选能力；默认仅走静态 feed，避免对纯静态站点产生 404 干扰
    return normalizeBaseURL(process.env.DESKTOP_UPDATE_API_URL);
}

function inferProviderFromModelId(modelId?: string): "claude" | "codex" | null {
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

function resolveProviderForContinue(
    event: Extract<ClientEvent, { type: "session.continue" }>,
    sessionProvider?: "claude" | "codex",
): "claude" | "codex" {
    const inferredProvider = inferProviderFromModelId(event.payload.modelId);
    const payloadProvider =
        event.payload.provider === "claude" || event.payload.provider === "codex"
            ? event.payload.provider
            : undefined;
    return inferredProvider ?? payloadProvider ?? sessionProvider ?? "claude";
}

/**
 * 构建应用程序菜单（macOS 菜单栏 + Windows/Linux 菜单栏）
 * 提供标准 Edit（复制/粘贴/撤销）、View（开发工具/缩放/全屏）、Window 菜单。
 * macOS 上会额外显示 App 菜单（关于/退出等 role）。
 */
function buildAppMenu(): Menu {
    const isMac = process.platform === "darwin";

    const template: Electron.MenuItemConstructorOptions[] = [
        // macOS 专属：App 菜单（系统约定第一项显示应用名）
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: "about" as const },
                { type: "separator" as const },
                { role: "services" as const },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
                { role: "quit" as const }
            ]
        }] : []),
        // Edit 菜单：撤销、剪切、复制、粘贴（macOS 输入法和辅助功能依赖此菜单）
        {
            label: "Edit",
            submenu: [
                { role: "undo" as const },
                { role: "redo" as const },
                { type: "separator" as const },
                { role: "cut" as const },
                { role: "copy" as const },
                { role: "paste" as const },
                { role: "selectAll" as const }
            ]
        },
        // View 菜单：开发工具、缩放、全屏
        {
            label: "View",
            submenu: [
                { role: "reload" as const, accelerator: "CmdOrCtrl+R" },
                { role: "toggleDevTools" as const, accelerator: "F12" },
                { type: "separator" as const },
                { role: "resetZoom" as const },
                { role: "zoomIn" as const },
                { role: "zoomOut" as const },
                { type: "separator" as const },
                { role: "togglefullscreen" as const }
            ]
        },
        // Window 菜单：最小化、缩放、关闭
        {
            label: "Window",
            submenu: [
                { role: "minimize" as const },
                { role: "zoom" as const },
                ...(isMac ? [
                    { type: "separator" as const },
                    { role: "front" as const }
                ] : [
                    { role: "close" as const }
                ])
            ]
        }
    ];

    return Menu.buildFromTemplate(template);
}

function focusMainWindow(): void {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    mainWindow.focus();
}

function readGpuFallback(): { enabled: boolean; updatedAt: number; okRuns: number } | null {
    try {
        if (!existsSync(gpuFallbackFlagPath)) return null;
        const raw = JSON.parse(String(Buffer.from(readFileSync(gpuFallbackFlagPath))));
        if (typeof raw !== "object" || raw === null) return null;
        return {
            enabled: Boolean(raw.enabled),
            updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
            okRuns: typeof raw.okRuns === "number" ? raw.okRuns : 0
        };
    } catch {
        return null;
    }
}

function hasGpuFallbackFlag(): boolean {
    return Boolean(readGpuFallback()?.enabled);
}

function writeGpuFallback(data: { enabled: boolean; updatedAt: number; okRuns: number }): void {
    try {
        writeFileSync(
            gpuFallbackFlagPath,
            JSON.stringify(data, null, 2)
        );
    } catch {
        // ignore write failures
    }
}

function setGpuFallbackFlag(): void {
    writeGpuFallback({ enabled: true, updatedAt: Date.now(), okRuns: 0 });
}

function bumpGpuFallbackOkRun(): void {
    const current = readGpuFallback();
    if (!current?.enabled) return;
    const nextOkRuns = current.okRuns + 1;
    if (nextOkRuns >= GPU_FALLBACK_STABLE_RUNS) {
        clearGpuFallbackFlag();
        return;
    }
    writeGpuFallback({ enabled: true, updatedAt: Date.now(), okRuns: nextOkRuns });
}

function clearGpuFallbackFlag(): void {
    try {
        if (existsSync(gpuFallbackFlagPath)) unlinkSync(gpuFallbackFlagPath);
    } catch {
        // ignore delete failures
    }
}

function writeDebug(message: string): void {
    if (!isDev()) return;
    try {
        appendFileSync(debugLogPath, `${new Date().toISOString()} ${message}\n`);
    } catch {
        // ignore logging failures
    }
}

/**
 * 写入崩溃日志（生产和开发环境均记录）
 * 日志文件位于 userData 目录下的 crash.log
 */
function writeCrashLog(source: string, message: string, stack?: string): void {
    const timestamp = new Date().toISOString();
    const entry = [
        `[${timestamp}] [${source}]`,
        `  Message: ${message}`,
        stack ? `  Stack: ${stack}` : null,
        "",
    ].filter(Boolean).join("\n");
    appendLogWithRotation(crashLogPath, entry + "\n");
}

if (process.env.ELECTRON_FORCE_SWIFTSHADER === "1") {
    // Force software rendering to avoid GPU process crashes.
    app.commandLine.appendSwitch("use-gl", "angle");
    app.commandLine.appendSwitch("use-angle", "swiftshader");
    app.commandLine.appendSwitch("disable-gpu-sandbox");
    app.commandLine.appendSwitch("enable-unsafe-swiftshader");
    app.commandLine.appendSwitch("ignore-gpu-blocklist");
}

if (process.env.ELECTRON_FORCE_METAL === "1") {
    app.commandLine.appendSwitch("use-gl", "angle");
    app.commandLine.appendSwitch("use-angle", "metal");
    app.commandLine.appendSwitch("ignore-gpu-blocklist");
}

if (
    process.env.ELECTRON_DISABLE_GPU === "1" ||
    process.env.DISABLE_GPU === "1" ||
    hasGpuFallbackFlag()
) {
    // Disable GPU entirely and let Chromium fall back to software rendering.
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-gpu-sandbox");
}

// 设置为默认协议客户端（Deep Link）
// 注意：在 macOS 上，需要在 Info.plist 中配置；在 Windows 上需要注册表
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [process.argv[1]]);
    }
} else {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
}

// 确保单实例（处理深度链接时需要）
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    // 当第二个实例尝试启动时，聚焦第一个实例的窗口
    app.on("second-instance", (_event, commandLine) => {
        focusMainWindow();

        // 处理 Windows 上的深度链接（通过命令行参数传递）
        const deepLinkUrl = commandLine.find((arg) => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`));
        if (deepLinkUrl) {
            handleAuthDeepLink(deepLinkUrl);
        }
    });
}

function killViteDevServer(): void {
    if (!isDev()) return;
    try {
        if (process.platform === 'win32') {
            execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${DEV_PORT}') do taskkill /PID %a /F`, { stdio: 'ignore', shell: 'cmd.exe' });
        } else {
            execSync(`lsof -ti:${DEV_PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
        }
    } catch {
        // Process may already be dead
    }
}

function cleanup(): void {
    if (cleanupComplete) return;
    cleanupComplete = true;

    cleanupTaskManager();
    if (contentPoller) contentPoller.stop();
    globalShortcut.unregisterAll();
    stopPolling();
    cleanupAllSessions();
    killViteDevServer();
}

function handleSignal(): void {
    cleanup();
    app.quit();
}

// 注入 Windows 系统证书库，解决 360 等安全软件 SSL MITM 拦截问题
// 必须在第一条 HTTPS 请求之前执行
if (process.platform === "win32") {
    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - win-ca 无类型声明
        const mod = await import("win-ca");
        const ca = (mod as any).default ?? mod;
        if (typeof ca?.inject === "function") {
            ca.inject("+"); // '+' 追加到 Node.js 内置 CA，不替换
        }
    } catch (e) {
        console.warn("[main] win-ca inject failed:", e);
    }
}

// Initialize everything when app is ready
app.on("ready", () => {
    if (isDev()) {
        console.log("[debug] ELECTRON_FORCE_SWIFTSHADER:", process.env.ELECTRON_FORCE_SWIFTSHADER);
        console.log("[debug] ELECTRON_FORCE_METAL:", process.env.ELECTRON_FORCE_METAL);
        console.log("[debug] use-gl:", app.commandLine.getSwitchValue("use-gl"));
        console.log("[debug] use-angle:", app.commandLine.getSwitchValue("use-angle"));
        console.log("[debug] gpu fallback flag:", hasGpuFallbackFlag());
    }
    Menu.setApplicationMenu(buildAppMenu());

    // Dock badge / taskbar badge handler
    try { ipcMain.removeHandler("app:setBadgeCount"); } catch { /* ignore */ }
    ipcMain.handle("app:setBadgeCount", (_: Electron.IpcMainInvokeEvent, count: number) => {
        // macOS: native Dock badge；Linux: unity launcher counter
        if (process.platform === "darwin" || process.platform === "linux") {
            try {
                app.setBadgeCount(Math.max(0, Math.floor(count)));
                return { success: true };
            } catch (err) {
                console.warn("[main] setBadgeCount failed:", err);
                return { success: false };
            }
        }
        return { success: false, reason: "unsupported_platform" };
    });

    try { ipcMain.removeHandler("window:setTitleBarOverlayTheme"); } catch { /* ignore */ }
    ipcMain.handle("window:setTitleBarOverlayTheme", (_: Electron.IpcMainInvokeEvent, theme: "light" | "dark") => {
        if (theme !== "light" && theme !== "dark") {
            return { success: false, reason: "invalid_theme" };
        }
        return applyMainWindowTitleBarOverlay(theme);
    });

    // === Layer 1: Critical path — IPC handlers needed before window loads ===
    registerAuthHandlers();
    registerSessionOperationHandlers();
    registerWorkspaceHandlers();
    setupProxyHandlers();
    registerBootstrapHandler();

    // === Layer 2: Deferred — register after window creation (non-blocking) ===
    queueMicrotask(() => {
        registerTagHandlers();
        registerMemoryHandlers();
        registerSkillHandlers();
        registerDataHandlers();
        registerSyncHandlers();
        registerBillingHandlers();
        registerNotificationHandlers();
        registerTaskManagerHandlers();
        registerDebugHandlers();
        const updateFeedURL = resolveUpdateFeedURL();
        const updateApiURL = resolveUpdateApiURL();
        if (isDev()) {
            console.info("[AutoUpdater] feedURL:", updateFeedURL);
            console.info("[AutoUpdater] serverApiURL:", updateApiURL ?? "(disabled)");
        }
        registerUpdateHandlers({
            feedURL: updateFeedURL,
            serverApiURL: updateApiURL,
            channel: "stable",
        });
    });

    // === Layer 3: Background — file I/O split across ticks to avoid blocking ===
    // 初始化 git shim（macOS：抑制 Xcode CLT 安装弹窗）
    // 必须在 setupBundledRuntime() 之前调用，因为后者的 computeRuntimeEnvPatch() 依赖 shim 路径
    try {
      setupGitShim();
    } catch (err) {
      console.warn("[git-shim] Setup failed (non-fatal):", err);
    }
    // 初始化内置运行时路径缓存（Node.js / Python）
    try {
      setupBundledRuntime();
    } catch (err) {
      console.error("[bundled-runtime] Setup failed, built-in runtimes may be unavailable:", err);
    }
    setImmediate(() => {
        installPresetSkills(skillStore);
        setImmediate(() => {
            syncUserCreatedSkillsToDb(skillStore);
        });
    });
    // Network tasks are already async, safe to fire immediately
    syncRemotePresetSkills().catch((err) => {
        console.warn("[preset-skills] Remote sync failed:", err);
    });
    // ensureAgentBrowser() 已改为延迟到首次使用时调用（在 agent-browser-installer.ts 内部缓存）

    // 延迟 10 秒后启动内容轮询，避免影响启动性能
    contentPoller = new ContentPoller();
    setTimeout(() => contentPoller!.start(), 10_000);

    // Setup event handlers
    app.on("before-quit", cleanup);
    app.on("will-quit", cleanup);
    app.on("window-all-closed", () => {
        cleanup();
        app.quit();
    });

    process.on("SIGTERM", handleSignal);
    process.on("SIGINT", handleSignal);
    // SIGHUP 仅 Unix 有效，Windows 上不存在此信号
    if (process.platform !== "win32") {
        process.on("SIGHUP", handleSignal);
    }

    // Windows 关机/注销/重启时 before-quit 不触发，
    // 需要通过 powerMonitor.shutdown 事件做清理（Electron 官方推荐）
    if (process.platform === "win32") {
        powerMonitor.on("shutdown", () => {
            console.info("[main] Windows shutdown/logoff detected, cleaning up...");
            cleanup();
        });
    }

    // 渲染进程崩溃恢复（app 级别，覆盖所有窗口）
    app.on("render-process-gone", (_event, webContents, details) => {
        console.error("[main] Render process gone:", details.reason, "exitCode:", details.exitCode);
        writeCrashLog(
            "render-process-gone",
            `reason=${details.reason} exitCode=${details.exitCode}`
        );

        // 如果不是正常退出，尝试重新加载窗口
        if (details.reason !== "clean-exit") {
            const affectedWindow = BrowserWindow.fromWebContents(webContents);
            if (affectedWindow && !affectedWindow.isDestroyed()) {
                // 延迟重新加载，给系统一些恢复时间
                setTimeout(() => {
                    try {
                        if (!affectedWindow.isDestroyed()) {
                            affectedWindow.webContents.reload();
                        }
                    } catch (reloadError) {
                        console.error("[main] Failed to reload after render-process-gone:", reloadError);
                        writeCrashLog("render-process-gone-reload-failed", String(reloadError));
                    }
                }, 1000);
            }
        }
    });

    app.on("child-process-gone", (_event, details) => {
        if (details.type !== "GPU") return;
        console.error("[gpu] process gone:", details.reason, details.exitCode);
        gpuCrashDetected = true;
        setGpuFallbackFlag();

        // Attempt immediate recovery by reloading all windows.
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                try {
                    win.webContents.reload();
                } catch {
                    // ignore reload failures
                }
            }
        }

        // Relaunch with GPU disabled to stabilize.
        if (!isRelaunchingAfterGpuCrash) {
            isRelaunchingAfterGpuCrash = true;
            setTimeout(() => {
                try {
                    app.relaunch();
                    app.exit(0);
                } catch {
                    // ignore relaunch failures
                }
            }, 500);
        }
    });

    // If we started with GPU fallback and survive for a while without another GPU crash,
    // count it as a stable run and eventually clear the fallback flag.
    if (hasGpuFallbackFlag()) {
        setTimeout(() => {
            if (!gpuCrashDetected) {
                bumpGpuFallbackOkRun();
            }
        }, GPU_FALLBACK_OK_DELAY_MS);
    }

    // Create main window (hidden until ready to avoid white flash)
    const isMac = process.platform === "darwin";
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        show: false,
        webPreferences: {
            preload: getPreloadPath(),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            allowRunningInsecureContent: false,
            webSecurity: true,
        },
        icon: getIconPath(),
        // macOS: hiddenInset 获得内缩间距 + trafficLightPosition
        // Windows/Linux: hidden + titleBarOverlay 显示原生窗口控件（最小化/最大化/关闭）
        titleBarStyle: isMac ? "hiddenInset" : "hidden",
        backgroundColor: "#FAF9F6",
        ...(isMac
            ? { trafficLightPosition: { x: 15, y: 18 } }
            : {
                titleBarOverlay: resolveWindowsTitleBarOverlay(
                    nativeTheme.shouldUseDarkColors ? "dark" : "light"
                ),
            }),
    });

    // Show window only after content is painted (eliminates white flash)
    // 兜底：某些情况下 ready-to-show 不触发，强制展示窗口避免“启动后无窗口”
    const forceShowTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            console.warn("[window] ready-to-show timeout, force showing window");
            mainWindow.show();
            mainWindow.focus();
        }
    }, 8000);

    mainWindow.once("ready-to-show", () => {
        clearTimeout(forceShowTimer);
        mainWindow?.show();
        // 后台预热数据库，避免首次 IPC 调用时的卡顿
        setTimeout(() => { initializeSessions(); }, 0);
    });

    mainWindow.once("closed", () => {
        clearTimeout(forceShowTimer);
        cleanupAllSessions();
    });

    // 全屏状态变化时通知渲染进程
    mainWindow.on("enter-full-screen", () => {
        mainWindow?.webContents.send("window:fullscreen", true);
    });
    mainWindow.on("leave-full-screen", () => {
        mainWindow?.webContents.send("window:fullscreen", false);
    });
    ipcMain.handle("window:isFullscreen", () => mainWindow?.isFullScreen() ?? false);

    // 右键上下文菜单：为输入框/文本区域提供剪切、复制、粘贴等原生菜单
    mainWindow.webContents.on("context-menu", (_event, params) => {
        const { editFlags, isEditable, selectionText, linkURL } = params;
        const menuItems: Electron.MenuItemConstructorOptions[] = [];

        if (isEditable) {
            menuItems.push(
                { label: "撤销", role: "undo", enabled: editFlags.canUndo },
                { label: "重做", role: "redo", enabled: editFlags.canRedo },
                { type: "separator" },
                { label: "剪切", role: "cut", enabled: editFlags.canCut },
                { label: "复制", role: "copy", enabled: editFlags.canCopy },
                { label: "粘贴", role: "paste", enabled: editFlags.canPaste },
                { label: "全选", role: "selectAll", enabled: editFlags.canSelectAll },
            );
        } else if (selectionText.trim()) {
            menuItems.push(
                { label: "复制", role: "copy", enabled: editFlags.canCopy },
                { label: "全选", role: "selectAll" },
            );
        }

        if (linkURL) {
            if (menuItems.length > 0) menuItems.push({ type: "separator" });
            menuItems.push({
                label: "在浏览器中打开链接",
                click: () => shell.openExternal(linkURL),
            });
        }

        if (menuItems.length > 0) {
            Menu.buildFromTemplate(menuItems).popup();
        }
    });

    // OAuth popup 窗口管理
    const oauthWindows = new Set<BrowserWindow>();

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // 所有外部链接统一用系统浏览器打开
        // Google 禁止在嵌入式 WebView 中进行 OAuth 登录，必须用系统浏览器
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // 追踪子窗口，监听 OAuth 回调后自动关闭
    // 方案 3：在主进程中直接拦截回调 URL，完全不依赖回调页面的内联脚本
    // 这样彻底绕过了 CSP 问题
    mainWindow.webContents.on("did-create-window", (childWindow) => {
        oauthWindows.add(childWindow);
        console.log("[main] OAuth child window created, tracking it");

        childWindow.on("closed", () => {
            oauthWindows.delete(childWindow);
        });

        // CSP 剥离已移除 — 方案 3（主进程拦截回调 URL）不依赖回调页面脚本

        // Additional trusted OAuth origins can be set via CHERRY_OAUTH_ORIGINS (comma-separated)
        const extraOrigins = process.env.CHERRY_OAUTH_ORIGINS
            ? process.env.CHERRY_OAUTH_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        const TRUSTED_OAUTH_ORIGINS = ['localhost', ...extraOrigins];
        const isOAuthCallback = (url: string): boolean => {
            try {
                const u = new URL(url);
                const trusted = TRUSTED_OAUTH_ORIGINS.some(h =>
                    u.hostname === h || u.hostname.endsWith(`.${h}`)
                );
                return trusted && u.pathname.includes('/auth/') && u.pathname.includes('/callback');
            } catch {
                return false;
            }
        };

        let callbackHandled = false;

        const handleOAuthCallbackUrl = (url: string, source: string) => {
            // 防止重复处理（did-navigate / did-finish-load 可能多次触发）
            if (callbackHandled) return;
            callbackHandled = true;

            console.log(`[main] OAuth callback intercepted (${source}):`, url);

            // 直接关闭子窗口，不需要等待页面加载或执行任何脚本
            // 前端通过轮询 /api/auth/oauth/result 获取结果，不依赖子窗口
            // 延迟 500ms 确保后端已完成 OAuth token 交换并存储结果
            setTimeout(() => {
                if (!childWindow.isDestroyed()) {
                    console.log(`[main] Destroying OAuth popup (${source})`);
                    childWindow.destroy();
                }
            }, 500);
        };

        // will-navigate：记录日志但不关闭窗口
        // 此时后端可能还没收到回调请求，过早关闭会导致 OAuth 结果丢失
        childWindow.webContents.on("will-navigate", (_event, navUrl) => {
            if (isOAuthCallback(navUrl)) {
                console.log("[main] OAuth callback navigation starting (will-navigate):", navUrl);
            }
        });

        // did-navigate：导航完成，后端已收到回调请求并处理完毕，可以安全关闭
        childWindow.webContents.on("did-navigate", (_event, navUrl) => {
            if (isOAuthCallback(navUrl)) {
                handleOAuthCallbackUrl(navUrl, "did-navigate");
            }
        });

        // did-finish-load：页面完全加载后的兜底
        childWindow.webContents.on("did-finish-load", () => {
            const currentUrl = childWindow.webContents.getURL();
            if (isOAuthCallback(currentUrl)) {
                handleOAuthCallbackUrl(currentUrl, "did-finish-load");
            }
        });
    });

    // 关闭所有 OAuth 子窗口（前端登录成功后调用）
    ipcMain.handle("auth:closeOAuthWindows", () => {
        console.log("[main] closeOAuthWindows called, windows:", oauthWindows.size);
        for (const win of oauthWindows) {
            if (!win.isDestroyed()) {
                win.destroy();
            }
        }
        oauthWindows.clear();
        return { success: true };
    });

    // webContents 崩溃处理（使用 render-process-gone 替代已废弃的 crashed 事件）
    mainWindow.webContents.on("render-process-gone", (_event: any, details: any) => {
        console.error("[main] webContents render-process-gone, reason:", details?.reason);
        writeCrashLog("webContents-render-process-gone", `reason=${details?.reason}`);

        if (details?.reason !== "killed" && mainWindow && !mainWindow.isDestroyed()) {
            setTimeout(() => {
                try {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.reload();
                    }
                } catch (reloadError) {
                    console.error("[main] Failed to reload after webContents crash:", reloadError);
                    writeCrashLog("webContents-crash-reload-failed", String(reloadError));
                }
            }, 1500);
        }
    });

    // 窗口无响应处理（适用于所有环境）
    mainWindow.on("unresponsive", () => {
        console.error("[main] mainWindow unresponsive");
        writeCrashLog("window-unresponsive", "Main window became unresponsive");
    });

    // 窗口恢复响应
    mainWindow.on("responsive", () => {
        console.info("[main] mainWindow responsive again");
    });

    if (isDev()) {
        const toggleDevTools = () => {
            if (!mainWindow) return;
            if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
            } else {
                mainWindow.webContents.openDevTools({ mode: "detach" });
            }
        };

        globalShortcut.register("CommandOrControl+Shift+I", toggleDevTools);
        globalShortcut.register("CommandOrControl+Alt+I", toggleDevTools);

        mainWindow.webContents.once("did-finish-load", () => {
            if (!mainWindow) return;
            console.log("[debug] did-finish-load:", mainWindow.webContents.getURL());
            writeDebug(`did-finish-load ${mainWindow.webContents.getURL()}`);
            mainWindow.webContents.openDevTools({ mode: "detach" });
            mainWindow.webContents.executeJavaScript("typeof window.electron").then((value) => {
                console.log("[debug] window.electron type:", value);
                writeDebug(`window.electron type ${value}`);
            }).catch((error) => {
                console.error("[debug] window.electron check failed:", error);
                writeDebug(`window.electron check failed ${String(error)}`);
            });
            mainWindow.webContents.executeJavaScript(
                "document.getElementById('root')?.innerHTML?.length ?? 0"
            ).then((value) => {
                console.log("[debug] root innerHTML length:", value);
                writeDebug(`root innerHTML length ${String(value)}`);
            }).catch((error) => {
                console.error("[debug] root innerHTML check failed:", error);
                writeDebug(`root innerHTML check failed ${String(error)}`);
            });

            mainWindow.webContents.executeJavaScript(
                "document.body ? document.body.innerText.slice(0, 200) : ''"
            ).then((value) => {
                writeDebug(`body text preview ${String(value)}`);
            }).catch((error) => {
                writeDebug(`body text preview failed ${String(error)}`);
            });

            mainWindow.webContents.executeJavaScript(
                "getComputedStyle(document.body).color + '|' + getComputedStyle(document.body).backgroundColor"
            ).then((value) => {
                writeDebug(`body colors ${String(value)}`);
            }).catch((error) => {
                writeDebug(`body colors failed ${String(error)}`);
            });

            mainWindow.webContents.capturePage().then((image) => {
                const pngPath = "/tmp/cherry-agent-render.png";
                try {
                    writeFileSync(pngPath, image.toPNG());
                    console.log("[debug] captured page to", pngPath);
                    writeDebug(`captured page ${pngPath}`);
                } catch (error) {
                    console.error("[debug] capturePage failed:", error);
                    writeDebug(`capturePage failed ${String(error)}`);
                }
            }).catch((error) => {
                writeDebug(`capturePage failed ${String(error)}`);
            });
        });

        mainWindow.webContents.on("did-start-loading", () => {
            console.log("[debug] did-start-loading:", mainWindow?.webContents.getURL());
            writeDebug(`did-start-loading ${mainWindow?.webContents.getURL() ?? ""}`);
        });

        mainWindow.webContents.on("did-stop-loading", () => {
            console.log("[debug] did-stop-loading:", mainWindow?.webContents.getURL());
            writeDebug(`did-stop-loading ${mainWindow?.webContents.getURL() ?? ""}`);
        });

        mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
            console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
        });

        mainWindow.webContents.on("render-process-gone", (_event, details) => {
            console.error("[renderer] render-process-gone:", details);
        });

        mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
            console.error("[renderer] did-fail-load:", errorCode, errorDescription, validatedURL);
            writeDebug(`did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
            if (isDev() && (errorCode === -102 || errorCode === -6)) {
                // Retry load when dev server isn't ready yet.
                setTimeout(() => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.loadURL(`http://${DEV_HOST}:${DEV_PORT}`);
                    }
                }, 1000);
            }
        });

        mainWindow.on("unresponsive", () => {
            console.error("[window] mainWindow unresponsive");
            writeDebug("mainWindow unresponsive");
        });

        setTimeout(() => {
            if (!mainWindow) return;
            console.log("[debug] load check:", {
                url: mainWindow.webContents.getURL(),
                isLoading: mainWindow.webContents.isLoading()
            });
            writeDebug(`load check url=${mainWindow.webContents.getURL()} loading=${String(mainWindow.webContents.isLoading())}`);
            mainWindow.webContents.executeJavaScript("document.readyState").then((value) => {
                console.log("[debug] document.readyState:", value);
                writeDebug(`document.readyState ${String(value)}`);
            }).catch((error) => {
                console.error("[debug] readyState check failed:", error);
                writeDebug(`readyState check failed ${String(error)}`);
            });
        }, 2000);
    }

    if (isDev()) {
        mainWindow.loadURL(`http://${DEV_HOST}:${DEV_PORT}`);
    } else {
        mainWindow.loadFile(getUIPath());
    }

    globalShortcut.register('CommandOrControl+Q', () => {
        cleanup();
        app.quit();
    });

    // 全局快捷键：Cmd/Ctrl+Shift+Space 唤起/聚焦窗口
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        if (!mainWindow.isVisible()) {
            mainWindow.show();
        }
        mainWindow.focus();
    });

    // 资源统计轮询目前仅在开发调试使用，避免生产环境额外占用内存/CPU。
    if (isDev()) {
        pollResources(mainWindow);
    }

    ipcMainHandle("getStaticData", () => {
        return getStaticData();
    });

    // renderer-error-log handler 已统一在 registerDebugHandlers()（core.ts）中注册，
    // 使用共享的 appendLogWithRotation 写入 error.log。此处不再重复注册。

    // Handle client events
    ipcMain.on("client-event", (ipcEvent: Electron.IpcMainEvent, event: ClientEvent) => {
        if (!ipcEvent.senderFrame) return; // 无 senderFrame，拒绝处理
        try {
            validateEventFrame(ipcEvent.senderFrame);
        } catch {
            return; // 来源验证失败，直接拒绝
        }
        if (isDev()) {
            console.log("[ipc] client-event:", event?.type);
        }
        handleClientEvent(event);
    });

    // 带确认的事件分发，便于渲染进程在失败时保留输入内容并提示错误
    ipcMainHandle("client-event-dispatch", (ipcEvent: Electron.IpcMainInvokeEvent, event: ClientEvent) => {
        try {
            if (!ipcEvent.senderFrame) {
                return { success: false, code: "INVALID_SENDER", error: "无效来源" };
            }
            validateEventFrame(ipcEvent.senderFrame);
            if (isDev()) {
                console.log("[ipc] client-event-dispatch:", event?.type);
            }
            if (event?.type === "session.continue") {
                const existing = sessions.getSession(event.payload.sessionId);
                if (!existing) {
                    return { success: false, code: "SESSION_NOT_FOUND", error: "会话不存在，请刷新后重试。" };
                }
                const sessionProvider = (existing as any).provider as "claude" | "codex" | undefined;
                const provider = resolveProviderForContinue(event, sessionProvider);
                const resumeId = (existing as any).providerThreadId ?? existing.claudeSessionId;
                const shouldRequireResumeId = sessionProvider
                    ? sessionProvider === provider
                    : provider === "claude";
                // 仅在会话正在启动中（running 且无 resumeId）时拦截，
                // 避免 session.start 的 ACK 还未到位时就发出 continue。
                // 已失败的会话（error/idle/completed）不拦截，
                // 允许用户重试——ipc-handlers 会注入历史记录并以新会话继续。
                if (shouldRequireResumeId && !resumeId && existing.status === "running") {
                    console.info(
                        "[ipc] client-event-dispatch blocked:",
                        JSON.stringify({
                            type: event.type,
                            sessionId: event.payload.sessionId,
                            provider,
                            sessionProvider: sessionProvider ?? null,
                            status: existing.status,
                            hasResumeId: false,
                            code: "SESSION_NOT_READY",
                        })
                    );
                    return { success: false, code: "SESSION_NOT_READY", error: "会话尚未准备完成，请稍后重试。" };
                }
            }
            handleClientEvent(event);
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    });

    // Handle session title generation
    ipcMainHandle("generate-session-title", async (_: any, userInput: string | null) => {
        return await generateSessionTitle(userInput);
    });

    // Handle recent cwds request
    ipcMainHandle("get-recent-cwds", (_: any, limit?: number) => {
        const boundedLimit = limit ? Math.min(Math.max(limit, 1), 20) : 8;
        return sessions.listRecentCwds(boundedLimit);
    });

    // Handle directory selection
    ipcMainHandle("select-directory", async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openDirectory']
        });

        if (result.canceled) {
            return null;
        }

        return result.filePaths[0];
    });

    // Handle API config (DEPRECATED - kept for backward compatibility)
    // Local API configuration is no longer required in SaaS model
    // Users should log in to use cloud authentication
    ipcMainHandle("get-api-config", () => {
        console.warn("[main] get-api-config is deprecated. Local API configuration is no longer required.");
        return null;
    });

    ipcMainHandle("check-api-config", () => {
        console.warn("[main] check-api-config is deprecated. Local API configuration is no longer required.");
        // Return hasConfig: false to indicate cloud auth should be used
        return { hasConfig: false, config: null };
    });

    ipcMainHandle("save-api-config", (_: any, _config: any) => {
        console.warn("[main] save-api-config is deprecated. Local API configuration is no longer required.");
        return {
            success: false,
            error: "Local API configuration is deprecated. Please use cloud authentication."
        };
    });
})

// macOS: 处理通过深度链接打开应用
app.on("open-url", (event, url) => {
    event.preventDefault();
    focusMainWindow();
    handleAuthDeepLink(url);
});

// 处理启动时的深度链接参数（Windows/Linux）
const deepLinkArg = process.argv.find((arg) => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`));
if (deepLinkArg) {
    app.whenReady().then(() => {
        focusMainWindow();
        handleAuthDeepLink(deepLinkArg);
    });
}
