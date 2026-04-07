<div align="center">

# Cherry Agent

**A native desktop AI assistant powered by Claude**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/DevAgentForge/cherry-agent/releases)
[![Electron](https://img.shields.io/badge/Electron-36.x-47848f.svg)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org/)

[English](#) · [贡献指南](CONTRIBUTING.md) · [问题反馈](https://github.com/DevAgentForge/cherry-agent/issues)

</div>

---

## What is Cherry Agent?

Cherry Agent is an open-source desktop application that wraps the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) in a native GUI. It gives Claude Code users a visual interface for managing multi-turn AI sessions, inspecting tool calls, and rendering AI-generated interactive charts — without ever leaving the desktop.

> Claude Code is powerful but terminal-only.
> Cherry Agent brings it to the desktop.

**Key capabilities:**

- Multi-session management with persistent chat history (SQLite)
- Real-time tool call visualization (Bash, file ops, web search, etc.)
- Generative UI widgets: AI can render SVG diagrams, ECharts charts, and HTML calculators inline in chat
- Cross-platform: macOS (arm64/x64), Windows, Linux
- Reuses your existing `~/.claude/settings.json` and Claude Code authentication

---

## Screenshots

> Screenshots coming soon.

---

## Quick Start

### Option 1: Download a Release

Go to [Releases](https://github.com/DevAgentForge/cherry-agent/releases) and download the installer for your platform.

**Requirements:**
- A valid Anthropic API key (configure via Claude Code: `claude login`)
- macOS 12+, Windows 10+, or a modern Linux desktop

### Option 2: Build from Source

**Prerequisites:**
- [Bun](https://bun.sh/) 1.x or Node.js 22+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (`claude login`)
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Windows: Git for Windows (provides bash)

```bash
# Clone
git clone https://github.com/DevAgentForge/cherry-agent.git
cd cherry-agent

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env — set AUTH_API_URL if using a self-hosted auth backend
# For local-only use, the default values work out of the box

# Run in development mode
bun run dev
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 36 |
| Frontend | React 19 + Vite 7 + Tailwind CSS 4 |
| Backend (main process) | TypeScript + better-sqlite3 |
| AI runtime | [@anthropic-ai/claude-agent-sdk](https://github.com/anthropics/claude-agent-sdk-typescript) |
| Codex runtime | [@openai/codex-sdk](https://github.com/openai/codex) |
| Package manager | Bun (recommended) / pnpm |
| Testing | Vitest + Playwright |

---

## Project Structure

```
cherry-agent/
├── src/
│   ├── electron/          # Main process (IPC, auto-updater, session management)
│   │   ├── ipc/           # IPC handler registry
│   │   ├── libs/          # Core libraries (runner, auto-updater, process spawner)
│   │   └── main.ts        # Electron entry point
│   └── ui/                # Renderer process (React)
│       ├── components/    # UI components
│       ├── lib/           # Frontend utilities (widget system, etc.)
│       └── pages/         # Route pages
├── api-server/            # Optional auth/billing backend (Express + PostgreSQL)
├── landing-web/           # Marketing/download page (nginx + Docker)
├── packages/              # Internal monorepo packages
│   ├── core/              # Shared business logic
│   ├── shared/            # Shared types and utilities
│   └── electron-adapter/  # Electron-specific adapters
├── scripts/               # Build, pack, and release scripts
├── resources/             # Native binaries (vendored, platform-specific)
├── skills/                # Claude Agent SDK skill plugins
└── tests/                 # E2E and integration tests
```

Each directory contains a `codemap.md` with detailed architecture notes. Start there before modifying code.

---

## Development

```bash
# Start dev server (hot reload)
bun run dev

# Type check
bun run build

# Run unit tests
bun run test:unit

# Run all tests
bun run test:all

# Lint
bun run lint
```

### Building Platform Installers

```bash
# macOS Apple Silicon
bun run dist:mac-arm64

# macOS Intel
bun run dist:mac-x64

# Windows (cross-compile from macOS)
bun run dist:win

# Linux
bun run dist:linux
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for environment setup and PR workflow. See [`DEVELOPMENT.md`](DEVELOPMENT.md) for architecture decisions and deep technical notes.

---

## Generative UI Widgets

Cherry Agent includes a widget system that lets Claude render interactive visualizations directly in chat. The AI outputs a `show-widget` code fence; the frontend renders it in a sandboxed iframe with no network access.

Supported widget types:
- SVG flowcharts, architecture diagrams, timelines
- ECharts interactive charts (line, bar, pie, radar, sankey, heatmap, etc.)
- HTML interactive calculators with sliders and inputs

---

## Auto-Update

The app uses `electron-updater` for silent background updates. On startup, it checks a update feed URL for new versions, downloads them in the background, and notifies the user when ready to install.

Configure the update feed URL via the `VITE_UPDATE_FEED_URL` environment variable. See `.env.example` for details.

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

---

## License

[Apache-2.0](LICENSE)
