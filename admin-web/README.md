# admin-web

AI 中转站管理后台前端项目

## 技术栈

- React 19
- React Router 7
- TanStack Query 5
- Zustand 5
- Tailwind CSS 3
- Recharts 2
- Vite 6
- TypeScript 5.6

## 目录结构

```
admin-web/
├── src/
│   ├── pages/              # 页面组件
│   │   ├── login.tsx       # 登录页
│   │   ├── dashboard/      # 仪表盘
│   │   ├── users/          # 用户管理
│   │   ├── finance/        # 财务管理
│   │   ├── channels/       # 渠道管理
│   │   ├── models/         # 模型管理
│   │   ├── versions/       # 版本管理
│   │   └── settings/       # 系统设置
│   ├── components/
│   │   ├── layout/         # 布局组件
│   │   └── ui/             # UI 组件库
│   ├── services/           # API 服务
│   ├── store/              # 状态管理
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具函数
│   └── types/              # 类型定义
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 类型检查
npm run type-check

# 构建生产版本
npm run build
```

## 功能模块

- [x] 登录认证
- [x] 仪表盘（统计卡片、图表）
- [x] 用户管理（列表、详情）
- [ ] 财务管理
- [ ] 渠道管理
- [ ] 模型管理
- [ ] 版本管理
- [ ] 系统设置

## 设计规范

- 深色主题
- 响应式设计
- 中文界面
