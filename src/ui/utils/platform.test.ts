import { afterEach, describe, expect, it } from "vitest";
import { formatShortcut, getPlatform, isMac, isWindows } from "./platform";

const originalElectron = window.electron;
const navigatorPlatformDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "platform");

function mockNavigatorPlatform(platform: string) {
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: platform,
  });
}

describe("platform utils", () => {
  afterEach(() => {
    window.electron = originalElectron;

    if (navigatorPlatformDescriptor) {
      Object.defineProperty(window.navigator, "platform", navigatorPlatformDescriptor);
    }
  });

  it("优先使用 Electron 暴露的平台信息", () => {
    mockNavigatorPlatform("Win32");
    window.electron = {
      ...window.electron,
      app: {
        ...window.electron?.app,
        getPlatform: () => "darwin",
      },
    } as typeof window.electron;

    expect(getPlatform()).toBe("darwin");
    expect(isMac()).toBe(true);
    expect(isWindows()).toBe(false);
  });

  it("Electron 不可用时回退到 navigator.platform", () => {
    window.electron = undefined as unknown as typeof window.electron;
    mockNavigatorPlatform("Win32");

    expect(getPlatform()).toBe("win32");
    expect(isWindows()).toBe(true);
    expect(isMac()).toBe(false);
  });

  it("能按平台格式化 Mod 快捷键", () => {
    window.electron = undefined as unknown as typeof window.electron;
    mockNavigatorPlatform("MacIntel");

    expect(formatShortcut(["Mod", "V"])).toBe("Cmd+V");
    expect(formatShortcut(["Mod", "V"], { useSymbol: true, separator: " + " })).toBe("⌘ + V");
  });
});
