import { BrowserWindow, ipcMain, Notification } from "electron";
import { tDesktop } from "../libs/desktop-i18n.js";

export function registerNotificationHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const notificationChannels = ["notification:check", "notification:show"];
  for (const ch of notificationChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  ipcMain.handle("notification:check", async () => {
    try {
      return { supported: Notification.isSupported() };
    } catch (error) {
      console.error("[ipc-handlers] notification:check failed:", error);
      return { supported: false, error: tDesktop("notification.checkFailed") };
    }
  });

  ipcMain.handle(
    "notification:show",
    async (_: any, payload: { title: string; body?: string; silent?: boolean; sessionId?: string }) => {
      try {
        if (!Notification.isSupported()) {
          return { success: false, error: tDesktop("notification.notSupported") };
        }
        const notification = new Notification({
          title: payload.title,
          body: payload.body ?? "",
          silent: Boolean(payload.silent)
        });
        notification.on("click", () => {
          const windows = BrowserWindow.getAllWindows();
          const target = windows[0];
          if (target) {
            target.show();
            target.focus();
            target.webContents.send("notification:click", {
              sessionId: payload.sessionId ?? null
            });
          }
        });
        notification.show();
        return { success: true };
      } catch (error) {
        console.error("[ipc-handlers] notification:show failed:", error);
        return {
          success: false,
          error: tDesktop("notification.showFailed")
        };
      }
    }
  );

  console.info("[ipc-handlers] Notification handlers registered");
}
