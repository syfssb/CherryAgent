import { describe, it, expect, vi } from "vitest";
import { resolveEffectiveCwd } from "../libs/cwd-resolver.js";

describe("resolveEffectiveCwd", () => {
  it("session cwd 可用时优先使用 session cwd", async () => {
    const validateDirectory = vi.fn(async (targetPath: string) => targetPath === "/valid/session");

    const resolved = await resolveEffectiveCwd({
      sessionCwd: "/valid/session",
      fallbackCwd: "/valid/fallback",
      processCwd: "/valid/process",
      validateDirectory,
    });

    expect(resolved).toEqual({
      cwd: "/valid/session",
      source: "session",
    });
    expect(validateDirectory).toHaveBeenCalledTimes(1);
    expect(validateDirectory).toHaveBeenCalledWith("/valid/session");
  });

  it("session cwd 无效时回退到 fallback cwd", async () => {
    const validateDirectory = vi.fn(async (targetPath: string) => targetPath === "/valid/fallback");

    const resolved = await resolveEffectiveCwd({
      sessionCwd: "/invalid/session",
      fallbackCwd: "/valid/fallback",
      processCwd: "/valid/process",
      validateDirectory,
    });

    expect(resolved).toEqual({
      cwd: "/valid/fallback",
      source: "fallback",
      reason: "session-invalid",
    });
    expect(validateDirectory).toHaveBeenNthCalledWith(1, "/invalid/session");
    expect(validateDirectory).toHaveBeenNthCalledWith(2, "/valid/fallback");
  });

  it("session cwd 为空时回退到 fallback cwd", async () => {
    const validateDirectory = vi.fn(async (targetPath: string) => targetPath === "/valid/fallback");

    const resolved = await resolveEffectiveCwd({
      sessionCwd: "   ",
      fallbackCwd: "/valid/fallback",
      processCwd: "/valid/process",
      validateDirectory,
    });

    expect(resolved).toEqual({
      cwd: "/valid/fallback",
      source: "fallback",
      reason: "session-empty",
    });
    expect(validateDirectory).toHaveBeenCalledTimes(1);
    expect(validateDirectory).toHaveBeenCalledWith("/valid/fallback");
  });

  it("session/fallback 都无效时回退到 process cwd", async () => {
    const validateDirectory = vi.fn(async () => false);

    const resolved = await resolveEffectiveCwd({
      sessionCwd: "/invalid/session",
      fallbackCwd: "/invalid/fallback",
      processCwd: "/valid/process",
      validateDirectory,
    });

    expect(resolved).toEqual({
      cwd: "/valid/process",
      source: "process",
      reason: "fallback-invalid",
    });
    expect(validateDirectory).toHaveBeenCalledTimes(2);
  });
});
