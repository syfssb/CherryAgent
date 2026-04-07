# Development Guide

Architecture decisions, technical deep-dives, and known pitfalls for contributors.

For environment setup and PR workflow, see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Table of Contents

- [SDK Dependencies and Patches](#sdk-dependencies-and-patches)
- [SDK Skills Directory Structure](#sdk-skills-directory-structure)
- [ADR-01: Generative UI Widget System](#adr-01-generative-ui-widget-system)
- [ADR-02: Auto-Update Mechanism](#adr-02-auto-update-mechanism)
- [ADR-03: Windows Bash Environment (MSYS2)](#adr-03-windows-bash-environment-msys2)
- [ADR-04: Cross-Platform Codex Binary Packaging](#adr-04-cross-platform-codex-binary-packaging)
- [ADR-05: Windows Compatibility Hardening](#adr-05-windows-compatibility-hardening)
- [ADR-06: macOS python3 / Xcode CLT Shim](#adr-06-macos-python3--xcode-clt-shim)
- [ADR-07: Chat Layout Double-Compression Bug](#adr-07-chat-layout-double-compression-bug)
- [ADR-08: Google OAuth Backend Proxy](#adr-08-google-oauth-backend-proxy)

---

## SDK Dependencies and Patches

| SDK | Version | Source | Install |
|-----|---------|--------|---------|
| Claude Agent SDK | `0.2.6` | https://github.com/anthropics/claude-agent-sdk-typescript | npm + local patch |
| Codex SDK | `0.106.0` | https://github.com/openai/codex (`sdk/typescript`) | local tgz |

### Claude Agent SDK Local Patch

**File:** `patches/@anthropic-ai%2Fclaude-agent-sdk@0.2.6.patch`

**Change:** Modified `ProcessTransport` to use `fork` instead of `spawn`, adding an IPC channel.

**Current status: patch is bypassed by the application layer.**

`fork` causes child process deadlocks on Windows (Electron's `process.execPath` runs JS scripts without `ELECTRON_RUN_AS_NODE=1`, and `windowsHide: true` was removed). The desktop app now uses the SDK's `spawnClaudeCodeProcess` extension point to customize process spawning instead.

**Application-layer spawner (`src/electron/libs/claude-process-spawner.ts`):**
- Uses `spawn` (not fork), stdio three-pipe (no IPC), `windowsHide: true`
- JS CLI: `process.execPath` + `ELECTRON_RUN_AS_NODE=1` (no system node required)
- Native binary: passes `command + args` directly
- Used by both `runner.ts` and `llm-service.ts`

**Future:** Remove `patchedDependencies` and the patch file once Windows regression is verified.

---

## SDK Skills Directory Structure

The Claude Agent SDK scans `{plugin-root}/skills/` **subdirectory**, not the plugin root itself.

**Correct structure:**
```
skills/                    ← plugin root (passed to SDK)
  .claude-plugin/
    plugin.json
  skills/                  ← SDK auto-scans here
    frontend-design/
      SKILL.md
    pdf/
      SKILL.md
```

**Related files:**
- `src/electron/libs/skill-files.ts` — `ensureSkillsPluginManifest()` migrates skills to the correct location
- `src/electron/libs/preset-skills-installer.ts` — calls manifest generation after installing preset skills
- `src/electron/libs/runner.ts` — configures SDK plugin paths

---

## ADR-01: Generative UI Widget System

**Context:** Plain-text AI replies are insufficient for data-heavy responses. The app needs to render interactive visualizations inline in chat.

**Decision:** Use a `show-widget` code fence as the trigger. AI generates the widget code; the frontend renders it in a sandboxed iframe with no network access.

**Trigger scenarios:**
- Process/flow → SVG flowchart
- Structure/hierarchy → SVG tree diagram
- Data/trends → ECharts chart
- Calculations → HTML slider tool
- Comparisons → SVG side-by-side diagram

**Core files:**

| File | Responsibility |
|------|---------------|
| `src/ui/lib/widget-sanitizer.ts` | HTML three-pass sanitization + fence parsing + receiver iframe srcdoc |
| `src/ui/lib/widget-css-bridge.ts` | Anthropic color system → iframe CSS variable mapping |
| `src/ui/lib/widget-guidelines.ts` | System prompt + ECharts theme + design guidelines |
| `src/ui/components/chat/WidgetRenderer.tsx` | iframe render core (streaming/finalize/theme sync/zoom) |
| `src/ui/components/chat/MarkdownRendererCore.tsx` | show-widget fence detection + segmented rendering |
| `src/electron/ipc/core.ts` | Widget system prompt injection |

**Data flow:**
```
User sends message
→ AI outputs ```show-widget {...}```
→ MarkdownRendererCore detects fence
→ Streaming: extractPartialWidgetCode() → WidgetRenderer → postMessage widget:update → live preview
→ Complete: parseAllShowWidgets() → WidgetRenderer → postMessage widget:finalize → execute scripts
```

**Security isolation:** `<iframe sandbox="allow-scripts" src={blobUrl}>`
- No `allow-same-origin` → widget cannot access host DOM/cookie
- CSP meta: `script-src` limited to CDN whitelist + inline; `connect-src 'none'` blocks network
- Link interception: forwarded via postMessage, opened with `shell.openExternal()`

**postMessage protocol:**

| Message | Direction | Trigger |
|---------|-----------|---------|
| `widget:update` | parent→iframe | Streaming update (120ms debounce) |
| `widget:finalize` | parent→iframe | Streaming complete, execute scripts |
| `widget:theme` | parent→iframe | Dark/light mode switch |
| `widget:ready` | iframe→parent | Receiver initialized |
| `widget:resize` | iframe→parent | Content height change (60ms debounce) |
| `widget:link` | iframe→parent | User clicks a link |
| `widget:sendMessage` | iframe→parent | User clicks drill-down node |

**Known pitfalls:**

| Issue | Cause | Fix |
|-------|-------|-----|
| System prompt injection fails | Main process `require()` references renderer module; path unresolvable after build | Inline prompt in `src/electron/ipc/core.ts` `getContextInjection()` |
| Inline script blocked by CSP | `script-src-elem` missing `'unsafe-inline'` | Add `'unsafe-inline'` to `script-src` and `script-src-elem` |
| Blob URL blocked by CSP | `frame-src` missing `blob:` | Add `blob:` to `frame-src` |
| CDN script blocked by CSP | CDN domains not in `script-src-elem` | Add CDN domains to CSP whitelist |
| Chart appears without animation | `isStreaming` prop not passed to MarkdownRenderer | Add `isStreaming={isRunning}` in MessageAdapter |
| useEffect deps re-register at high frequency | Handler deps include `widgetCode`, changes every streaming token | Switch to ref + empty deps |
| Local dev fails after cross-arch build | Cross-compiling x64 DMG recompiles better-sqlite3 to x64 | `npx electron-rebuild -m . -o better-sqlite3` to restore arm64 |

---

## ADR-02: Auto-Update Mechanism

**Context:** Electron auto-update is a complex engineering problem. Six root causes were discovered and fixed across multiple releases.

**Final stable flow:**
```
App starts → 10s delay → autoUpdater.checkForUpdates()
→ electron-updater fetches update feed yml
→ New version found → autoDownload=true → background zip download
→ Download complete → update-downloaded event → frontend notification
→ User clicks "Restart Now" → quitAndInstall() → ShipIt(macOS) / NSIS(Windows)
```

**Key implementation details:**

### 1. `app-update.yml` must be generated in the afterPack hook

`electron-builder` does not auto-generate `app-update.yml` when using `--mac dir` target. Solution: generate it cross-platform in `scripts/electron-builder-after-pack.cjs`'s `afterPack` hook.

**Critical constraint:** Never write files into `.app` after code signing — this invalidates the signature and causes notarization failure. `afterPack` runs before signing, making it the correct injection point.

The hook must cover all platforms:
- macOS: `<appOutDir>/<appName>.app/Contents/Resources/`
- Windows/Linux: `<appOutDir>/resources/`

### 2. ESM/CJS compatibility

`package.json` declares `"type": "module"`, but `electron-updater@6.x` is pure CJS. When ESM dynamically imports CJS, `defineProperty` getters are not extracted as named exports:

```typescript
// Correct pattern:
const electronUpdater = await import('electron-updater') as any;
this.autoUpdater = (electronUpdater.default?.autoUpdater ?? electronUpdater.autoUpdater);

// Same pattern for electron-log:
const logMod = await import('electron-log') as any;
this.autoUpdater.logger = logMod.default ?? logMod;
```

This is a known upstream issue: [electron-builder#7338](https://github.com/electron-userland/electron-builder/issues/7338), [#7976](https://github.com/electron-userland/electron-builder/issues/7976).

### 3. Squirrel.Mac requires code signing

macOS electron-updater depends on Squirrel.Mac, which **requires a code-signed app**. Unsigned apps calling `checkForUpdates()` silently fail with zero network requests.

Mitigation: `auto-updater.ts` provides a `checkFeedForUpdate()` method as fallback.

**macOS constraint:** App must be in `/Applications/`. If not, Squirrel.Mac has no write permission and silently fails. Current implementation detects the path in `installUpdate()` and shows a guidance dialog if needed.

### 4. Windows configuration

| Setting | Value | Reason |
|---------|-------|--------|
| `perMachine` | `false` | No admin rights needed, avoids UAC elevation failure |
| `verifyUpdateCodeSignature` | `false` | Skip signature verification for OV cert scenario |
| Process cleanup | `before-quit` → `cleanupAllSessions()` | Prevent lingering children from blocking NSIS |

**Windows update failure → total app corruption:** If `app-update.yml` is missing from the Windows package, NSIS moves the old version to a temp directory but fails to install the new one. The app becomes completely unusable. There is no rollback mechanism — users must reinstall manually.

### 5. Update feed yml integrity

- The `sha512` in update feed yml must match the actual file exactly. Do not transform files after upload.
- Update feed yml and metadata files (`.yml`, `.json`, `.blockmap`) must **not** be subject to access rate-limiting, or the auto-update chain will break.

---

## ADR-03: Windows Bash Environment (MSYS2)

**Context:** Claude Code SDK hardcodes bash call chains internally. Windows has no native bash; a replacement must be bundled.

**Decision:** Bundle MSYS2 GNU Bash 5.3 (replacing busybox ash).

**Why not busybox ash:**
- busybox ash ≠ GNU Bash — no `[[ ]]`, arrays, extglob, process substitution
- AI generates standard bash syntax → ash parse failure → AI retries repeatedly → timeout
- busybox-w32 has known crash on Windows 11 24H2 (Issue #495)
- Claude Code SDK internally hardcodes bash syntax (confirmed in [#15471](https://github.com/anthropics/claude-code/issues/15471), [#28670](https://github.com/anthropics/claude-code/issues/28670))

**vendor/win32 file manifest:**

| File | Source | Purpose |
|------|--------|---------|
| `bash.exe` | MSYS2 GNU Bash 5.3 | Real bash shell |
| `sh.exe` | bash.exe copy | POSIX sh compatibility |
| `busybox.exe` | busybox64u | POSIX coreutils (ls/cat/grep/sed etc.) |
| `cygpath.exe` | MSYS2 msys2-runtime | Win32↔POSIX path conversion |
| `msys-2.0.dll` | MSYS2 msys2-runtime | MSYS2 core runtime |
| `msys-readline8.dll` | MSYS2 libreadline 8.2 | bash line editing |
| `msys-ncursesw6.dll` | MSYS2 ncurses 6.5 | readline dependency |
| `msys-gcc_s-seh-1.dll` | MSYS2 gcc-libs | ncurses transitive dep |
| `msys-intl-8.dll` | MSYS2 libintl | internationalization (cygpath dep) |
| `msys-iconv-2.dll` | MSYS2 libiconv | encoding conversion |

**Pre-build verification:**
```bash
ls resources/vendor/win32/
# Expected: busybox.exe bash.exe sh.exe cygpath.exe
#           msys-2.0.dll msys-readline8.dll msys-ncursesw6.dll
#           msys-gcc_s-seh-1.dll msys-intl-8.dll msys-iconv-2.dll
```

**Environment variables injected by `claude-process-spawner.ts`:**

| Variable | Value | Purpose |
|----------|-------|---------|
| `SHELL` / `CLAUDE_CODE_GIT_BASH_PATH` | path to bundled bash.exe | Tell SDK where bash is |
| `PATH` | prepend `vendor/win32` dir | Make cygpath/git accessible in bash |
| `LANG` | `C.UTF-8` | Prevent garbled output on Chinese username paths |
| `MSYS2_PATH_TYPE` | `inherit` | Inherit Windows PATH (git.exe etc.) |

**MSYS2 fork failure (enterprise ASLR):** Mandatory ASLR causes MSYS2 bash fork() to crash due to address space conflicts. `claude-process-spawner.ts` detects patterns like `child_info_fork::abort` and `cygheap base mismatch` in stderr, triggers earlyExit, and shows a user-friendly message.

---

## ADR-04: Cross-Platform Codex Binary Packaging

**Context:** When cross-compiling a Windows package on Mac, `bun install` only installs optional dependencies for the host platform, so `@openai/codex-win32-x64` is missing.

**Decision:** Use `npm pack` to download the target platform tarball and extract it manually. This is not constrained by the host platform.

**Files:**
- `scripts/pack-win.sh` — ensures `codex-win32-x64/vendor/.../codex.exe` exists before packaging
- `scripts/pack-mac.sh` — ensures target-arch Codex binary exists
- `electron-builder.json` — `asarUnpack` includes `**/node_modules/@openai/codex-*/vendor/**`
- `src/electron/libs/agent-runner/codex-settings.ts` — locates the Codex executable at runtime

---

## ADR-05: Windows Compatibility Hardening

### Process subsystem

**Child process tree cleanup:** Windows `process.kill()` only kills the parent. `core.ts` `cleanupAllSessions()` additionally runs `taskkill /pid ${pid} /T /F` on Windows to recursively kill the process tree.

**SQLite busy_timeout:** Antivirus software (360, Defender) can lock WAL/SHM files. Added `db.pragma("busy_timeout = 5000")` so SQLite waits up to 5 seconds instead of failing immediately.

**Shutdown cleanup:** `before-quit` doesn't fire on Windows shutdown. Register `powerMonitor.on("shutdown", cleanup)` as the Windows-specific cleanup hook.

### Window system

**titleBarStyle:** `"hiddenInset"` is macOS-only. Windows now uses `"hidden"` + `titleBarOverlay` (shows native window controls with Anthropic-matched colors).

**SIGHUP:** `process.on("SIGHUP")` only registered when `platform !== "win32"`.

**Files changed:**

| File | Changes |
|------|---------|
| `src/electron/libs/claude-process-spawner.ts` | fork failure detection, env var injection, DLL check, onPidAvailable |
| `src/electron/main.ts` | titleBarOverlay, powerMonitor.shutdown, SIGHUP guard |
| `src/electron/ipc/core.ts` | busy_timeout, taskkill process tree cleanup |
| `src/electron/libs/runner.ts` | RunnerHandle.pid, lastChildPid tracking |

---

## ADR-06: macOS python3 / Xcode CLT Shim

**Context:** On Macs without Xcode Command Line Tools, `/usr/bin/python3` is an Apple stub that triggers a system install dialog when called. Claude SDK/CLI calls `python3` at startup for runtime detection.

**Decision:** Add a `python3` shim to the existing git-shim mechanism (`src/electron/libs/git-shim.ts`):
- CLT installed → transparent proxy to `/usr/bin/python3`
- CLT not installed → search for third-party python3 (Homebrew/Nix)
- Neither found → silent `exit 1`, no dialog

The shim directory (`~/.cherry-agent/.git-shim/`) is prepended to PATH via `computeRuntimeEnvPatch()`.

---

## ADR-07: Chat Layout Double-Compression Bug

**Context:** User message bubbles were clustered on the left with ~256px of whitespace on the right.

**Root cause:** `FileExplorer` defaults to `floating=false` (flex item, not `position: fixed`). It already compresses `ChatView`'s width through flex layout. A prior fix incorrectly assumed it was `position: fixed` and added an extra `rightInset={fileExplorerWidth}` to `ChatView`, causing double compression.

**Rule:**
| Component | Positioning | rightInset needed? |
|-----------|------------|-------------------|
| `PromptInput` | `position: fixed` | Yes |
| `ChatView` | flex child | No |

---

## ADR-08: Google OAuth Backend Proxy

**Context:** The backend may be unable to reach Google APIs depending on network environment.

**Decision:** Use `undici`'s `ProxyAgent` to set a global fetch proxy in `api-server/src/app.ts`, configured via the `HTTPS_PROXY` environment variable.

**OAuth popup auto-close:** `main.ts` uses `setWindowOpenHandler` + `did-create-window` to track child windows, then listens for `will-navigate`/`did-navigate` to detect the callback URL and calls `destroy()`. Frontend also sends `auth:closeOAuthWindows` IPC on successful login.

**Files:**
- `api-server/src/routes/auth.ts` — backend auth routes
- `api-server/src/app.ts` — proxy configuration
- `src/electron/main.ts` — OAuth popup window management
- `src/ui/components/auth/LoginModal.tsx` — frontend login UI
