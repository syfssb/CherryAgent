<div align="center">

<!-- <img src="docs/assets/banner.png" alt="Cherry Agent Banner" width="100%" /> -->

# 🍒 Cherry Agent

**开箱即用的 Claude Code 桌面版 —— 不需要装任何命令行工具**

[English](./README_en.md) | **简体中文**

[![license](https://img.shields.io/github/license/syfssb/CherryAgent)](LICENSE)
[![stars](https://img.shields.io/github/stars/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/stargazers)
[![forks](https://img.shields.io/github/forks/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/fork)
[![issues](https://img.shields.io/github/issues/syfssb/CherryAgent)](https://github.com/syfssb/CherryAgent/issues)

</div>

---

## 这是什么？

Cherry Agent 是一个**开源的 AI 编程桌面客户端**，把 Claude Code 的全部能力搬进了图形界面。

**核心卖点：下载安装就能用。** 不需要你自己装 Claude Code CLI，不需要跑 `npm install`，不需要 `claude login`。Claude Agent SDK 和 Codex SDK 都**内置在安装包里**，打开就是完整的 AI 编程环境。

市面上大多数同类产品（Cursor 要配 API Key，Continue 要装 IDE 插件，Claude Code 本身是命令行）都需要用户有一定技术基础才能上手。Cherry Agent 的目标是：**让不会用命令行的人也能用上 Claude Code 级别的 AI 编程能力。**

> 面向 Claude Code 小白用户的开箱即用 SaaS 产品，模仿官方 Cowork 开发。

---

## ✨ 产品亮点

### 🖥️ 桌面客户端

- 🚀 **开箱即用**：内置 Claude Agent SDK + Codex SDK，下载安装直接用，零配置
- 🤖 **双 AI 引擎**：Claude（Anthropic）和 Codex（OpenAI）自由切换，同一界面用最合适的模型
- 🔍 **全程透明**：AI 执行命令、读写文件、搜索网页，每一步实时展示——不是黑盒聊天
- 🎨 **AI 画图表**：对话中直接生成流程图、数据图表、架构图（ECharts + SVG），可交互可放大
- 🧩 **技能系统**：预装 22+ 实用技能（浏览器自动化、前端设计、文档处理等），支持自定义扩展
- 📁 **文件管理器**：在对话中浏览和操作本地文件，拖拽加载上下文，不用切换窗口
- 🧠 **记忆系统**：AI 自动学习你的代码风格和偏好，越用越懂你
- ☁️ **云同步**：会话、记忆、技能、设置多设备同步（可选，默认纯本地）
- 💬 **多会话管理**：无限会话，标签分类，全文搜索，重启不丢历史
- 🔒 **权限控制**：AI 执行敏感操作前必须经你确认，三种权限模式可选
- 🔄 **静默自动更新**：后台下载新版本，准备好了提示你，不打断工作
- 🖥️ **跨平台**：macOS（Apple Silicon / Intel）+ Windows，开箱即用

### 🛠️ 后台管理系统（admin-web）

完整的运营管理后台，不是玩具：

- 📊 **数据仪表板**：DAU、新增用户、收入趋势、模型使用分布
- 👥 **用户管理**：搜索、禁用/启用、角色编辑、余额手动调整
- 💰 **财务管理**：充值记录、消费明细、收入统计、财务报表导出
- 🔌 **渠道配置**：多 LLM 渠道接入（Anthropic、OpenAI 兼容源、第三方代理），健康监控、负载均衡
- 🏷️ **模型管理**：启用/禁用模型、定价配置（input/output token 单独定价）、渠道关联
- 🎫 **营销工具**：折扣码、充值卡、兑换码批量生成导出
- 🔗 **分销系统**：推荐关系管理、佣金规则、结算记录、排行榜
- 🛡️ **反欺诈**：风险评分、可疑账户审核、黑名单
- 📦 **版本管理**：发布记录、强制更新策略、灰度发布
- 📝 **内容管理**：隐私政策、服务条款、应用内公告

### 🌐 API 后端（api-server）

生产级 SaaS 后端，支撑整个业务闭环：

- 🔐 **认证**：邮箱密码 + OAuth（Google、GitHub）
- 💳 **计费**：积分预充值 + 期卡订阅混合模式，支持微信/支付宝
- 🔀 **API 代理**：OpenAI 兼容接口 + Anthropic 直连，速率限制
- 📈 **分析**：用户行为记录、消费统计、技能使用率
- ☁️ **云同步**：会话/记忆/技能/设置双向同步，冲突检测
- 📢 **通知**：应用内公告、版本检查、强制更新

### 🏠 Landing 页面（landing-web）

- 产品介绍和功能展示
- 注册/登录（邮箱验证）
- 桌面端下载引导（Mac arm64 / Mac x64 / Windows）
- 邀请码分销系统
- 多语言支持（中/英/日）

---

## 📸 截图

> 截图即将上线，欢迎 Star 关注更新

---

## 🚀 快速开始

### 方式一：下载安装包（推荐）

前往 [Releases](https://github.com/syfssb/CherryAgent/releases) 下载：

| 平台 | 安装包 |
|------|--------|
| macOS Apple Silicon | `Cherry-Agent-x.x.x-arm64.dmg` |
| macOS Intel | `Cherry-Agent-x.x.x.dmg` |
| Windows | `Cherry-Agent-Setup-x.x.x.exe` |

**安装后直接打开就能用**，不需要装 Claude Code，不需要配 API Key，不需要任何命令行操作。注册账号 → 充值 → 开始使用。

### 方式二：部署后端服务（Docker）

如果你想自己搭建后端（用户管理、计费、API 代理），而不是用官方服务：

```bash
# 1. 克隆仓库
git clone https://github.com/syfssb/CherryAgent.git
cd CherryAgent

# 2. 配置环境变量
cp .env.example .env
cp api-server/env.example api-server/.env
# 编辑 api-server/.env，必填：JWT_SECRET、API_KEY_ENCRYPTION_KEY

# 3. 启动所有服务
docker compose up -d

# 4. 首次启动执行数据库迁移
docker compose exec api npm run db:migrate

# 5. 验证
curl http://localhost:3000/api/health
```

| 服务 | 端口 | 说明 |
|------|------|------|
| API 后端 | 3000 | 认证、计费、API 代理 |
| 落地页 | 8080 | 注册/下载页（可选） |
| PostgreSQL | 内部 | 数据持久化在 Docker volume |

<details>
<summary>📦 从源码构建桌面端</summary>

**环境要求：**

| 工具 | 版本 |
|------|------|
| [Bun](https://bun.sh/) | 1.x+ |
| Node.js | 22+ |

> **注意：** 不需要自己安装 Claude Code 或 Codex。SDK 已内置在项目中，`bun install` 后即可使用。

```bash
git clone https://github.com/syfssb/CherryAgent.git
cd CherryAgent
bun install
bun run rebuild   # 重建 native 模块
bun run dev       # 启动开发模式
```

**打包安装包：**

```bash
bash scripts/pack-mac.sh     # macOS（需在 Mac 上运行）
bash scripts/pack-win.sh     # Windows（可在 Mac 上交叉编译）
```

</details>

---

## 🏗️ 项目结构

```
CherryAgent/
├── src/                    # 桌面端源码
│   ├── electron/           #   主进程（SDK 集成、IPC、自动更新）
│   └── ui/                 #   渲染进程（React + Tailwind）
├── api-server/             # 后端 API（Node.js + Drizzle + PostgreSQL）
├── admin-web/              # 后台管理系统（React + shadcn/ui）
├── landing-web/            # 落地页/官网（Vite + React）
├── packages/core/          # 共享业务逻辑（计费、同步）
├── resources/              # 预装技能、Python 运行时
├── scripts/                # 构建和打包脚本
└── docker-compose.yml      # 一键部署
```

---

## 🔧 技术栈

| 模块 | 技术 |
|------|------|
| 桌面端 | Electron + Vite + React + TypeScript |
| AI 引擎 | Claude Agent SDK (Anthropic) + Codex SDK (OpenAI) |
| 图表渲染 | ECharts 5 + SVG（Widget 系统） |
| 后端 | Node.js + Hono + Drizzle ORM + PostgreSQL |
| 管理后台 | React + shadcn/ui + TanStack Query |
| 落地页 | Vite + React + i18n |
| 桌面打包 | electron-builder（macOS DMG + Windows NSIS） |

---

## 🆚 与同类产品对比

| | Cherry Agent | Claude Code | Cursor | Continue |
|---|---|---|---|---|
| **上手门槛** | 下载即用，零配置 | 需装 CLI + `claude login` | 需配 API Key | 需装 IDE 插件 |
| **界面** | 原生桌面 GUI | 命令行 | IDE | IDE 插件 |
| **AI 引擎** | Claude + Codex 内置 | 仅 Claude | 自有模型 | 多模型但需自配 |
| **技能扩展** | 22+ 预装 + 自定义 | 无 | 无 | 有限 |
| **可视化** | Widget 图表系统 | 无 | 无 | 无 |
| **计费** | 预充值 + 期卡 | 按 API 结算 | 月订阅 | 按 API 结算 |
| **后台管理** | 完整运营后台 | 无 | 无 | 无 |
| **国内友好** | 微信/支付宝、国内 CDN | 海外为主 | 需科学上网 | 需科学上网 |
| **开源** | ✅ 全栈开源 | ❌ | ❌ | ✅ |

---

## 🌟 Star History

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=syfssb/CherryAgent&type=Date&theme=dark">
  <img src="https://api.star-history.com/svg?repos=syfssb/CherryAgent&type=Date" alt="Star History Chart">
</picture>

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

- [CONTRIBUTING.md](CONTRIBUTING.md) — 环境搭建与 PR 流程
- [DEVELOPMENT.md](DEVELOPMENT.md) — 架构决策与技术细节

---

## 📜 License

[Apache-2.0](LICENSE)
