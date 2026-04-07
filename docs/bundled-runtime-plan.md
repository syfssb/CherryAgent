# Cherry Agent 内置运行时环境方案

## Context

小白用户让 AI 制作 PPT/Excel/Word/PDF 时，因电脑没有 Python/Node.js，Agent 花大量时间安装依赖，首次体验极差。本方案通过三层策略解决：预装 Node.js 文档库 + 暴露 Electron 内置 Node.js + 内置 Python。所有竞品都没解决这个问题，这是差异化竞争机会。

## 体积影响

| 层级 | 内容 | 增量 |
|------|------|------|
| 第一层 | pptxgenjs + exceljs + docx + pdf-lib（纯 JS，零 native） | ~20MB |
| 第二层 | node/python wrapper 脚本 + PATH/NODE_PATH 注入 | ~0 |
| 第三层 | python-build-standalone + pip 包 | ~70-80MB/平台 |
| **合计** | | **~90-100MB** |

## 平台适配研究摘要（四维度）

### 维度 1: CCSDK env 传递链路

代码追踪结果：
```
getEnhancedEnv() [util.ts:7-30]
  → mergedEnv [runner.ts:637]
    → query({ env: mergedEnv }) [runner.ts:725]
      → ProcessTransport
        → spawnClaudeCodeProcess() [claude-process-spawner.ts:51]
          → child process (Claude Code CLI)
            → CLI 内部 Bash 工具 spawn 子进程时继承 env
```

**关键结论**：
- SDK **不过滤** env 变量，所有传入的 env 完整透传到 CLI 子进程
- CLI 的 Bash 工具用 `spawn()` 执行命令，自动继承父进程 env
- `getEnhancedEnv()` 是唯一注入点，改这里即可覆盖全链路
- `claude-process-spawner.ts` 不需要修改（它只做 `{ ...env }` 复制 + 加 `ELECTRON_RUN_AS_NODE`）

### 维度 2: Codex SDK env 传递链路

代码追踪结果：
```
ipc-handlers.ts:801 → env: process.env ← ⚠️ 没走 getEnhancedEnv()!
ipc-handlers.ts:1019 → env: process.env ← ⚠️ 同上
  → codex-runner.ts:174 → new Codex({ env: options.env })
    → Codex SDK 子进程继承这个 env
```

**关键问题**：Codex runner 当前直接传 `process.env`，完全绕过了 `getEnhancedEnv()`，导致 Codex 环境下无法使用内置运行时。
**修复**：`ipc-handlers.ts` 两处 Codex 调用改为 `env: await getEnhancedEnv()`。

### 维度 3: Windows 平台坑

| 坑 | 规避措施 |
|----|---------|
| PATH 分隔符 `;` 非 `:` | `bundled-runtime.ts` 使用 `path.delimiter` |
| Windows 不能执行 .sh | 生成 `node.cmd` |
| .cmd spawn ENOENT | CLI Bash 工具自动用 `cmd.exe /c`，无需额外处理 |
| ELECTRON_RUN_AS_NODE | claude-process-spawner.ts 已正确设置 |
| python-build-standalone PYTHONHOME | 仅在内置 Python 存在时设置 |
| MAX_PATH 260 字符 | Python 安装到 `{resources}/python/`，保持扁平 |

### 维度 4: macOS 平台坑

| 坑 | 规避措施 |
|----|---------|
| Electron Fuses RunAsNode | Electron 36.x 默认启用，当前项目未禁用 |
| Finder 启动 PATH 极简 | 内置 node wrapper 解决 |
| Gatekeeper + 未签名二进制 | pack-mac.sh 中 ad-hoc 签名所有 Mach-O |
| 公证扫描 extraResources | Python .so 需 ad-hoc 签名 |
| node wrapper 权限 | `setupBundledRuntime()` 设置 `0o755` |
| Hardened Runtime + Python | entitlements 需加 `disable-library-validation` |

---

## 实施步骤

### Step 1: 添加文档库依赖 (`package.json`)

`dependencies` 中添加：`pptxgenjs`, `exceljs`, `docx`, `pdf-lib`。然后 `bun install`。

### Step 2: 修改打包配置 (`electron-builder.json`)

asarUnpack 添加 4 个文档库，extraResources 添加 Python。

### Step 3: 新建 `src/electron/libs/bundled-runtime.ts`（~200 行）

核心函数：`setupBundledRuntime()` 创建 wrapper 脚本，`computeRuntimeEnvPatch()` 计算 PATH/NODE_PATH/PYTHONHOME 补丁。详见方案 MD。

### Step 4: 修改 `src/electron/libs/util.ts`

`getEnhancedEnv()` 末尾追加 `computeRuntimeEnvPatch()` 调用。

### Step 5: 修改 `src/electron/main.ts`

`app.on("ready")` 回调内调用 `setupBundledRuntime()`。

### Step 6: 修改 `src/electron/ipc-handlers.ts`

两处 Codex runner env（801 行、1019 行）从 `process.env` 改为 `await getEnhancedEnv()`。

### Step 7: 修改 4 个 SKILL.md

添加内置运行时说明，引导 Agent 优先使用 Node.js 库。xlsx/pdf 追加 exceljs/pdf-lib 代码示例。

### Step 8-9: 新建 Python 下载和预装脚本

`scripts/download-python.sh` + `scripts/preinstall-python-packages.sh`。

### Step 10: 修改打包脚本

`pack-mac.sh` 和 `pack-win.sh` 添加 Python 准备步骤，mac 需 ad-hoc 签名。

### Step 11: 更新 `.gitignore` 和 `package.json scripts`

### Step 12: 修改 `build/entitlements.mac.plist`

添加 `disable-library-validation` entitlement。

---

完整技术细节见方案 MD 文件。
