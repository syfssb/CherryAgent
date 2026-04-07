import { EventEmitter } from "events";
import { join } from "path";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnOptions } from "@anthropic-ai/claude-agent-sdk";

const { spawnMock, existsSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  existsSyncMock: vi.fn(),
}));

vi.mock("child_process", () => ({
  default: {
    spawn: spawnMock,
  },
  spawn: spawnMock,
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: existsSyncMock,
    },
    existsSync: existsSyncMock,
  };
});

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    killed: boolean;
    exitCode: number | null;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };

  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.exitCode = null;
  child.pid = 4321;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });

  return child;
}

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_RESOURCES_PATH = (process as typeof process & { resourcesPath?: string }).resourcesPath;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

describe("createClaudeProcessSpawner", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setPlatform("win32");
    process.env = { ...ORIGINAL_ENV, PATH: "" };
    (process as typeof process & { resourcesPath?: string }).resourcesPath = "C:\\Cherry\\resources";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    if (ORIGINAL_RESOURCES_PATH === undefined) {
      delete (process as typeof process & { resourcesPath?: string }).resourcesPath;
    } else {
      (process as typeof process & { resourcesPath?: string }).resourcesPath = ORIGINAL_RESOURCES_PATH;
    }
    setPlatform(ORIGINAL_PLATFORM);
  });

  it("无 shell 时不应继续 spawn，并且只上报一次 earlyExit", async () => {
    existsSyncMock.mockReturnValue(false);

    const onEarlyExit = vi.fn();
    const { createClaudeProcessSpawner } = await import("../libs/claude-process-spawner.js");
    const spawner = createClaudeProcessSpawner({ onEarlyExit });

    const spawnOptions: SpawnOptions = {
      command: "node",
      args: ["cli.js"],
      cwd: "C:\\workspace",
      env: { PATH: "" },
    };

    const proc = spawner(spawnOptions);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(spawnMock).not.toHaveBeenCalled();
    expect(onEarlyExit).toHaveBeenCalledTimes(1);
    expect(proc.exitCode).toBe(1);
  });

  it("已有 SHELL 时仍应注入 CLAUDE_CODE_GIT_BASH_PATH，且 earlyExit 只触发一次", async () => {
    const bundledDir = join("C:\\Cherry\\resources", "vendor", "win32");
    const bashExe = join(bundledDir, "bash.exe");
    const cygpathExe = join(bundledDir, "cygpath.exe");
    const msysDll = join(bundledDir, "msys-2.0.dll");

    existsSyncMock.mockImplementation((target: string) => {
      return target === bashExe || target === cygpathExe || target === msysDll;
    });

    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const onEarlyExit = vi.fn();
    const { createClaudeProcessSpawner } = await import("../libs/claude-process-spawner.js");
    const spawner = createClaudeProcessSpawner({ onEarlyExit });

    const spawnOptions: SpawnOptions = {
      command: "node",
      args: ["cli.js", "--print"],
      cwd: "C:\\workspace",
      env: {
        PATH: "C:\\Windows\\System32",
        SHELL: "C:\\custom\\shell.exe",
      },
    };

    spawner(spawnOptions);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const spawnedOptions = spawnMock.mock.calls[0][2];
    expect(spawnedOptions.env.SHELL).toBe("C:\\custom\\shell.exe");
    expect(spawnedOptions.env.CLAUDE_CODE_GIT_BASH_PATH).toBe(bashExe);
    expect(spawnedOptions.env.PATH.startsWith(`${bundledDir};`)).toBe(true);

    child.emit("error", new Error("spawn failed"));
    child.emit("exit", 1, null);

    expect(onEarlyExit).toHaveBeenCalledTimes(1);
    expect(onEarlyExit).toHaveBeenCalledWith(null, null, "spawn failed");
  });
});
