# Repository Atlas: admin-web

## Project Responsibility
Cherry Agent 管理后台，提供用户管理、财务管理、LLM 渠道配置、模型定价、营销工具、反欺诈、内容管理等运营功能。基于 React 18 + React Query + Zustand + shadcn/ui 构建。

## Technology Stack
- **Framework**: React 18 + TypeScript + Vite
- **State**: Zustand（持久化）+ React Query（服务端状态）
- **UI**: Tailwind CSS + shadcn/ui + Recharts（图表）
- **Router**: React Router v6
- **API**: 统一 request<T>() 客户端，自动 token 注入

## System Entry Points
| 文件 | 职责 |
|------|------|
| `src/main.tsx` | React 挂载入口 |
| `src/App.tsx` | 路由配置，ProtectedRoute 守卫 |
| `src/store/` | Zustand 全局状态（admin/token/theme/sidebar）|
| `src/services/` | 20+ API 调用模块 |

## Architecture Overview

```
src/App.tsx（路由 + ProtectedRoute 守卫）
  ↓
AdminLayout（侧边栏 + 顶栏 + 内容区）
  ↓
页面组件（src/pages/）
  ↓
React Query（useQuery / useMutation）
  ↓
services/（request<T>() 统一客户端）
  ↓
api-server REST API
```

## Directory Map

### 基础层
| 目录 | 职责摘要 | 详细地图 |
|------|---------|---------|
| `src/` | 应用入口、路由配置、ProtectedRoute | [查看](src/codemap.md) |
| `src/components/` | UI 组件库总览 | [查看](src/components/codemap.md) |
| `src/components/layout/` | AdminLayout 页面框架（侧边栏/顶栏）| [查看](src/components/layout/codemap.md) |
| `src/components/ui/` | shadcn/ui 原子组件库 | [查看](src/components/ui/codemap.md) |
| `src/hooks/` | 7 个通用 Hooks（防抖/本地存储/响应式）| [查看](src/hooks/codemap.md) |
| `src/lib/` | 工具函数（格式化/映射/导出）| [查看](src/lib/codemap.md) |
| `src/services/` | 20+ API 调用模块 | [查看](src/services/codemap.md) |
| `src/store/` | Zustand 全局状态 | [查看](src/store/codemap.md) |
| `src/types/` | TypeScript 类型定义 | [查看](src/types/codemap.md) |
| `src/constants/` | Provider 常量和全局配置 | [查看](src/constants/codemap.md) |

### 页面层
| 目录 | 职责摘要 | 详细地图 |
|------|---------|---------|
| `src/pages/dashboard/` | 仪表板（KPI 卡片、收入图表、活跃用户趋势）| [查看](src/pages/dashboard/codemap.md) |
| `src/pages/users/` | 用户管理（搜索、禁用、角色编辑、余额调整）| [查看](src/pages/users/codemap.md) |
| `src/pages/finance/` | 财务管理（充值/消费/收入/提现记录）| [查看](src/pages/finance/codemap.md) |
| `src/pages/channels/` | LLM 渠道配置（多提供商、健康监控、负载均衡）| [查看](src/pages/channels/codemap.md) |
| `src/pages/models/` | 模型配置（启用禁用、定价、渠道关联）| [查看](src/pages/models/codemap.md) |
| `src/pages/marketing/` | 营销工具（折扣码/充值卡/兑换码/批量生成）| [查看](src/pages/marketing/codemap.md) |
| `src/pages/referrals/` | 分销系统（推荐关系、佣金结算）| [查看](src/pages/referrals/codemap.md) |
| `src/pages/skills/` | 自定义技能（多语言编辑、外部市场集成）| [查看](src/pages/skills/codemap.md) |
| `src/pages/settings/` | 系统设置（API/支付/邮件/认证/内容配置）| [查看](src/pages/settings/codemap.md) |
| `src/pages/fraud/` | 反欺诈（风险评分、可疑账户审核）| [查看](src/pages/fraud/codemap.md) |
| `src/pages/sync/` | 数据同步（变更监控、冲突解决）| [查看](src/pages/sync/codemap.md) |
| `src/pages/versions/` | 版本管理（发布记录、强制更新策略）| [查看](src/pages/versions/codemap.md) |
| `src/pages/content/` | 内容管理（隐私政策/服务条款/公告）| [查看](src/pages/content/codemap.md) |

## How to Update This Map
```bash
cd admin-web
python3 ~/.claude/skills/cartography/scripts/cartographer.py changes --root ./
python3 ~/.claude/skills/cartography/scripts/cartographer.py update --root ./
```
