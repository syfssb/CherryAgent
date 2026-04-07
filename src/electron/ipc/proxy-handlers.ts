import { ipcMain } from "electron";

// ==========================================
// 代理服务相关处理器
// ==========================================

export async function setupProxyHandlers() {
  const { getUserBalance, getUserInfo, checkProxyHealth } = await import("../libs/proxy-client.js");
  const { setProxyApiKey } = await import("../libs/proxy-client.js");

  // 防御性移除，避免重复注册导致异常
  const proxyChannels = [
    "proxy:getBalance", "proxy:getUserInfo", "proxy:checkHealth", "proxy:setApiKey",
  ];
  for (const ch of proxyChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  // proxy:getBalance - 获取用户余额
  ipcMain.handle("proxy:getBalance", async () => {
    try {
      const balance = await getUserBalance();
      return {
        success: true,
        data: balance
      };
    } catch (error) {
      console.error("[ipc-handlers] proxy:getBalance failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "获取余额失败"
      };
    }
  });

  // proxy:getUserInfo - 获取用户信息
  ipcMain.handle("proxy:getUserInfo", async () => {
    try {
      const userInfo = await getUserInfo();
      return {
        success: true,
        data: userInfo
      };
    } catch (error) {
      console.error("[ipc-handlers] proxy:getUserInfo failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "获取用户信息失败"
      };
    }
  });

  // proxy:checkHealth - 检查代理服务健康状态
  ipcMain.handle("proxy:checkHealth", async () => {
    try {
      const health = await checkProxyHealth();
      return health;
    } catch (error) {
      console.error("[ipc-handlers] proxy:checkHealth failed:", error);
      return {
        available: false,
        error: error instanceof Error ? error.message : "健康检查失败"
      };
    }
  });

  // proxy:setApiKey - 设置云端 API Key
  ipcMain.handle("proxy:setApiKey", async (_, apiKey: string) => {
    try {
      await setProxyApiKey(apiKey);
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] proxy:setApiKey failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "设置 API Key 失败"
      };
    }
  });

  console.info("[ipc-handlers] Proxy handlers registered");
}
