# Repository Atlas: landing-web

## Project Responsibility
Cherry Agent 产品落地页，承担用户注册引流、产品展示、多平台安装包下载、邀请码兑换等功能。基于 React 18 + Vite 构建，通过 Docker + nginx 部署于 Zeabur。

## Technology Stack
- **Framework**: React 18 + TypeScript + Vite
- **Style**: Tailwind CSS
- **i18n**: i18next（中/英/繁/日，浏览器自动检测）
- **Deploy**: Docker + nginx（Zeabur），envsubst 注入 PORT 和 API_UPSTREAM

## System Entry Points
| 文件 | 职责 |
|------|------|
| `src/main.tsx` | React 挂载 + i18n 初始化 |
| `src/App.tsx` | 路由（Landing / Register）+ ThemeProvider |
| `nginx.conf` | 反向代理配置（API 转发 + 静态文件）|
| `docker-entrypoint.sh` | 启动时 envsubst 注入环境变量 |

## Architecture Overview

```
用户访问
  ↓
nginx（静态文件 + /api/* 反代到 API_UPSTREAM）
  ↓
React App（App.tsx 路由）
  ├── /          Landing 页（产品展示 + 下载链接）
  └── /register  Register 页（注册表单 + 邀请码）
        ↓
src/lib/（API 调用：register / getLatestVersion / getWelcomeCredits）
        ↓
api-server
```

## Directory Map

| 目录 | 职责摘要 | 详细地图 |
|------|---------|---------|
| `src/` | 应用入口、路由、ThemeProvider | [查看](src/codemap.md) |
| `src/components/` | 18+ UI 组件（Header/Hero/Footer/FAQ 等）| [查看](src/components/codemap.md) |
| `src/contexts/` | ThemeContext（light/dark + localStorage + 系统偏好）| [查看](src/contexts/codemap.md) |
| `src/i18n/` | 多语言配置（4 语言 + 自动检测）| [查看](src/i18n/codemap.md) |
| `src/lib/` | API 网络层、平台检测（WebGL GPU 识别 arm64）、埋点 | [查看](src/lib/codemap.md) |
| `src/pages/` | Landing（展示页）+ Register（注册 + 邀请码）| [查看](src/pages/codemap.md) |

## Key Details
- **下载链接**：指向腾讯云 COS（香港），加速中国大陆
- **平台检测**：WebGL GPU renderer 识别 Mac Apple Silicon vs Intel
- **邀请系统**：URL `?ref=CODE` 预填邀请码，兑换欢迎奖励（$3）
- **埋点**：`navigator.sendBeacon` fire-and-forget，不阻塞 UI

## How to Update This Map
```bash
cd landing-web
python3 ~/.claude/skills/cartography/scripts/cartographer.py changes --root ./
python3 ~/.claude/skills/cartography/scripts/cartographer.py update --root ./
```
