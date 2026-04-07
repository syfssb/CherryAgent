/**
 * git-shim.ts — macOS Xcode CLT 对话框抑制（git + python3）
 *
 * 问题：小白用户的 Mac 没有安装 Xcode Command Line Tools 时，
 * /usr/bin/git 和 /usr/bin/python3 都是 Apple shim，调用时会弹出系统安装对话框。
 * Claude Code CLI 在启动时调用 git（收集仓库信息）和 python3（检测运行时），
 * 导致用户看到 "xxx 命令需要使用命令行开发者工具" 弹窗。
 *
 * 解决方案：创建轻量 shim 脚本插入 PATH 最前面，
 * 让 git/python3 调用静默失败（exit 1）而不触发系统弹窗。
 *
 * 智能降级：shim 脚本内部会重新检测 CLT 状态，
 * 如果用户后续安装了 CLT，shim 自动变为透明代理，
 * 无需重启应用即可恢复功能。
 */

import { app } from "electron";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";

// ---------------------------------------------------------------------------
// 模块级状态
// ---------------------------------------------------------------------------

let shimDir: string | null = null;

// ---------------------------------------------------------------------------
// 内部函数
// ---------------------------------------------------------------------------

/**
 * 检测 macOS Xcode Command Line Tools 是否已安装。
 * `xcode-select -p` 在 CLT 已安装时返回 0 并输出路径，
 * 未安装时返回非零退出码。此命令本身不会触发安装对话框。
 */
function isXcodeCLTInstalled(): boolean {
  try {
    execFileSync("/usr/bin/xcode-select", ["-p"], {
      stdio: "ignore",
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Git shim 脚本内容。
 *
 * 逻辑：
 * 1. 每次被调用时先检测 CLT 是否已安装（xcode-select -p 非常快，~1ms）
 * 2. 如果已安装 → exec 真正的 /usr/bin/git，完全透明
 * 3. 如果未安装 → 在 PATH 中寻找非 /usr/bin 且非 shim 自身目录的 git
 *    3a. 找到 → exec 该 git（支持 Homebrew/Nix/Mise/MacPorts 等）
 *    3b. 找不到 → 静默返回 exit 1，CLI 正常降级
 *
 * 好处：用户在 app 运行期间安装了 CLT 后，无需重启即可恢复 git 功能；
 *       同时不会误伤已有第三方 git 环境。
 */
const GIT_SHIM_SCRIPT = `#!/bin/sh
# Cherry Agent git shim — suppress macOS Xcode CLT installation dialog
# When CLT is not installed, fall back to any real git in PATH.
# When CLT becomes available, transparently delegate to /usr/bin/git.
if /usr/bin/xcode-select -p >/dev/null 2>&1; then
  exec /usr/bin/git "$@"
fi
# CLT not installed; search PATH for an alternative git, skipping /usr/bin and shim dir.
SHIM_DIR="$(cd "$(dirname "$0")" && pwd)"
IFS=:
for dir in $PATH; do
  case "$dir" in /usr/bin) continue ;; esac
  [ "$(cd "$dir" 2>/dev/null && pwd)" = "$SHIM_DIR" ] && continue
  if [ -x "$dir/git" ]; then
    exec "$dir/git" "$@"
  fi
done
exit 1
`;

/**
 * Python3 shim 脚本：同 git shim 逻辑，抑制 /usr/bin/python3 的 Xcode CLT 弹窗。
 * Claude CLI 启动时检测 python3 运行时会触发此路径。
 */
const PYTHON3_SHIM_SCRIPT = `#!/bin/sh
# Cherry Agent python3 shim — suppress macOS Xcode CLT installation dialog
if /usr/bin/xcode-select -p >/dev/null 2>&1; then
  exec /usr/bin/python3 "$@"
fi
SHIM_DIR="$(cd "$(dirname "$0")" && pwd)"
IFS=:
for dir in $PATH; do
  case "$dir" in /usr/bin) continue ;; esac
  [ "$(cd "$dir" 2>/dev/null && pwd)" = "$SHIM_DIR" ] && continue
  if [ -x "$dir/python3" ]; then
    exec "$dir/python3" "$@"
  fi
done
exit 1
`;

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * app 启动时调用。仅在 macOS 且 CLT 未安装时创建 git shim。
 * 失败不阻断启动。
 */
export function setupGitShim(): void {
  // 仅 macOS 需要此 shim（Windows/Linux 没有 Xcode CLT 问题）
  if (process.platform !== "darwin") return;

  // CLT 已安装，不需要 shim
  if (isXcodeCLTInstalled()) {
    console.log("[git-shim] Xcode CLT detected, no shim needed");
    return;
  }

  console.warn(
    "[git-shim] Xcode CLT not installed, creating git shim to suppress system dialog"
  );

  try {
    const userDataPath = app.getPath("userData");
    shimDir = path.join(userDataPath, ".git-shim");
    const gitShimPath = path.join(shimDir, "git");

    fs.mkdirSync(shimDir, { recursive: true });

    // 写入 shim 脚本（覆盖旧版本，确保内容最新）
    fs.writeFileSync(gitShimPath, GIT_SHIM_SCRIPT, { mode: 0o755 });

    // python3 shim：Claude CLI 启动时检测运行时会调 python3，同样需要抑制弹窗
    const python3ShimPath = path.join(shimDir, "python3");
    fs.writeFileSync(python3ShimPath, PYTHON3_SHIM_SCRIPT, { mode: 0o755 });

    // 目录设为只读，防止向 PATH 前置目录注入其他可执行文件
    try {
      fs.chmodSync(shimDir, 0o555);
    } catch {
      // chmod 失败不影响主功能（仅影响安全加固）
    }

    console.log(`[git-shim] Created git + python3 shims at ${shimDir}`);
  } catch (err) {
    console.warn("[git-shim] Failed to create shim (non-fatal):", err);
    shimDir = null;
  }
}

/**
 * 获取 git shim 目录路径。
 * 返回 null 表示不需要 shim（CLT 已安装或非 macOS）。
 * 供 computeRuntimeEnvPatch() 插入 PATH 最前面。
 */
export function getGitShimDir(): string | null {
  return shimDir;
}
