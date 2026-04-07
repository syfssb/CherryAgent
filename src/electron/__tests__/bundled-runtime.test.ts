import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// mock electron app
const mockApp = {
  isPackaged: true,
  getAppPath: vi.fn(() => "/tmp/test-app"),
};

vi.mock("electron", () => ({
  app: mockApp,
}));

// mock process.resourcesPath (Electron sets this in packaged mode)
const ORIGINAL_RESOURCES_PATH = (process as any).resourcesPath;

describe("bundled-runtime", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundled-runtime-test-"));
    (process as any).resourcesPath = tmpDir;
    mockApp.isPackaged = true;
    mockApp.getAppPath.mockReturnValue("/tmp/test-app");
    // Reset modules to clear cached state between tests
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (ORIGINAL_RESOURCES_PATH !== undefined) {
      (process as any).resourcesPath = ORIGINAL_RESOURCES_PATH;
    }
  });

  describe("setupBundledRuntime", () => {
    it("应缓存 process.execPath 作为 Node 路径", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});
      expect(patch.CHERRY_NODE).toBe(process.execPath);
    });

    it("内置 Python 存在时应缓存其绝对路径（macOS）", async () => {
      // Simulate macOS Python layout
      const pythonBin = path.join(tmpDir, "python", "bin", "python3");
      fs.mkdirSync(path.dirname(pythonBin), { recursive: true });
      fs.writeFileSync(pythonBin, "#!/bin/sh\n");

      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});

      if (process.platform !== "win32") {
        expect(patch.CHERRY_PYTHON).toBe(pythonBin);
        expect(path.isAbsolute(patch.CHERRY_PYTHON)).toBe(true);
      }
    });

    it("内置 Python 目录存在但无二进制时不应设置 CHERRY_PYTHON", async () => {
      // Create empty python dir (placeholder from electron-builder)
      fs.mkdirSync(path.join(tmpDir, "python"), { recursive: true });

      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});
      expect(patch.CHERRY_PYTHON).toBeUndefined();
    });

    it("setup 失败不应抛异常", async () => {
      // Force an error by setting resourcesPath to invalid
      (process as any).resourcesPath = undefined;

      const { setupBundledRuntime } = await import(
        "../libs/bundled-runtime.js"
      );
      // Should not throw
      expect(() => setupBundledRuntime()).not.toThrow();
    });

    it("开发模式下不应设置 CHERRY_PYTHON", async () => {
      mockApp.isPackaged = false;
      // Even if python exists
      const pythonBin = path.join(tmpDir, "python", "bin", "python3");
      fs.mkdirSync(path.dirname(pythonBin), { recursive: true });
      fs.writeFileSync(pythonBin, "#!/bin/sh\n");

      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});
      expect(patch.CHERRY_PYTHON).toBeUndefined();
    });
  });

  describe("computeRuntimeEnvPatch", () => {
    it("应设置 CHERRY_NODE 为 process.execPath", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});
      expect(patch.CHERRY_NODE).toBe(process.execPath);
    });

    it("不应全局注入 ELECTRON_RUN_AS_NODE", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});
      expect(patch.ELECTRON_RUN_AS_NODE).toBeUndefined();
    });

    it("不应全局注入 PYTHONHOME 或 PYTHONNOUSERSITE", async () => {
      const pythonBin = path.join(tmpDir, "python", "bin", "python3");
      fs.mkdirSync(path.dirname(pythonBin), { recursive: true });
      fs.writeFileSync(pythonBin, "#!/bin/sh\n");

      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});
      expect(patch.PYTHONHOME).toBeUndefined();
      expect(patch.PYTHONNOUSERSITE).toBeUndefined();
    });

    it("有内置 Python 时应设置 CHERRY_PYTHONHOME", async () => {
      if (process.platform === "win32") return; // Skip on Windows CI

      const pythonBin = path.join(tmpDir, "python", "bin", "python3");
      fs.mkdirSync(path.dirname(pythonBin), { recursive: true });
      fs.writeFileSync(pythonBin, "#!/bin/sh\n");

      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});
      expect(patch.CHERRY_PYTHONHOME).toBe(path.join(tmpDir, "python"));
    });

    it("无内置 Python 时不应设置 CHERRY_PYTHONHOME", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});
      expect(patch.CHERRY_PYTHONHOME).toBeUndefined();
    });

    it("PATH 不应被前缀修改（Python bin 仅追加到末尾）", async () => {
      if (process.platform === "win32") return;

      const pythonBin = path.join(tmpDir, "python", "bin", "python3");
      fs.mkdirSync(path.dirname(pythonBin), { recursive: true });
      fs.writeFileSync(pythonBin, "#!/bin/sh\n");

      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();

      const originalPath = "/usr/bin:/usr/local/bin";
      const patch = computeRuntimeEnvPatch({ PATH: originalPath });

      if (patch.PATH) {
        expect(patch.PATH.startsWith(originalPath)).toBe(true);
        // Python bin dir should be at the end
        const parts = patch.PATH.split(path.delimiter);
        expect(parts[0]).toBe("/usr/bin");
        const lastPart = parts[parts.length - 1];
        expect(lastPart).toContain("python");
      }
    });

    it("应正确设置 NODE_PATH（asar + unpack）", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});
      const parts = patch.NODE_PATH.split(path.delimiter);
      expect(parts.some((p: string) => p.includes("app.asar") && p.includes("node_modules"))).toBe(true);
      expect(
        parts.some((p: string) => p.includes("app.asar.unpacked") && p.includes("node_modules"))
      ).toBe(true);
    });

    it("应保留调用方已有的 NODE_PATH", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({ NODE_PATH: "/custom/modules" });
      expect(patch.NODE_PATH).toContain("/custom/modules");
    });

    it("开发模式应使用 getAppPath 的 node_modules", async () => {
      mockApp.isPackaged = false;
      mockApp.getAppPath.mockReturnValue("/dev/project");

      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});
      expect(patch.NODE_PATH).toContain(
        path.join("/dev/project", "node_modules")
      );
    });

    it("应使用 path.delimiter 做跨平台兼容", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({
        PATH: "/a",
        NODE_PATH: "/b",
      });
      // NODE_PATH should use the platform delimiter
      if (patch.NODE_PATH.includes("/a") || patch.NODE_PATH.includes("/b")) {
        expect(patch.NODE_PATH).toContain(path.delimiter);
      }
    });

    it("应清理高风险继承变量", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});

      // These should be set to empty string to override inherited values
      expect(patch.NODE_OPTIONS).toBe("");
      expect(patch.PYTHONPATH).toBe("");
      expect(patch.PYTHONSTARTUP).toBe("");
      expect(patch.PYTHONUSERBASE).toBe("");
    });

    it("patch 的键应只包含允许的运行时变量", async () => {
      if (process.platform === "win32") return;

      const pythonBin = path.join(tmpDir, "python", "bin", "python3");
      fs.mkdirSync(path.dirname(pythonBin), { recursive: true });
      fs.writeFileSync(pythonBin, "#!/bin/sh\n");

      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({ PATH: "/usr/bin" });

      const allowedKeys = new Set([
        "CHERRY_NODE",
        "CHERRY_PYTHON",
        "CHERRY_PYTHONHOME",
        "PATH",
        "NODE_PATH",
        "NODE_OPTIONS",
        "PYTHONPATH",
        "PYTHONSTARTUP",
        "PYTHONUSERBASE",
      ]);
      for (const key of Object.keys(patch)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    });

    it("缓存应生效：多次调用返回一致的静态值", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch1 = computeRuntimeEnvPatch({ PATH: "/usr/bin" });
      const patch2 = computeRuntimeEnvPatch({ PATH: "/usr/bin" });
      expect(patch1.CHERRY_NODE).toBe(patch2.CHERRY_NODE);
      expect(patch1.NODE_PATH).toBe(patch2.NODE_PATH);
    });
  });
});
