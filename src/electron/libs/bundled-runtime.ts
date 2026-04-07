/**
 * bundled-runtime.ts — 内置运行时环境管理
 *
 * 通过专用环境变量（CHERRY_NODE / CHERRY_PYTHON / CHERRY_PYTHONHOME）
 * 向 Agent 暴露 Electron 内置 Node.js 和可选的内置 Python 绝对路径。
 *
 * 安全架构：
 * - 不注入任意用户可写目录到 PATH（消除 PATH 劫持风险）
 * - 例外：macOS git shim 目录（userData/.git-shim）会前置到 PATH。
 *   该目录在创建后被 chmod 0o555（只读），且仅包含单一 git 脚本，
 *   用于抑制 Xcode CLT 未安装时的系统弹窗。此例外经过刻意设计和评估。
 * - 不全局注入 ELECTRON_RUN_AS_NODE（由 Skill 模板引导局部设置）
 * - 不全局注入 PYTHONHOME/PYTHONNOUSERSITE（避免污染系统 Python）
 * - 仅把应用受控的 Python bin 追加到 PATH 末尾（fallback）
 */

import { app } from "electron";
import * as path from "path";
import * as fs from "fs";
import { getGitShimDir } from "./git-shim.js";

// ---------------------------------------------------------------------------
// 模块级缓存（由 setupBundledRuntime() 填充）
// ---------------------------------------------------------------------------

let cachedNodePath: string | null = null;
let cachedPythonPath: string | null = null;

// computeRuntimeEnvPatch 内部静态部分缓存（不依赖 callerEnv 的字段）
let cachedStaticPatch: Record<string, string> | null = null;
let cachedNodePaths: string[] | null = null;

// ---------------------------------------------------------------------------
// 路径辅助函数
// ---------------------------------------------------------------------------

/**
 * 获取内置 Python 根目录（即 PYTHONHOME）。
 * 打包模式：检查 {resources}/python/ 下实际二进制是否存在。
 * 开发模式：检查 {project}/resources/python/{platform}/python/ 下的平台目录。
 */
function getPythonHome(): string | null {
  let pythonDir: string;

  if (app.isPackaged) {
    pythonDir = path.join(process.resourcesPath, "python");
  } else {
    // 开发模式：从项目目录按当前平台查找
    const platformMap: Record<string, string> = {
      "darwin-arm64": "darwin-arm64",
      "darwin-x64": "darwin-x64",
      "win32-x64": "win32-x64",
    };
    const platformKey = `${process.platform}-${process.arch === "arm64" ? "arm64" : "x64"}`;
    const mapped = platformMap[platformKey];
    if (!mapped) return null;

    pythonDir = path.join(app.getAppPath(), "resources", "python", mapped, "python");
  }

  const pythonBin = process.platform === "win32"
    ? path.join(pythonDir, "python.exe")
    : path.join(pythonDir, "bin", "python3");

  if (!fs.existsSync(pythonBin)) return null;

  return pythonDir;
}

/**
 * 获取内置 Python 的 bin 目录。
 * Windows 上 python.exe 在根目录；macOS/Linux 在 bin/ 子目录。
 */
function getPythonBinDir(): string | null {
  const home = getPythonHome();
  if (!home) return null;

  return process.platform === "win32"
    ? home
    : path.join(home, "bin");
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * app 启动时调用一次，计算并缓存内置运行时的绝对路径。
 * 失败时仅记录告警，不阻断启动。
 */
export function setupBundledRuntime(): void {
  try {
    // Node.js: 直接使用 Electron 二进制路径
    // Agent 使用时需局部设置 ELECTRON_RUN_AS_NODE=1
    cachedNodePath = process.execPath;

    // Python: 检查内置 Python 是否存在
    const pythonHome = getPythonHome();
    if (pythonHome) {
      const candidatePath = process.platform === "win32"
        ? path.join(pythonHome, "python.exe")
        : path.join(pythonHome, "bin", "python3");

      if (fs.existsSync(candidatePath)) {
        cachedPythonPath = candidatePath;
      } else {
        console.warn(`[bundled-runtime] Python binary not found at ${candidatePath}`);
      }
    }

    console.log(`[bundled-runtime] Node: ${cachedNodePath}`);
    console.log(`[bundled-runtime] Python: ${cachedPythonPath ?? "not available"}`);
  } catch (err) {
    console.warn("[bundled-runtime] Setup error (non-fatal):", err);
  }
}

/**
 * 纯函数，计算需注入的环境变量补丁。
 *
 * 返回值直接 spread 到 env 对象上即可：
 *   { ...process.env, ...computeRuntimeEnvPatch({ PATH: process.env.PATH, NODE_PATH: process.env.NODE_PATH }) }
 *
 * 注入的变量：
 * - CHERRY_NODE: Electron 二进制绝对路径（需配合 ELECTRON_RUN_AS_NODE=1）
 * - CHERRY_PYTHON: 内置 Python 绝对路径（仅当打包了 Python 时）
 * - CHERRY_PYTHONHOME: Python 根目录（供 Agent 局部 PYTHONHOME 使用）
 * - PATH: 仅在内置 Python 存在时追加 Python bin 到末尾（fallback）
 * - NODE_PATH: app.asar/node_modules + app.asar.unpacked/node_modules
 *
 * 不注入的变量：
 * - ELECTRON_RUN_AS_NODE — 由 Skill 模板引导局部设置
 * - PYTHONHOME / PYTHONNOUSERSITE — 由 Agent 局部设置，避免污染系统 Python
 *
 * 清理的高风险变量（设为空字符串覆盖继承值）：
 * - NODE_OPTIONS — 可能干扰内置 Node.js 行为
 * - PYTHONPATH / PYTHONSTARTUP / PYTHONUSERBASE — 可能污染内置 Python
 */
export function computeRuntimeEnvPatch(
  callerEnv: { PATH?: string; NODE_PATH?: string } = {}
): Record<string, string> {
  // 首次调用时构建静态缓存
  if (!cachedStaticPatch) {
    cachedStaticPatch = {};
    cachedNodePaths = [];

    // CHERRY_NODE
    if (cachedNodePath) {
      cachedStaticPatch.CHERRY_NODE = cachedNodePath;
    }

    // CHERRY_PYTHON
    if (cachedPythonPath) {
      cachedStaticPatch.CHERRY_PYTHON = cachedPythonPath;
    }

    // CHERRY_PYTHONHOME（供 Agent 局部使用，不直接设 PYTHONHOME）
    const pythonHome = getPythonHome();
    if (pythonHome) {
      cachedStaticPatch.CHERRY_PYTHONHOME = pythonHome;
    }

    // NODE_PATH 基础部分
    if (app.isPackaged) {
      cachedNodePaths.push(path.join(process.resourcesPath, "app.asar", "node_modules"));
      cachedNodePaths.push(path.join(process.resourcesPath, "app.asar.unpacked", "node_modules"));
    } else {
      cachedNodePaths.push(path.join(app.getAppPath(), "node_modules"));
    }
  }

  const sep = path.delimiter;
  const patch: Record<string, string> = { ...cachedStaticPatch };

  // PATH 构建：
  // 1. git shim 在最前面（抑制 macOS Xcode CLT 弹窗）
  // 2. 原始 PATH 保持不变
  // 3. Python bin 追加到末尾（fallback）
  const gitShimDir = getGitShimDir();
  const pythonBinDir = getPythonBinDir();

  if (gitShimDir || pythonBinDir) {
    const parts: string[] = [];
    if (gitShimDir) parts.push(gitShimDir);
    if (callerEnv.PATH) parts.push(callerEnv.PATH);
    if (pythonBinDir) parts.push(pythonBinDir);
    patch.PATH = parts.join(sep);
  }

  // NODE_PATH: 拼接 caller 的 NODE_PATH
  const nodePathParts = [
    ...cachedNodePaths!,
    ...(callerEnv.NODE_PATH ? [callerEnv.NODE_PATH] : []),
  ];
  patch.NODE_PATH = nodePathParts.join(sep);

  // 清理高风险继承变量（设为空字符串覆盖宿主 env）
  // 防止宿主环境的 NODE_OPTIONS、PYTHONPATH 等污染内置运行时
  patch.NODE_OPTIONS = "";
  patch.PYTHONPATH = "";
  patch.PYTHONSTARTUP = "";
  patch.PYTHONUSERBASE = "";

  return patch;
}
