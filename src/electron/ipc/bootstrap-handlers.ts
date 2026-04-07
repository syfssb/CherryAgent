import { app, ipcMain } from "electron";
import { getFeatureFlags, setFeatureFlag, resetFeatureFlags } from "../libs/feature-flags.js";
import { isAuthenticated, getUserInfo } from "../libs/auth-service.js";
import { resolveDefaultCwd } from "../libs/recent-workspaces.js";
import { setDesktopLanguage } from "../libs/desktop-i18n.js";
import { initializeSessions } from "./core.js";

/**
 * 注册应用启动 bootstrap handler
 * 一次 IPC 调用返回启动所需的全部数据，减少前端启动时的 IPC 往返
 */
export function registerBootstrapHandler(): void {
  try { ipcMain.removeHandler("app:bootstrap"); } catch { /* ignore */ }
  try { ipcMain.removeHandler("app:getFeatureFlags"); } catch { /* ignore */ }
  try { ipcMain.removeHandler("app:setFeatureFlag"); } catch { /* ignore */ }
  try { ipcMain.removeHandler("app:resetFeatureFlags"); } catch { /* ignore */ }
  try { ipcMain.removeHandler("app:setLanguage"); } catch { /* ignore */ }

  ipcMain.handle("app:bootstrap", async () => {
    try {
      const sessionStore = initializeSessions();

      const [authResult, balanceResult, userResult, defaultCwdResult] = await Promise.allSettled([
        Promise.resolve(isAuthenticated()),
        import("../libs/billing-handler.js").then((m) => m.getBalance()),
        Promise.resolve(getUserInfo()),
        resolveDefaultCwd(),
      ]);

      const isAuth = authResult.status === "fulfilled" ? authResult.value : false;

      let balance: { balance: number; currency: string } | undefined;
      if (balanceResult.status === "fulfilled" && balanceResult.value?.success && balanceResult.value.data) {
        balance = {
          balance: parseFloat(balanceResult.value.data.balance),
          currency: balanceResult.value.data.currency ?? "CNY",
        };
      }

      const user = userResult.status === "fulfilled" ? userResult.value : null;
      const defaultCwd = defaultCwdResult.status === "fulfilled"
        ? defaultCwdResult.value
        : app.getPath("home");

      const sessionsList = sessionStore.listSessions({ includeArchived: true });
      const featureFlags = getFeatureFlags();
      const systemLocale = app.getLocale();
      setDesktopLanguage(systemLocale);

      return {
        isAuthenticated: isAuth,
        sessions: sessionsList,
        balance,
        user,
        featureFlags,
        systemLocale,
        defaultCwd,
      };
    } catch (error) {
      console.error("[ipc-handlers] app:bootstrap failed:", error);
      return {
        isAuthenticated: false,
        sessions: [],
        balance: undefined,
        user: null,
        featureFlags: getFeatureFlags(),
        systemLocale: app.getLocale(),
        defaultCwd: app.getPath("home"),
      };
    }
  });

  ipcMain.handle("app:getFeatureFlags", () => {
    try {
      return { success: true, data: getFeatureFlags() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get feature flags",
      };
    }
  });

  ipcMain.handle(
    "app:setFeatureFlag",
    (_event, path: "desktop.enableCodexRunner" | "desktop.enableProviderSwitch", value: boolean) => {
      try {
        const flags = setFeatureFlag(path, value);
        return { success: true, data: flags };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to set feature flag",
        };
      }
    },
  );

  ipcMain.handle("app:resetFeatureFlags", () => {
    try {
      const flags = resetFeatureFlags();
      return { success: true, data: flags };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to reset feature flags",
      };
    }
  });

  ipcMain.handle("app:setLanguage", (_event, language: string) => {
    try {
      const normalized = setDesktopLanguage(language);
      return { success: true, data: { language: normalized } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to set app language",
      };
    }
  });

  console.info("[ipc-handlers] Bootstrap handler registered");
}
