<div align="center">

<!-- <img src="docs/assets/banner.png" alt="Cherry Agent Banner" width="100%" /> -->

# 🍒 Cherry Agent

**Claude Code as a Desktop App — No CLI Installation Required**

**English** | [简体中文](./README.md)

[![license](https://img.shields.io/github/license/syfssb/CherryAgent)](LICENSE)
[![stars](https://img.shields.io/github/stars/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/stargazers)
[![forks](https://img.shields.io/github/forks/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/fork)
[![issues](https://img.shields.io/github/issues/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/issues)

</div>

---

## What is this?

Cherry Agent is an **open-source AI coding desktop client** that brings the full power of Claude Code into a graphical interface.

**The key selling point: download, install, and start coding with AI.** No need to install Claude Code CLI, no `npm install`, no `claude login`. Both Claude Agent SDK and Codex SDK are **bundled in the installer** — you get a complete AI coding environment out of the box.

Most alternatives require technical setup: Cursor needs API keys, Continue needs IDE plugins, Claude Code itself is CLI-only. Cherry Agent's goal: **bring Claude Code-level AI coding to people who don't live in the terminal.**

> An out-of-the-box SaaS product for Claude Code beginners, inspired by the official Cowork feature.

---

## ✨ Features

### 🖥️ Desktop Client

- 🚀 **Zero Setup**: Claude Agent SDK + Codex SDK bundled — download, install, start coding
- 🤖 **Dual AI Engine**: Switch between Claude (Anthropic) and Codex (OpenAI) in the same interface
- 🔍 **Full Transparency**: Watch AI execute commands, read/write files, search the web — every step visible in real-time
- 🎨 **AI-Generated Visuals**: Flowcharts, data charts, architecture diagrams generated directly in chat (ECharts + SVG), interactive and zoomable
- 🧩 **Skills System**: 22+ pre-installed skills (browser automation, frontend design, document processing), plus custom extensions
- 📁 **File Explorer**: Browse and manage local files right in the conversation, drag & drop for context
- 🧠 **Memory System**: AI learns your coding style and preferences over time
- ☁️ **Cloud Sync**: Sessions, memories, skills, settings synced across devices (optional, local-first by default)
- 💬 **Multi-Session**: Unlimited sessions with tags, full-text search, persistent history
- 🔒 **Permission Control**: AI asks before running sensitive operations, three permission modes available
- 🔄 **Silent Auto-Update**: Downloads new versions in the background, prompts when ready
- 🖥️ **Cross-Platform**: macOS (Apple Silicon / Intel) + Windows

### 🛠️ Admin Panel (admin-web)

A full-featured operations dashboard:

- 📊 **Dashboard**: DAU, new users, revenue trends, model usage distribution
- 👥 **User Management**: Search, enable/disable, role editing, manual balance adjustment
- 💰 **Finance**: Recharge records, consumption details, revenue stats, report export
- 🔌 **Channel Config**: Multiple LLM providers (Anthropic, OpenAI-compatible, third-party proxies), health monitoring, load balancing
- 🏷️ **Model Management**: Enable/disable models, per-token pricing, channel association
- 🎫 **Marketing Tools**: Discount codes, recharge cards, redemption codes — bulk generation and export
- 🔗 **Referral System**: Referral tracking, commission rules, settlement records, leaderboard
- 🛡️ **Anti-Fraud**: Risk scoring, suspicious account review, blacklist
- 📦 **Version Management**: Release records, forced update policies, staged rollout
- 📝 **Content Management**: Privacy policy, terms of service, in-app announcements

### 🌐 API Backend (api-server)

Production-grade SaaS backend:

- 🔐 **Auth**: Email/password + OAuth (Google, GitHub)
- 💳 **Billing**: Prepaid credits + subscription plans, WeChat/Alipay support
- 🔀 **API Proxy**: OpenAI-compatible + Anthropic direct, rate limiting
- 📈 **Analytics**: User behavior, consumption stats, skill usage
- ☁️ **Cloud Sync**: Bi-directional sync with conflict detection
- 📢 **Notifications**: In-app announcements, version checks, forced updates

### 🏠 Landing Page (landing-web)

- Product showcase and feature highlights
- Registration/login with email verification
- Desktop download links (Mac arm64 / Mac x64 / Windows)
- Referral/invitation system
- Multi-language support (EN/ZH/JA)

---

## 📸 Screenshots

> Screenshots coming soon — Star this repo to stay updated!

---

## 🚀 Quick Start

### Option 1: Download Installer (Recommended)

Go to [Releases](https://github.com/syfssb/CherryAgent/releases):

| Platform | Installer |
|----------|-----------|
| macOS Apple Silicon | `Cherry-Agent-x.x.x-arm64.dmg` |
| macOS Intel | `Cherry-Agent-x.x.x.dmg` |
| Windows | `Cherry-Agent-Setup-x.x.x.exe` |

**Just install and open.** No Claude Code installation needed, no API key configuration, no command line required. Sign up → top up → start using.

### Option 2: Self-Host Backend (Docker)

To run your own backend (user management, billing, API proxy) instead of the official service:

```bash
# 1. Clone
git clone https://github.com/syfssb/CherryAgent.git
cd CherryAgent

# 2. Configure
cp .env.example .env
cp api-server/env.example api-server/.env
# Edit api-server/.env — required: JWT_SECRET, API_KEY_ENCRYPTION_KEY

# 3. Start
docker compose up -d

# 4. Initialize database (first run only)
docker compose exec api npm run db:migrate

# 5. Verify
curl http://localhost:3000/api/health
```

| Service | Port | Description |
|---------|------|-------------|
| API Backend | 3000 | Auth, billing, API proxy |
| Landing Page | 8080 | Registration/download page (optional) |
| PostgreSQL | internal | Data persisted in Docker volume |

<details>
<summary>📦 Build from Source</summary>

**Requirements:**

| Tool | Version |
|------|---------|
| [Bun](https://bun.sh/) | 1.x+ |
| Node.js | 22+ |

> **Note:** You do NOT need to install Claude Code or Codex separately. The SDKs are bundled in the project — `bun install` handles everything.

```bash
git clone https://github.com/syfssb/CherryAgent.git
cd CherryAgent
bun install
bun run rebuild   # Rebuild native modules
bun run dev       # Start dev mode
```

**Build installers:**

```bash
bash scripts/pack-mac.sh     # macOS (must run on Mac)
bash scripts/pack-win.sh     # Windows (cross-compile on Mac)
```

</details>

---

## 🏗️ Project Structure

```
CherryAgent/
├── src/                    # Desktop client source
│   ├── electron/           #   Main process (SDK integration, IPC, auto-update)
│   └── ui/                 #   Renderer process (React + Tailwind)
├── api-server/             # Backend API (Node.js + Drizzle + PostgreSQL)
├── admin-web/              # Admin panel (React + shadcn/ui)
├── landing-web/            # Landing page (Vite + React)
├── packages/core/          # Shared business logic (billing, sync)
├── resources/              # Pre-installed skills, Python runtime
├── scripts/                # Build and packaging scripts
└── docker-compose.yml      # One-click deployment
```

---

## 🔧 Tech Stack

| Module | Technology |
|--------|-----------|
| Desktop | Electron + Vite + React + TypeScript |
| AI Engine | Claude Agent SDK (Anthropic) + Codex SDK (OpenAI) |
| Visualization | ECharts 5 + SVG (Widget System) |
| Backend | Node.js + Hono + Drizzle ORM + PostgreSQL |
| Admin Panel | React + shadcn/ui + TanStack Query |
| Landing Page | Vite + React + i18n |
| Desktop Packaging | electron-builder (macOS DMG + Windows NSIS) |

---

## 🆚 Comparison

| | Cherry Agent | Claude Code | Cursor | Continue |
|---|---|---|---|---|
| **Setup** | Download & run, zero config | CLI install + `claude login` | API key required | IDE plugin required |
| **Interface** | Native desktop GUI | Terminal | IDE | IDE plugin |
| **AI Engine** | Claude + Codex bundled | Claude only | Proprietary | Multi-model, self-config |
| **Skills** | 22+ pre-installed + custom | None | None | Limited |
| **Visualization** | Widget chart system | None | None | None |
| **Billing** | Prepaid + subscription | Per-API billing | Monthly subscription | Per-API billing |
| **Admin Panel** | Full operations dashboard | None | None | None |
| **Open Source** | ✅ Full stack | ❌ | ❌ | ✅ |

---

## 🌟 Star History

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=syfssb/CherryAgent&type=Date&theme=dark">
  <img src="https://api.star-history.com/svg?repos=syfssb/CherryAgent&type=Date" alt="Star History Chart">
</picture>

---

## 🤝 Contributing

Issues and Pull Requests welcome!

- [CONTRIBUTING.md](CONTRIBUTING.md) — Setup and PR process
- [DEVELOPMENT.md](DEVELOPMENT.md) — Architecture decisions and technical details

---

## 📜 License

[Apache-2.0](LICENSE)
