import { spawn } from "child_process";
import { EventEmitter } from "events";
import { existsSync } from "fs";
import { join, delimiter } from "path";
import os from "os";
import { PassThrough } from "stream";
import type { SpawnOptions, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk";

const JS_RUNTIMES = new Set(["node", "bun", "deno"]);

/** MSYS2/Cygwin fork 失败的 stderr 特征模式（ASLR 冲突、DLL 地址占用等） */
const FORK_FAILURE_PATTERNS = [
  /child_info_fork::abort/i,
  /cygheap base mismatch/i,
  /fork.*died/i,                   // 覆盖 "died waiting for longjmp" 和 "died unexpectedly"
  /forked process.*died/i,
  /fork.*Resource temporarily unavailable/i,
  /could not fork child process/i,
  /exit code 0xC0000142/,  // STATUS_DLL_INIT_FAILED
  /exit code 0xC0000135/,  // STATUS_DLL_NOT_FOUND
];

function isMsys2ForkFailure(stderr: string): boolean {
  return FORK_FAILURE_PATTERNS.some(pat => pat.test(stderr));
}

/**
 * 返回应用内捆绑的 MSYS2 bash.exe 所在目录（仅 Windows 打包后有效）。
 * 包含真正的 GNU Bash（从 MSYS2 提取）及其全部运行时 DLL。
 */
function getBundledBashDir(): string | null {
  if (process.platform !== "win32") return null;
  // process.resourcesPath 仅在 Electron 主进程中可用，打包后指向 <app>/resources
  if (!process.resourcesPath) return null;
  const dir = join(process.resourcesPath, "vendor", "win32");
  if (existsSync(join(dir, "bash.exe"))) return dir;
  return null;
}

/**
 * Windows 上定位 bash.exe / sh.exe 所在目录。
 *
 * 搜索顺序：
 * 1. 应用内捆绑的 MSYS2 bash（优先，零用户依赖）
 * 2. Git for Windows 标准安装路径（Program Files）
 * 3. 当前进程 PATH 里每个目录（覆盖 Chocolatey / Scoop / winget 等自定义安装）
 *
 * 返回值：去重后的目录列表（包含 bash.exe 的目录），空数组表示未找到。
 */
function findWindowsShellPaths(): string[] {
  const results: string[] = [];

  // 1. 捆绑的 MSYS2 bash（最高优先级，确保不依赖用户环境）
  const bundledDir = getBundledBashDir();
  if (bundledDir) results.push(bundledDir);

  // 常见 Git for Windows 安装路径（兜底，优先级最低）
  const gitCandidates = [
    "C:\\Program Files\\Git\\bin",
    "C:\\Program Files\\Git\\usr\\bin",
    "C:\\Program Files (x86)\\Git\\bin",
    "C:\\Program Files (x86)\\Git\\usr\\bin",
  ];

  // 2. 动态扫描 PATH（覆盖 Chocolatey/Scoop/winget 等非标准安装位置）
  //    使用 path.delimiter 而非硬编码 ";"，保证跨平台正确性
  const pathDirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    if (!results.includes(dir) && (existsSync(join(dir, "bash.exe")) || existsSync(join(dir, "sh.exe")))) {
      results.push(dir);
    }
  }

  // 3. 标准 Git for Windows 路径（已在 PATH 中的跳过，避免重复）
  for (const p of gitCandidates) {
    if (!results.includes(p) && existsSync(p)) results.push(p);
  }

  return results;
}

function createFailedSpawnedProcess(code: number): SpawnedProcess {
  const emitter = new EventEmitter();
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let killed = false;
  let exitCode: number | null = null;

  const finalize = () => {
    if (exitCode !== null) return;
    exitCode = code;
    stdin.end();
    stdout.end();
    emitter.emit("exit", code, null);
    emitter.emit("close", code, null);
  };

  queueMicrotask(finalize);

  return {
    stdin,
    stdout,
    get killed() {
      return killed;
    },
    get exitCode() {
      return exitCode;
    },
    kill: (() => {
      killed = true;
      finalize();
      return true;
    }) as SpawnedProcess["kill"],
    on: emitter.on.bind(emitter) as SpawnedProcess["on"],
    once: emitter.once.bind(emitter) as SpawnedProcess["once"],
    off: emitter.off.bind(emitter) as SpawnedProcess["off"],
  };
}

/**
 * 创建一个符合 SDK `spawnClaudeCodeProcess` 签名的进程启动器。
 *
 * 背景：SDK patch 将 ProcessTransport 内部的 spawn 改成了 fork，
 * 导致 Windows 上 Claude 子进程卡死。本模块通过 SDK 提供的
 * `spawnClaudeCodeProcess` 扩展点，用原生 spawn 绕过 patched 代码。
 *
 * 关键行为：
 * - JS CLI（node/bun/deno）：用 Electron 自身二进制 + ELECTRON_RUN_AS_NODE=1
 *   替代系统 node，打包后桌面端不要求用户预装 node
 * - 原生二进制：直接透传 command + args
 * - Windows：优先使用应用捆绑的 MSYS2 真实 GNU Bash + cygpath/MSYS2 DLL，
 *   fallback 到系统 Git for Windows；用户无需额外安装任何工具
 *   - bash.exe (MSYS2 GNU Bash 5.3)：完整支持 [[ ]]、数组、extglob、进程替换等
 *     Claude AI 常生成的 bash 语法，替代了之前的 busybox ash（仅支持 POSIX sh）
 *   - cygpath.exe + msys-2.0.dll：供 Claude CLI Bash 工具执行路径转换（by 函数），
 *     在每次 Bash tool 调用时将 Win32 tmpdir 路径转为 POSIX 格式
 *   - msys-readline8.dll + msys-ncursesw6.dll：bash.exe 的运行时依赖（DLL 必须在同目录）
 *   - busybox64u.exe 仅作为 coreutils（ls/cat/grep 等），不再用作 bash shell
 * - stdio 固定 3 路（stdin/stdout/stderr），不建立 IPC 通道
 * - windowsHide: true 防止 Windows 弹控制台窗口
 */
export function createClaudeProcessSpawner(options?: {
  smallFastModelId?: string;
  onStderr?: (data: string) => void;
  onEarlyExit?: (code: number | null, signal: string | null, stderrSnippet: string) => void;
  onPidAvailable?: (pid: number) => void;
}): (spawnOptions: SpawnOptions) => SpawnedProcess {
  return (spawnOptions: SpawnOptions): SpawnedProcess => {
    const { command, args, cwd, env, signal } = spawnOptions;

    // 判断 CLI 类型：JS 运行时 vs 原生二进制
    const isJsRuntime = JS_RUNTIMES.has(command);

    let spawnCmd: string;
    let spawnArgs: string[];
    const spawnEnv = { ...env };
    // 注入 SDK 辅助模型：优先使用后台配置，未配置则不设置（让 SDK 使用默认值）
    if (options?.smallFastModelId) {
      spawnEnv.ANTHROPIC_SMALL_FAST_MODEL = options.smallFastModelId;
    }
    let earlyExitTriggered = false;
    const triggerEarlyExit = (code: number | null, exitSignal: string | null, stderrSnippet: string) => {
      if (earlyExitTriggered) return;
      earlyExitTriggered = true;
      options?.onEarlyExit?.(code, exitSignal, stderrSnippet);
    };

    if (isJsRuntime) {
      // JS CLI：用 Electron 自身的二进制 + ELECTRON_RUN_AS_NODE=1 替代系统 node
      // 这样安装版桌面端不需要用户机器预装 node
      spawnCmd = process.execPath;
      spawnArgs = args; // args 已经是 [cli.js, ...cliArgs]
      spawnEnv.ELECTRON_RUN_AS_NODE = "1";
    } else {
      // 原生二进制：直接透传
      spawnCmd = command;
      spawnArgs = args;
    }

    // Windows：注入 bash/sh 路径到 PATH，优先使用捆绑的 MSYS2 bash + cygpath
    // Claude CLI 内部：
    //   1. Hs8() 检测 shell（读 SHELL 环境变量 + 验证可执行）— 需要 bash.exe
    //   2. by() 路径转换（`cygpath -u <path>`）— 在每次 Bash 工具调用时执行
    // MSYS2 bash.exe 通过 Hs8 检测；cygpath.exe + msys DLL 保证 Bash 工具正常运行
    if (process.platform === "win32") {
      const shellPaths = findWindowsShellPaths();
      if (shellPaths.length > 0) {
        const currentPath = spawnEnv.PATH || spawnEnv.Path || "";
        spawnEnv.PATH = [...shellPaths, currentPath].join(";");

        // 强制 TMPDIR/TEMP/TMP 指向系统临时目录
        // Claude CLI 在每次 Bash 工具调用时创建 tmpclaude-XXXX-cwd 临时文件，
        // 若 TMPDIR 未设置或解析到 cwd，文件会堆积在用户的项目文件夹里。
        const sysTmp = process.env.TEMP || process.env.TMP || os.tmpdir();
        spawnEnv.TMPDIR = sysTmp;
        spawnEnv.TEMP  = sysTmp;
        spawnEnv.TMP   = sysTmp;

        let resolvedShellDir: string | null = null;
        let resolvedBashExe: string | null = null;
        let resolvedShellExe: string | null = null;
        for (const dir of shellPaths) {
          const bashExe = join(dir, "bash.exe");
          const shExe = join(dir, "sh.exe");
          if (existsSync(bashExe)) {
            resolvedShellDir = dir;
            resolvedBashExe = bashExe;
            resolvedShellExe = bashExe;
            break;
          }
          if (existsSync(shExe)) {
            resolvedShellDir = dir;
            resolvedShellExe = shExe;
            break;
          }
        }

        if (!spawnEnv.SHELL && resolvedShellExe) {
          spawnEnv.SHELL = resolvedShellExe;
        }
        if (!spawnEnv.CLAUDE_CODE_GIT_BASH_PATH && resolvedBashExe) {
          spawnEnv.CLAUDE_CODE_GIT_BASH_PATH = resolvedBashExe;
        }

        // P0-2: UTF-8 编码注入 — 防止中文用户名路径下 MSYS2 bash 乱码
        if (!spawnEnv.LANG) {
          spawnEnv.LANG = "C.UTF-8";
        }

        // P0-3: 确保 MSYS2 bash 能继承 Windows PATH（含捆绑目录和系统工具），
        // 使 cygpath.exe、git.exe 等在 bash 子进程内可调用
        if (!spawnEnv.MSYS2_PATH_TYPE) {
          spawnEnv.MSYS2_PATH_TYPE = "inherit";
        }

        const shellDir = resolvedShellDir ?? shellPaths[0];
        const isBundled = shellDir === getBundledBashDir();
        const hasCygpath = existsSync(join(shellDir, "cygpath.exe"));
        const hasMsysDll = existsSync(join(shellDir, "msys-2.0.dll"));

        // 完整性检查：bash.exe 的全部运行时 DLL 必须齐全，缺一个都会启动失败
        const requiredDlls = [
          "msys-2.0.dll", "msys-readline8.dll", "msys-ncursesw6.dll",
          "msys-intl-8.dll", "msys-iconv-2.dll", "msys-gcc_s-seh-1.dll",
        ];
        const missingDlls = requiredDlls.filter(dll => !existsSync(join(shellDir, dll)));

        console.info(
          `[claude-spawn] Windows shell: SHELL=${spawnEnv.SHELL} (${isBundled ? "bundled MSYS2 bash" : "system Git Bash"})` +
          ` | cygpath=${hasCygpath} | msys-2.0.dll=${hasMsysDll}` +
          (missingDlls.length > 0 ? ` | MISSING DLLs: ${missingDlls.join(", ")}` : " | all DLLs present") +
          ` | LANG=${spawnEnv.LANG}`
        );
        if (!hasCygpath) {
          console.warn("[claude-spawn] cygpath.exe not found — Claude Bash tool may fail. Rebuild the app to download cygpath.");
        }
        if (missingDlls.length > 0 && isBundled) {
          console.warn(`[claude-spawn] Missing runtime DLLs for bash.exe: ${missingDlls.join(", ")}. Bash may fail to start.`);
        }
      } else {
        // 连捆绑的 MSYS2 bash 也没找到（打包异常），立即告知用户
        console.error("[claude-spawn] No bash/sh found (bundled MSYS2 bash missing). Claude CLI will fail.");
        queueMicrotask(() => {
          triggerEarlyExit(
            1,
            null,
            "bash not found — please reinstall the application or install Git for Windows: https://git-scm.com/download/win"
          );
        });
        return createFailedSpawnedProcess(1);
      }
    }

    console.info(
      `[claude-spawn] Starting: cmd=${isJsRuntime ? "electron-as-node" : spawnCmd}, ` +
        `pid=pending, cwd=${cwd || "inherit"}, ` +
        `args=${spawnArgs.slice(0, 3).join(" ")}${spawnArgs.length > 3 ? "..." : ""}`
    );

    const child = spawn(spawnCmd, spawnArgs, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: spawnEnv as NodeJS.ProcessEnv,
      signal,
      windowsHide: true,
    });

    console.info(`[claude-spawn] Spawned PID=${child.pid}`);
    if (child.pid && options?.onPidAvailable) {
      options.onPidAvailable(child.pid);
    }

    // stderr 管道：转发到调用方回调，同时收集用于早退检测
    let stderrBuffer = '';
    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;
        if (stderrBuffer.length > 4000) stderrBuffer = stderrBuffer.slice(-4000);
        if (options?.onStderr) {
          options.onStderr(text);
        }
        // P0-1: 检测 MSYS2/Cygwin fork 失败（ASLR 冲突等），给出友好提示
        if (process.platform === "win32" && isMsys2ForkFailure(text)) {
          console.error("[claude-spawn] MSYS2 fork failure detected in stderr:", text.slice(0, 300));
          triggerEarlyExit(
            null, null,
            "MSYS2 bash fork 失败（可能是系统 ASLR 安全策略冲突）。" +
            "请尝试安装 Git for Windows 并重启应用：https://git-scm.com/download/win"
          );
        }
      });
    }

    // 诊断：进程退出和错误
    // 子进程在 Windows 上被杀毒软件阻断时会立即以非零 code 退出，
    // 此时 for-await 循环静默结束导致空白页。通过 onEarlyExit 传回错误让 UI 展示提示。
    const EARLY_EXIT_MS = 5000; // 5s 内退出视为早退（正常会话不会这么快结束）
    const spawnTime = Date.now();
    child.on("error", (err) => {
      console.error(`[claude-spawn] PID=${child.pid} spawn error:`, err.message);
      triggerEarlyExit(null, null, err.message);
    });
    child.on("exit", (code, sig) => {
      const elapsed = Date.now() - spawnTime;
      console.info(
        `[claude-spawn] PID=${child.pid} exited code=${code} signal=${sig} elapsed=${elapsed}ms`
      );
      if (elapsed < EARLY_EXIT_MS && (code !== 0 || sig)) {
        const snippet = stderrBuffer.slice(-500) || `exit code ${code}, signal ${sig}`;
        console.error(`[claude-spawn] Early exit detected (${elapsed}ms). stderr: ${snippet}`);
        triggerEarlyExit(code, sig, snippet);
      }
    });

    // 显式映射为 SpawnedProcess 接口，确保类型安全
    const mapped: SpawnedProcess = {
      stdin: child.stdin!,
      stdout: child.stdout!,
      get killed() {
        return child.killed;
      },
      get exitCode() {
        return child.exitCode;
      },
      kill: child.kill.bind(child),
      on: child.on.bind(child) as SpawnedProcess["on"],
      once: child.once.bind(child) as SpawnedProcess["once"],
      off: child.off.bind(child) as SpawnedProcess["off"],
    };

    return mapped;
  };
}
