<div align="center">

<img src="docs/assets/banner.png" alt="Cherry Agent Banner" width="100%" />

# Cherry Agent

**让 AI 成为你真正的桌面助手**

[English](./README_en.md) | **简体中文**

[![license](https://img.shields.io/github/license/syfssb/CherryAgent)](LICENSE)
[![stars](https://img.shields.io/github/stars/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/stargazers)
[![forks](https://img.shields.io/github/forks/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/fork)
[![issues](https://img.shields.io/github/issues/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/issues)

</div>

---

Cherry Agent 是一款**开源 AI 桌面客户端**，把 Claude Code 的强大能力搬到了图形界面里。

Claude Code 只有命令行，不直观；直接调 API 又没有工具调用能力。Cherry Agent 解决这个问题——给你一个真正能**读文件、写代码、搜网页、画流程图**的桌面 AI，而不是聊天框。

> 已有 `claude login`？打开 Cherry Agent 就能用，不需要任何额外配置。

---

## ✨ 功能特性

- 🤖 **双 AI 引擎**：同一界面自由切换 Claude（Anthropic）和 Codex（OpenAI），用最合适的 AI 做每件事
- 🔍 **看见 AI 在做什么**：AI 执行命令、读写文件、搜索网页时，每一步都实时展示，不再是黑盒
- 🎨 **AI 直接画图表**：让 AI 在对话里画流程图、数据图表、架构图，可点击可交互，不用切换工具
- 🧩 **Skills 技能系统**：内置浏览器自动化、前端设计、Office 文档处理等十余个技能，也能自己写插件扩展
- 📁 **文件管理器**：在对话中直接浏览和操作本地文件，不用反复切换窗口
- 🔄 **静默自动更新**：后台下载新版本，准备好了提示你，不打断工作节奏
- 💬 **多会话，历史不丢**：所有对话存在本地，重启不丢，随时翻看
- 🖥️ **Mac + Windows 双平台**：Apple Silicon / Intel / Windows 全支持，开箱即用

---

## 截图

> 截图即将上线，欢迎 Star 关注更新

---

## 🚀 快速开始

### 桌面客户端（推荐）

前往 [Releases](https://github.com/syfssb/CherryAgent/releases) 下载安装包，安装后直接用。

| 平台 | 安装包 |
|------|--------|
| macOS Apple Silicon | `Cherry-Agent-x.x.x-arm64.dmg` |
| macOS Intel | `Cherry-Agent-x.x.x.dmg` |
| Windows | `Cherry-Agent-Setup-x.x.x.exe` |

**前提：** 已安装 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 并完成 `claude login`。

---

### 后端服务 Docker 一键部署

> 用于自托管认证后端和落地页，桌面客户端无需 Docker。

```bash
# 1. 克隆仓库
git clone https://github.com/syfssb/CherryAgent.git
cd CherryAgent

# 2. 配置环境变量
cp api-server/.env.example api-server/.env
# 编辑 api-server/.env，至少填写 JWT_SECRET

# 3. 启动服务
docker compose up -d

# 4. 初始化数据库（首次启动执行一次）
docker compose exec api npm run db:migrate
```

启动后各服务地址：

| 服务 | 地址 | 说明 |
|------|------|------|
| API 后端 | `http://localhost:3000` | 认证、计费、API 代理 |
| 落地页 | `http://localhost:8080` | 官网/下载页（可选，不需要可在 docker-compose.yml 中注释掉） |
| PostgreSQL | 内部 | 仅容器内访问，不对外暴露 |

---

<details>
<summary>📦 手动部署（从源码构建）</summary>

**环境要求：**

| 工具 | 版本 | 说明 |
|------|------|------|
| [Bun](https://bun.sh/) | 1.x+ | 推荐包管理器 |
| Node.js | 22+ | Bun 不可用时备选 |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | 最新版 | AI 运行时，需 `claude login` |

- **macOS：** 需要 Xcode Command Line Tools（`xcode-select --install`）
- **Windows：** 需要 Git for Windows（提供 Claude Code 所需的 bash 环境）

```bash
git clone https://github.com/syfssb/CherryAgent.git
cd CherryAgent
bun install
bun run rebuild   # 重建 native 模块
bun run dev       # 启动开发模式
```

**构建安装包：**

```bash
bun run dist:mac-arm64   # macOS Apple Silicon
bun run dist:mac-x64     # macOS Intel
bun run dist:win         # Windows（可在 macOS 交叉编译）
bun run dist:linux       # Linux
```

</details>

---

## ⚙️ 环境变量说明

### 桌面客户端（`.env`）

| 变量 | 必填 | 说明 |
|------|------|------|
| `AUTH_API_URL` | 否 | 自托管认证后端地址，不填则纯本地运行 |
| `VITE_UPDATE_FEED_URL` | 否 | 自动更新 feed 地址，仅分发构建时需要 |

纯本地使用无需任何配置，开箱即用。

### 后端服务（`api-server/.env`）

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接字符串 |
| `JWT_SECRET` | 是 | JWT 签名密钥，生产环境请用随机字符串 |
| `POSTGRES_PASSWORD` | 否 | Docker 数据库密码（默认 `changeme_in_production`，**生产必改**） |
| `API_PORT` | 否 | API 服务端口（默认 `3000`） |
| `LANDING_PORT` | 否 | 落地页端口（默认 `8080`） |
| `LANDING_URL` | 否 | 落地页公网地址，用于生成邀请链接 |
| `HTTPS_PROXY` | 否 | 国内网络访问 Google OAuth 时设置代理 |

---

## 🌟 Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=syfssb/CherryAgent&type=Date)](https://star-history.com/#syfssb/CherryAgent&Date)

</div>

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

- [CONTRIBUTING.md](CONTRIBUTING.md) — 环境搭建与 PR 流程
- [DEVELOPMENT.md](DEVELOPMENT.md) — 架构设计与技术细节

---

## 📜 License

[Apache-2.0](LICENSE)
