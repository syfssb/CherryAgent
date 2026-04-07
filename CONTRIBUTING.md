# Contributing to Cherry Agent

Thank you for your interest in contributing. This guide covers everything you need to get the development environment running and submit a pull request.

---

## Table of Contents

- [Development Environment Setup](#development-environment-setup)
- [Project Architecture](#project-architecture)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

---

## Development Environment Setup

### Requirements

| Tool | Version | Notes |
|------|---------|-------|
| [Bun](https://bun.sh/) | 1.x+ | Primary package manager |
| Node.js | 22+ | Fallback if Bun unavailable |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Latest | Required for AI runtime (`claude login`) |

**Platform-specific:**

- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** Git for Windows — provides the `bash` shell required by Claude Code SDK
- **Linux:** Standard build tools (`build-essential` or equivalent)

### Setup Steps

```bash
# 1. Clone the repository
git clone https://github.com/DevAgentForge/cherry-agent.git
cd cherry-agent

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Open .env and adjust variables as needed (see Configuration below)

# 4. Rebuild native modules for Electron
bun run rebuild

# 5. Start the development server
bun run dev
```

The app opens automatically. The renderer (React/Vite) supports hot module replacement; the main process requires a restart after changes.

### Configuration

Key environment variables (see `.env.example` for the full list):

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_API_URL` | No | Base URL of the auth/billing backend. Omit for local-only use. |
| `VITE_UPDATE_FEED_URL` | No | URL of the auto-update feed. Required only for distributing builds. |

### Restarting the Development Server

```bash
pkill -f "electron" || true
pkill -f "vite" || true
bun run dev
```

### Viewing Development Logs

SDK logs are written to `/tmp/cherry-agent-sdk.log` (active only in `NODE_ENV=development`):

```bash
# Live tail
tail -f /tmp/cherry-agent-sdk.log
```

Key log prefixes:

| Prefix | Meaning |
|--------|---------|
| `[RUNNER] ▶ ToolName` | AI invoking a tool |
| `[RUNNER] ✓ ToolName` | Tool completed (with duration) |
| `[RUNNER] ✗ ToolName` | Tool failed |
| `[RUNNER] ✓ result:success` | Task complete (with token usage) |
| `[IPC] ⚡ N events` | Batched IPC push |
| `[DB] 💾 N rows` | SQLite batch write |

### Native Module Rebuild

If `better-sqlite3` crashes after switching architectures or Electron versions:

```bash
bun run rebuild
```

---

## Project Architecture

Before making changes, read the code maps:

1. `codemap.md` in the **root directory** — overall module overview
2. `codemap.md` in the **target subdirectory** — detailed design notes for that module
3. Only then open the source files

Key architectural boundaries:

| Layer | Directory | Notes |
|-------|-----------|-------|
| Main process | `src/electron/` | IPC, auto-updater, process management. No UI code here. |
| Renderer | `src/ui/` | React components and hooks. No direct Node.js/Electron API calls. |
| IPC bridge | `src/electron/ipc/` | All renderer↔main communication goes through typed IPC handlers. |
| Auth/billing | `api-server/` | Optional backend. The desktop app works standalone without it. |

**Communication rules:**
- Renderer calls `window.electron.<channel>()` (defined in `src/electron/preload.cts`)
- Main process handlers live in `src/electron/ipc/`
- Never import renderer code from main process or vice versa

---

## Code Style

### General Principles

- **Immutability first:** Return new objects instead of mutating existing ones.
- **Small files:** Target 200–400 lines per file; extract when approaching 800.
- **Explicit error handling:** Never silently swallow errors. Log context server-side; show user-friendly messages in the UI.
- **No speculative abstractions:** Build what the task requires, not what might be needed later.
- **No dead code:** Remove unused variables, exports, and imports entirely.

### TypeScript

- Strict mode is enabled (`tsconfig.json`). Fix type errors; do not use `as any` unless interoperating with untyped CJS modules (see `ADR-02` in `CLAUDE.md`).
- Prefer named exports over default exports for easier refactoring.
- Use `interface` for object shapes that may be extended; `type` for unions and intersections.

### React

- Functional components only.
- Colocate state as close to its usage as possible; lift only when necessary.
- Avoid `useEffect` for data that can be derived. Avoid putting `useEffect` deps that change on every render.

### Linting and Formatting

```bash
# Check
bun run lint

# The project uses ESLint with TypeScript rules (eslint.config.js)
# There is no separate formatter config — follow what ESLint enforces
```

Fix all lint errors before submitting. Do not disable lint rules without a comment explaining why.

---

## Testing

### Running Tests

```bash
# Unit tests (fast, no Electron required)
bun run test:unit

# Integration tests (requires running services)
bun run test:integration

# All tests
bun run test:all

# With coverage report
bun run test:coverage

# E2E tests (launches Electron)
bun run test:e2e
```

### Writing Tests

- **Unit tests** live alongside the source file: `foo.ts` → `foo.test.ts`
- **Integration tests** live in `tests/integration/`
- **E2E tests** use Playwright and live in `tests/e2e/`

Coverage target: **80% for modified files**. New features must ship with tests. Bug fixes must include a regression test.

**Do not mock what you can test for real.** Integration tests should use real SQLite databases, not mocked persistence layers.

---

## Pull Request Process

### Before You Start

- Check [open issues](https://github.com/DevAgentForge/cherry-agent/issues) and [existing PRs](https://github.com/DevAgentForge/cherry-agent/pulls) to avoid duplicate work.
- For significant changes (new features, architectural changes), open an issue first to discuss the approach.

### Branch Naming

```
feat/<short-description>      # New feature
fix/<short-description>       # Bug fix
refactor/<short-description>  # Refactoring
docs/<short-description>      # Documentation only
chore/<short-description>     # Tooling, dependencies
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <imperative description>

<optional body — explain WHY, not WHAT>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Examples:
```
feat: add drag-and-drop file upload to chat input
fix: prevent double status event on runner early exit
docs: add Windows bash setup notes to CONTRIBUTING
```

### PR Checklist

Before requesting a review:

- [ ] All existing tests pass (`bun run test:all`)
- [ ] New/modified code has tests (80% coverage)
- [ ] No lint errors (`bun run lint`)
- [ ] `codemap.md` updated if module structure changed
- [ ] No hardcoded secrets, API keys, or private URLs
- [ ] PR description explains the problem and the solution

### Review Process

1. A maintainer will review your PR within a few days.
2. Address all `MUST` and `SHOULD` review comments before merging.
3. Squash-merge is preferred for feature branches; rebase-merge for small fixes.

---

## Reporting Issues

Use [GitHub Issues](https://github.com/DevAgentForge/cherry-agent/issues).

**Bug reports should include:**
- OS and version (macOS 15 arm64, Windows 11, Ubuntu 24.04, etc.)
- App version (visible in the title bar or About dialog)
- Steps to reproduce
- Expected vs. actual behavior
- Relevant logs (SDK log: `/tmp/cherry-agent-sdk.log`; Electron log: accessible via Help menu)

**Feature requests should include:**
- The problem you are trying to solve
- Your proposed solution (or just the problem if you are unsure)
- Any alternatives you have considered

---

## Security

Do not report security vulnerabilities through public GitHub issues. Send a private report via GitHub's [Security Advisory](https://github.com/DevAgentForge/cherry-agent/security/advisories/new) feature.

---

## License

By contributing to Cherry Agent, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
