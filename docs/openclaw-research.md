# OpenClaw 竞品研究报告

> 调研时间：2026-03-09
> 来源：GitHub、官方文档、Wikipedia、TechCrunch、CrowdStrike、Kaspersky 等

---

## 一、项目概览

| 字段 | 内容 |
|------|------|
| 项目名称 | OpenClaw（曾用名：Clawdbot → Moltbot → OpenClaw） |
| 创始人 | Peter Steinberger（奥地利开发者，PSPDFKit 创始人） |
| 首次发布 | 2025 年 11 月 |
| 许可证 | MIT（完全免费开源，允许商业使用） |
| GitHub Stars | 283k+（截至 2026-03-09） |
| GitHub Forks | 53.9k+ |
| 官方网站 | https://openclaw.ai |
| GitHub | https://github.com/openclaw/openclaw |
| 文档 | https://docs.openclaw.ai |
| 社区 | Discord: discord.gg/clawd |

### 一句话定位

**"运行在你自己设备上的全平台 AI 个人助理 + 自治智能体"** —— 通过消息平台（WhatsApp、Telegram、Slack 等 20+ 渠道）与 AI 交互，支持自主执行任务、浏览器控制、文件操作、定时自动化。

---

## 二、发展历史

| 时间 | 事件 |
|------|------|
| 2025-04 | Peter Steinberger 回归编程，尝试用 AI 构建 Twitter 分析工具，发现 AI 范式转变 |
| 2025-11 | 以 **Clawdbot** 名称首次发布（名字源于 Anthropic 的 Claude + Claw 谐音） |
| 2026-01-27 | 因 Anthropic 商标投诉，更名为 **Moltbot**（龙虾蜕壳主题） |
| 2026-01-30 | 再次更名为 **OpenClaw**（Moltbot 不好发音） |
| 2026-01 末 | 与 Moltbook（AI 社交网络）同期爆火，一周内 200 万访问量 |
| 2026-02-14 | Steinberger 宣布加入 **OpenAI**，OpenClaw 移交**开源基金会** |
| 2026-03-02 | GitHub 247k stars，47.7k forks |
| 2026-03-08 | 深圳龙岗区 AI 局发布 OpenClaw 支持政策征求意见稿 |

### 创始人背景

Peter Steinberger 是 PSPDFKit（iOS PDF 工具包）创始人，经营 13 年后以约 1 亿美元退出。退休 5 年后因 AI 范式转变重返编程。他明确表示"不想再造一家大公司"，选择加入 OpenAI 是为了"最快速度让技术惠及所有人"。OpenAI 将提供资金支持基金会，但不会拥有代码。

---

## 三、核心功能与特性

### 3.1 多渠道消息集成（20+ 平台）

支持的消息平台：

| 平台 | 底层 SDK |
|------|---------|
| WhatsApp | Baileys |
| Telegram | grammY |
| Slack | Bolt |
| Discord | discord.js |
| Signal | signal-cli |
| iMessage | BlueBubbles |
| Google Chat | Chat API |
| Microsoft Teams | Teams API |
| Matrix | Matrix SDK |
| 飞书（Feishu） | 飞书 API |
| LINE | LINE SDK |
| IRC、Mattermost、Nostr、Twitch、Zalo 等 | 各自原生 SDK |

一个 OpenClaw 实例可同时服务所有渠道，每个渠道有独立会话隔离。

### 3.2 自治智能体能力

- **主动唤醒（Heartbeat）**：不同于传统 AI 只在被提问时响应，OpenClaw 可以主动监控、定时执行任务
- **持久记忆**：跨会话的上下文记忆，配置和对话历史存储在本地
- **计算机控制**：系统命令执行、文件系统操作、浏览器自动化（Chrome DevTools Protocol）
- **多智能体路由**：多个独立 Agent 隔离工作区，互不干扰
- **语音功能**：macOS/iOS 上支持 Voice Wake + Talk Mode，Android 支持持续语音

### 3.3 Skills 生态

- **内置 Skills**：bash 命令、浏览器控制、文件操作等
- **社区 Skills（ClawHub）**：超过 10,000+ 第三方 skills
- **工作区级自定义 Skills**：用户可编写专属 skills
- 100+ 预配置 AgentSkills：shell 命令、文件系统管理、Web 自动化等

### 3.4 模型无关

- 支持所有 OpenAI 兼容 API 的模型
- 原生支持：Anthropic Claude、OpenAI GPT、Google Gemini、Moonshot/Kimi、Qwen、DeepSeek
- 支持本地模型（通过 Ollama 运行 Llama 4、Kimi 2.5 等）
- **BYOK（Bring Your Own Key）**：用户自带 API Key，无厂商锁定
- 官方推荐 `claude-opus-4-6` 用于长上下文和 prompt injection 防护

### 3.5 其他特性

- **Live Canvas**：Agent 驱动的可视化工作区（A2UI 集成）
- **设备节点**：可配对 iOS/Android 设备执行本地操作
- **SSH 隧道 / Tailscale Serve/Funnel**：远程访问 Gateway
- **Doctor 命令**：安全审计工具

---

## 四、技术架构

### 4.1 核心运行时

```
┌─────────────────────────────────────────────┐
│                  Gateway                     │
│  (WebSocket 控制平面 ws://127.0.0.1:18789)  │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Channel  │  │ Channel  │  │ Channel  │  │
│  │ WhatsApp │  │ Telegram │  │  Slack   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       └──────────────┼──────────────┘        │
│                      │                       │
│              ┌───────▼───────┐               │
│              │  Session Mgr  │               │
│              │  + Routing    │               │
│              └───────┬───────┘               │
│                      │                       │
│              ┌───────▼───────┐               │
│              │   AI Model    │               │
│              │   Provider    │               │
│              └───────────────┘               │
└─────────────────────────────────────────────┘
```

- **语言**：TypeScript/JavaScript（ESM-only）
- **运行时**：Node.js >= 22
- **包管理器**：pnpm（开发）/ npm / bun
- **测试框架**：Vitest
- **架构核心**：Gateway 是单一 WebSocket 控制平面，所有消息通过 Gateway 路由

### 4.2 插件系统

四类插件扩展点：

1. **Channel 插件**：添加新的消息平台
2. **Memory 插件**：替换默认 SQLite 为向量存储/知识图谱
3. **Tool 插件**：自定义能力（超越内置的 bash/browser/file）
4. **Provider 插件**：自定义 LLM 提供者或自托管模型

插件加载器位于 `src/plugins/loader.ts`，扫描 `package.json` 的 `openclaw.extensions` 字段，支持热加载。

### 4.3 性能指标

| 环节 | 延迟 |
|------|------|
| 访问控制 | < 10ms |
| 会话磁盘加载 | < 50ms |
| System Prompt 组装 | < 100ms |
| 模型首 token | 200-500ms |
| Bash 工具执行 | < 100ms |
| 浏览器自动化 | 1-3s |

### 4.4 内存占用

| 组件 | 内存 |
|------|------|
| Gateway 基础 | ~300MB |
| 每个活跃渠道 | +~100MB |
| 每个 WebSocket 客户端 | +~10MB |
| 每个沙箱容器 | +256MB-1GB |

### 4.5 部署方式

- 直接在 Node.js 环境运行（无需 Docker/K8s）
- Docker 支持
- Nix 声明式配置
- DigitalOcean 1-Click 部署
- Cloudflare Workers（Moltworker 项目）
- NEAR AI Cloud（安全飞地部署）

---

## 五、目标用户群体

### 5.1 主要用户

1. **技术爱好者/独立开发者**：对自托管、隐私、自定义有强需求
2. **远程工作者/自由职业者**：需要跨平台 AI 助手管理日常事务
3. **中小型团队**：通过 Discord/Slack 集成实现团队级 AI 自动化
4. **隐私敏感用户**：数据完全本地化，不上传第三方服务器

### 5.2 不适合的用户

1. **技术小白**：安装配置需要 30-60 分钟，需要 Node.js 环境知识
2. **企业级用户**：安全风险高（见下方安全问题部分），缺乏企业治理能力
3. **纯编程场景**：不如 Claude Code / Cursor 等专业编码工具

### 5.3 地域分布

- 硅谷公司和中国企业均有采用
- 已适配 DeepSeek 模型和中国消息应用
- 百度计划在其手机 App 中直接集成 OpenClaw
- 深圳龙岗区 AI 局已发布支持政策

---

## 六、使用场景

| 场景 | 具体用途 |
|------|---------|
| 个人生活助手 | 通过 WhatsApp/Telegram 管理日程、提醒、邮件 |
| 自动化工作流 | 定时爬取数据、发送报告、监控网站变化 |
| 编码助手 | 通过 Discord 下达任务，AI 自主编写代码并部署 |
| 客服自动化 | 连接多个消息渠道，自动回复客户问题 |
| 内容创作 | 生成文案、翻译、社交媒体管理 |
| 数据分析 | 自然语言查询数据库、生成报表 |
| 浏览器自动化 | 自动填表、网页抓取、截图 |
| 多智能体协作 | 多个 Agent 分工合作完成复杂任务 |

---

## 七、定价模式

### 7.1 软件费用

**完全免费**。MIT 许可证，无功能限制，无用户限制，无厂商锁定，允许商业使用。

### 7.2 实际运营成本

| 成本项 | 范围 | 说明 |
|--------|------|------|
| 主机/服务器 | $0-40/月 | Oracle 免费层 $0；Hetzner VPS $4/月；AWS t3.medium $30-40/月 |
| AI API | $1-150/月 | 最大变量。GPT-4o-mini 1000 次交互约 $0.45；GPT-4o 约 $7.50 |
| 本地模型 | $0 | 通过 Ollama 运行 Kimi 2.5 / Llama 4 等完全免费 |
| 存储增长 | $2-5/月 | JSONL 日志和 Markdown 记忆文件积累 |
| 备份 | $0-6/月 | 每周备份通常免费，每日备份约 $6/月 |

### 7.3 总成本估算

| 使用场景 | 月成本 |
|---------|--------|
| 完全免费方案 | $0（Oracle 免费层 + 本地模型） |
| 个人/轻度使用 | $6-13 |
| 小型企业 | $25-50 |
| 团队使用 | $50-100 |
| 重度自动化 | $200+ |

### 7.4 托管服务

| 服务商 | 月费 | 说明 |
|--------|------|------|
| ClawHosted | $49 | 企业级托管 |
| ClickClaw | $20 | 独立 VPS + 7 个 AI 模型 |
| DigitalOcean 1-Click | $24-48 | 预配置 VPS，需自行管理更新 |
| Elestio | $24-48 | 类似 DigitalOcean |

### 7.5 商业赞助

项目赞助商包括：OpenAI、Vercel、Blacksmith、Convex（OAuth 订阅）。

---

## 八、生态系统

| 项目 | 说明 |
|------|------|
| [OpenClaw Studio](https://github.com/grp06/openclaw-studio) | Web 管理面板，连接 Gateway、管理 Agent |
| [ClawWork](https://github.com/HKUDS/ClawWork) | AI Agent 基准测试（220 个专业任务，44 个行业） |
| [OpenClaw-RL](https://github.com/Gen-Verse/OpenClaw-RL) | 强化学习框架，将日常对话转化为训练信号 |
| [Moltworker](https://github.com/cloudflare/moltworker) | 在 Cloudflare Workers 上运行 OpenClaw |
| [awesome-openclaw](https://github.com/rohitg00/awesome-openclaw) | 80+ 策展项目的生态目录 |
| ClawHub | 社区 Skills 市场（10,000+ skills） |

---

## 九、安全问题（重大风险）

### 9.1 CVE 漏洞清单

OpenClaw 在 2026 年初连续爆出多个严重安全漏洞：

| CVE 编号 | CVSS | 类型 | 影响 |
|----------|------|------|------|
| CVE-2026-25253 | 8.8 | Token 窃取 → RCE | 一键远程代码执行，通过 URL 参数窃取认证 token |
| CVE-2026-28446 | 9.8 | 语音扩展预认证 RCE | 无需认证，发送恶意音频即获得 shell 访问 |
| CVE-2026-28458 | - | 浏览器中继未认证 WS | 网站可连接本地 loopback 窃取 session cookies |
| CVE-2026-28466 | - | 审批旁路 | 绕过 exec 审批网关直接执行系统命令 |
| CVE-2026-28468 | - | 沙箱浏览器桥认证绕过 | 本地攻击者访问浏览器控制端点 |
| CVE-2026-24763 | - | 命令注入 | - |
| CVE-2026-25157 | - | 命令注入 | - |
| CVE-2026-27487 | - | macOS Keychain 命令注入 | 通过 keychain 集成执行命令 |

### 9.2 ClawHub 供应链攻击（"ClawHavoc"）

- Koi Security 审计 ClawHub 2,857 个 skills，发现 **341 个恶意 skills**，其中 335 个来自同一协调行动
- 扩展扫描后发现 **824+ 恶意 skills**（总计 10,700+ skills）
- Bitdefender 确认约 **20% 的深度分析包含恶意载荷**
- 恶意 skills 传播 Atomic Stealer（macOS 信息窃取器）
- RedLine 和 Lumma 信息窃取器已将 OpenClaw 文件路径加入必窃列表

### 9.3 暴露面

- 2026-01 末，Censys 追踪到公网暴露实例从 ~1,000 增长到 **21,000+**
- Bitsight 观察到 **30,000+** 暴露实例
- 独立研究者发现 **42,665 个暴露实例**，其中 5,194 个已验证存在漏洞
- **93.4%** 暴露实例存在认证绕过条件

### 9.4 架构性安全弱点

- **认证默认关闭**
- WebSocket 连接不验证来源
- localhost 连接隐式信任
- Guest Mode 下多个危险工具可访问
- 配置、记忆、聊天日志中 API Key 和密码明文存储
- mDNS 广播泄露关键配置参数

### 9.5 最低安全版本

**2026.2.26 或更高版本**是当前最低可接受部署版本。任何更早版本至少存在一个 Critical CVE。

---

## 十、优势与劣势

### 10.1 优势

1. **完全开源免费**：MIT 许可证，无任何功能限制
2. **隐私优先**：数据完全本地化，不上传第三方服务器
3. **模型无关**：BYOK 模式，支持几乎所有主流 AI 模型
4. **多渠道集成**：20+ 消息平台，一个实例服务所有渠道
5. **自治能力**：Heartbeat 主动唤醒，不需要人类发起对话
6. **庞大社区**：283k+ stars，活跃的贡献者生态和 Skills 市场
7. **低成本**：可以 $0 运行（免费层 + 本地模型）
8. **跨平台**：macOS、Linux、Windows（WSL2）、iOS、Android
9. **可扩展**：插件系统支持 Channel/Memory/Tool/Provider 四类扩展
10. **基金会治理**：已移交开源基金会，OpenAI 资金支持但不拥有代码

### 10.2 劣势

1. **安全问题严重**：2026 年初连续爆出多个 Critical CVE，供应链攻击泛滥
2. **配置复杂**：安装需 30-60 分钟，需要 Node.js 22+ 环境
3. **企业治理缺失**：不适合企业级部署，缺乏审计/合规/RBAC
4. **Skills 市场不安全**：20% 深度分析的第三方 skills 含恶意载荷
5. **API 成本不可控**：无监控的自动化可能导致成本飙升 10-30%
6. **编码能力弱于专业工具**：不如 Claude Code（代码重构）或 Cursor（IDE 集成）
7. **默认配置不安全**：认证默认关闭，密钥明文存储
8. **维护成本**：自托管需要持续维护、升级、备份
9. **创始人离开**：Steinberger 加入 OpenAI 后项目转入基金会，长期维护存疑

---

## 十一、与竞品对比

### 11.1 与 Cherry Agent 的差异定位

| 维度 | OpenClaw | Cherry Agent |
|------|----------|--------------|
| 定位 | 通用 AI 生活助手 + 自治智能体 | 专业 AI 编程助手（桌面端） |
| 交互方式 | 消息平台（WhatsApp/Telegram 等） | 独立桌面应用（Electron） |
| 核心场景 | 日常事务自动化、多渠道消息 | 代码编写、项目管理、开发工作流 |
| 安全性 | 多个 Critical CVE，供应链攻击 | 受控桌面环境，相对安全 |
| 目标用户 | 技术爱好者、自托管用户 | 专业开发者、团队 |
| 商业模式 | 免费 + BYOK | 订阅制 + 托管服务 |
| 部署方式 | 自托管（VPS/本地） | 下载安装即用 |
| 上手难度 | 高（30-60 分钟配置） | 低（下载即用） |

### 11.2 与 Claude Code 的对比

| 维度 | OpenClaw | Claude Code |
|------|----------|-------------|
| 核心能力 | 通用任务自动化 | 深度代码理解与重构 |
| 代码质量 | 一般（通用 Agent） | 优秀（Opus 4.6 推理 + Context Compaction） |
| 自治性 | 强（fire-and-forget） | 中（需在终端交互） |
| 隐私 | 完全本地 | 依赖 Anthropic API |
| 模型灵活性 | 高（任意模型） | 低（仅 Anthropic） |

### 11.3 与 Cursor 的对比

| 维度 | OpenClaw | Cursor |
|------|----------|--------|
| 产品形态 | 命令行 + 消息平台 | IDE（VS Code fork） |
| 安装便捷性 | 复杂（30-60 分钟） | 简单（5 分钟） |
| 编码体验 | 非实时（任务式） | 实时（内联补全、对话） |
| 使用场景 | 泛化（生活+工作） | 专注编码 |
| 月费 | $0-200（取决于使用） | $0-200（订阅层级） |

---

## 十二、对 Cherry Agent 的启示

### 12.1 可借鉴的方面

1. **多渠道消息集成思路**：Cherry Agent 未来可考虑与微信/钉钉/飞书等国内平台集成
2. **Skills/Plugin 生态**：建立安全可审计的技能市场
3. **Heartbeat 机制**：主动式 AI 助手能力（定时检查项目状态、自动生成报告）
4. **BYOK 模式**：用户自带 API Key 的灵活性受到市场欢迎
5. **社区驱动增长**：开源 + 病毒式传播的成功经验

### 12.2 需要规避的问题

1. **安全第一**：OpenClaw 的安全灾难是最大教训。认证必须默认开启，Skills 必须有安全审计
2. **供应链安全**：第三方插件/技能必须有严格审核机制
3. **企业治理**：提供 RBAC、审计日志、合规支持，瞄准企业用户
4. **简化上手体验**：降低配置门槛，提供开箱即用体验
5. **可控成本**：提供明确的定价和用量监控，避免用户成本失控

---

## 十三、关键数据总结

- **283k+ GitHub Stars**（2026-03 史上增长最快的开源项目之一）
- **200 万周访问**（爆火期）
- **20+ 消息平台**集成
- **10,000+ 社区 Skills**（但 20% 深度分析含恶意载荷）
- **42,000+ 公网暴露实例**（安全风险巨大）
- **9+ 个 CVE 漏洞**（2026 年初集中爆发）
- **完全免费**，实际运营 $0-200+/月
- 创始人已加入 OpenAI，项目移交开源基金会

---

## 参考来源

- [GitHub - openclaw/openclaw](https://github.com/openclaw/openclaw)
- [OpenClaw - Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)
- [Introducing OpenClaw - 官方博客](https://openclaw.ai/blog/introducing-openclaw)
- [OpenClaw creator joins OpenAI - TechCrunch](https://techcrunch.com/2026/02/15/openclaw-creator-peter-steinberger-joins-openai/)
- [What Security Teams Need to Know - CrowdStrike](https://www.crowdstrike.com/en-us/blog/what-security-teams-need-to-know-about-openclaw-ai-super-agent/)
- [Key OpenClaw Risks - Kaspersky](https://www.kaspersky.com/blog/moltbot-enterprise-risk-management/55317/)
- [OpenClaw Architecture Explained](https://ppaolo.substack.com/p/openclaw-system-architecture-overview)
- [OpenClaw Deploy Cost Guide](https://yu-wenhao.com/en/blog/2026-02-01-openclaw-deploy-cost-guide/)
- [Every OpenClaw CVE Explained - MintMCP](https://www.mintmcp.com/blog/openclaw-cve-explained)
- [OpenClaw vs Claude Code - DataCamp](https://www.datacamp.com/blog/openclaw-vs-claude-code)
- [OpenClaw vs Cursor vs Claude Code - SkyWork](https://skywork.ai/blog/ai-agent/openclaw-vs-cursor-claude-code-windsurf-comparison/)
- [The OpenClaw Security Crisis - Conscia](https://conscia.com/blog/the-openclaw-security-crisis/)
- [Beware of Fake OpenClaw Installers - Security Boulevard](https://securityboulevard.com/2026/03/beware-of-fake-openclaw-installers-even-if-bing-points-you-to-github/)
