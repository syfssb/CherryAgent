<div align="center">

<img src="docs/assets/banner.png" alt="Cherry Agent Banner" width="100%" />

# Cherry Agent

**A desktop AI assistant that actually gets things done**

**[简体中文](./README.md)** | English

[![license](https://img.shields.io/github/license/syfssb/CherryAgent)](LICENSE)
[![stars](https://img.shields.io/github/stars/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/stargazers)
[![forks](https://img.shields.io/github/forks/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/fork)
[![issues](https://img.shields.io/github/issues/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/issues)

</div>

---

Cherry Agent is an **open-source desktop AI client** that brings Claude Code's full power to a graphical interface.

Claude Code is terminal-only and opaque. Raw API calls lack tool-use capabilities. Cherry Agent bridges the gap — a desktop AI that can **read files, write code, search the web, and draw diagrams**, not just chat.

> Already have `claude login`? Open Cherry Agent and start immediately — zero extra configuration required.

---

## ✨ Features

- 🤖 **Dual AI Engine**: Switch between Claude (Anthropic) and Codex (OpenAI) in the same interface — use the right AI for each task
- 🔍 **See What AI Is Doing**: Every bash command, file read, and web search is shown live — no more black boxes
- 🎨 **AI Draws Charts for You**: Ask AI to draw flowcharts, data charts, or architecture diagrams right in the chat — interactive and clickable
- 🧩 **Skills Plugin System**: Built-in skills for browser automation, frontend design, Office document processing, and more — or write your own
- 📁 **File Manager**: Browse and manage local files directly in the conversation — no more window switching
- 🔄 **Silent Auto-Update**: New versions download in the background and notify you when ready — no workflow interruption
- 💬 **Multi-Session, Persistent History**: All conversations stored locally, nothing lost on restart, browse history anytime
- 🖥️ **Mac + Windows**: Apple Silicon / Intel / Windows — works out of the box

---

## Screenshots

> Screenshots coming soon — Star to follow updates

---

## 🚀 Quick Start

### Desktop Client (Recommended)

Go to [Releases](https://github.com/syfssb/CherryAgent/releases) and download the installer for your platform.

| Platform | Installer |
|----------|-----------|
| macOS Apple Silicon | `Cherry-Agent-x.x.x-arm64.dmg` |
| macOS Intel | `Cherry-Agent-x.x.x.dmg` |
| Windows | `Cherry-Agent-Setup-x.x.x.exe` |

**Prerequisite:** [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated via `claude login`.

---

### Backend Services — Docker Deploy

> For self-hosting the auth backend and landing page. The desktop client does not require Docker.

```bash
# 1. Clone the repo
git clone https://github.com/syfssb/CherryAgent.git
cd CherryAgent

# 2. Configure environment variables
cp api-server/.env.example api-server/.env
# Edit api-server/.env — at minimum set JWT_SECRET

# 3. Start services
docker compose up -d

# 4. Initialize the database (first run only)
docker compose exec api npm run db:migrate
```

Services after startup:

| Service | Address | Notes |
|---------|---------|-------|
| API backend | `http://localhost:3000` | Auth, billing, API proxy |
| Landing page | `http://localhost:8080` | Download page (optional — comment out in docker-compose.yml if not needed) |
| PostgreSQL | Internal | Not exposed externally, container-only |

---

<details>
<summary>📦 Manual Deploy (Build from Source)</summary>

**Requirements:**

| Tool | Version | Notes |
|------|---------|-------|
| [Bun](https://bun.sh/) | 1.x+ | Recommended package manager |
| Node.js | 22+ | Fallback if Bun unavailable |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Latest | AI runtime, requires `claude login` |

- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** Git for Windows (provides the bash shell required by Claude Code)

```bash
git clone https://github.com/syfssb/CherryAgent.git
cd CherryAgent
bun install
bun run rebuild   # Rebuild native modules
bun run dev       # Start development mode
```

**Build Installers:**

```bash
bun run dist:mac-arm64   # macOS Apple Silicon
bun run dist:mac-x64     # macOS Intel
bun run dist:win         # Windows (cross-compile from macOS)
bun run dist:linux       # Linux
```

</details>

---

## ⚙️ Configuration

### Desktop Client (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_API_URL` | No | Self-hosted auth backend URL. Omit for local-only use. |
| `VITE_UPDATE_FEED_URL` | No | Auto-update feed URL. Only needed for distributing builds. |

For local use, no variables are required — works out of the box.

### Backend Services (`api-server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | JWT signing secret — use a random string in production |
| `POSTGRES_PASSWORD` | No | Docker database password (default: `changeme_in_production` — **change in production**) |
| `API_PORT` | No | API server port (default: `3000`) |
| `LANDING_PORT` | No | Landing page port (default: `8080`) |
| `LANDING_URL` | No | Public URL of the landing page, used to generate invite links |
| `HTTPS_PROXY` | No | HTTP proxy for Google OAuth (required in mainland China) |

---

## 🌟 Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=syfssb/CherryAgent&type=Date)](https://star-history.com/#syfssb/CherryAgent&Date)

</div>

---

## 🤝 Contributing

Issues and pull requests are welcome!

- [CONTRIBUTING.md](CONTRIBUTING.md) — environment setup and PR workflow
- [DEVELOPMENT.md](DEVELOPMENT.md) — architecture decisions and technical deep-dives

---

## 📜 License

[Apache-2.0](LICENSE)
