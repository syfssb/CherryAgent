/**
 * 平台检测工具
 *
 * 提供统一的平台检测能力，避免各模块重复实现。
 */

export type DesktopPlatform = "darwin" | "win32" | "linux" | "unknown";

function normalizePlatform(platform?: string | null): DesktopPlatform | null {
  if (!platform) return null;

  const normalized = platform.toLowerCase();
  if (normalized === "darwin" || normalized.includes("mac")) return "darwin";
  if (normalized === "win32" || normalized.includes("win")) return "win32";
  if (normalized === "linux" || normalized.includes("linux") || normalized.includes("x11")) return "linux";

  return null;
}

/**
 * 获取当前平台。
 * 优先使用 Electron 暴露的真实 process.platform，
 * 其次再回退到浏览器的 navigator 信息。
 */
export function getPlatform(): DesktopPlatform {
  const electronPlatform =
    typeof window !== "undefined" ? window.electron?.app?.getPlatform?.() : undefined;
  const normalizedElectronPlatform = normalizePlatform(electronPlatform);
  if (normalizedElectronPlatform) {
    return normalizedElectronPlatform;
  }

  if (typeof navigator === "undefined") return "unknown";

  return (
    normalizePlatform(navigator.userAgentData?.platform) ??
    normalizePlatform(navigator.platform) ??
    normalizePlatform(navigator.userAgent) ??
    "unknown"
  );
}

/**
 * 检测当前平台是否为 macOS
 */
export function isMac(): boolean {
  return getPlatform() === "darwin";
}

/**
 * 检测当前平台是否为 Windows
 */
export function isWindows(): boolean {
  return getPlatform() === "win32";
}

/**
 * 获取当前平台的修饰键名称
 * macOS 返回 "Cmd" / "⌘"，其他平台返回 "Ctrl"
 */
export function getModKey(options?: { symbol?: boolean }): string {
  if (isMac()) {
    return options?.symbol ? "⌘" : "Cmd";
  }
  return "Ctrl";
}

/**
 * 使用 "Mod" 作为占位符，自动格式化跨平台快捷键展示。
 */
export function formatShortcut(
  keys: readonly string[],
  options?: { useSymbol?: boolean; separator?: string }
): string {
  const separator = options?.separator ?? "+";

  return keys
    .map((key) => (key === "Mod" ? getModKey({ symbol: options?.useSymbol }) : key))
    .join(separator);
}
