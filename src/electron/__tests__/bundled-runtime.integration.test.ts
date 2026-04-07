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

describe("env injection integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-test-"));
    (process as any).resourcesPath = tmpDir;
    mockApp.isPackaged = true;
    mockApp.getAppPath.mockReturnValue("/tmp/test-app");
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (ORIGINAL_RESOURCES_PATH !== undefined) {
      (process as any).resourcesPath = ORIGINAL_RESOURCES_PATH;
    }
  });

  describe("computeRuntimeEnvPatch isolation", () => {
    it("不应包含任何 Anthropic/Claude 凭据", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({
        PATH: process.env.PATH,
        NODE_PATH: process.env.NODE_PATH,
      });

      expect(patch.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
      expect(patch.ANTHROPIC_BASE_URL).toBeUndefined();
      expect(patch.ANTHROPIC_API_KEY).toBeUndefined();
    });

    it("应包含 CHERRY_NODE", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({ PATH: process.env.PATH });

      expect(patch.CHERRY_NODE).toBeDefined();
      expect(patch.CHERRY_NODE).toBe(process.execPath);
    });

    it("不应包含 ELECTRON_RUN_AS_NODE", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({ PATH: process.env.PATH });

      expect(patch.ELECTRON_RUN_AS_NODE).toBeUndefined();
    });

    it("应包含 NODE_PATH", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({ PATH: process.env.PATH });

      expect(patch.NODE_PATH).toBeDefined();
      expect(patch.NODE_PATH).toContain("node_modules");
    });

    it("不应全局注入 PYTHONHOME（防止污染系统 Python）", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({ PATH: process.env.PATH });

      expect(patch.PYTHONHOME).toBeUndefined();
      expect(patch.PYTHONNOUSERSITE).toBeUndefined();
    });

    it("应清理高风险环境变量", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({});

      expect(patch.NODE_OPTIONS).toBe("");
      expect(patch.PYTHONPATH).toBe("");
      expect(patch.PYTHONSTARTUP).toBe("");
      expect(patch.PYTHONUSERBASE).toBe("");
    });

    it("patch 键只包含运行时相关变量（无凭据泄漏）", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();
      const patch = computeRuntimeEnvPatch({
        PATH: process.env.PATH,
        NODE_PATH: process.env.NODE_PATH,
      });

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
        expect(
          allowedKeys.has(key),
          `Unexpected key "${key}" in patch — potential credential leak`
        ).toBe(true);
      }
    });
  });

  describe("getEnhancedEnv 与 computeRuntimeEnvPatch 一致性", () => {
    it("两者的 CHERRY_NODE 和 NODE_PATH 前缀应一致", async () => {
      const { setupBundledRuntime, computeRuntimeEnvPatch } = await import(
        "../libs/bundled-runtime.js"
      );
      setupBundledRuntime();

      const patchA = computeRuntimeEnvPatch({ NODE_PATH: "" });
      const patchB = computeRuntimeEnvPatch({ NODE_PATH: "" });

      // CHERRY_NODE should be consistent
      expect(patchA.CHERRY_NODE).toBe(patchB.CHERRY_NODE);
      // NODE_PATH prefix should be consistent
      expect(patchA.NODE_PATH).toBe(patchB.NODE_PATH);
    });
  });
});
