# Landing Web

Cherry Agent 产品官网和用户注册页面。

## 功能

- 产品首页展示
- 用户注册（支持邮箱密码注册）
- 邀请码系统（URL 参数 `?ref=xxx`）
- 桌面客户端下载

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（端口 3002）
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 部署到 Zeabur

### 方式 1：使用 Dockerfile（推荐）

1. 在 Zeabur 创建新服务，选择 Git 仓库
2. 选择 `landing-web` 目录
3. Zeabur 会自动检测 Dockerfile 并构建
4. 设置环境变量：
   - `API_UPSTREAM`：后端完整地址（如 `https://api.your-domain.com`，不要带路径和结尾 `/`）
   - `VITE_API_BASE_URL`：API 基础 URL（留空使用相对路径）

### 方式 2：使用 Node.js 静态服务器

如果不想使用 Dockerfile，可以使用 `serve` 包：

```bash
# 添加 serve 依赖
npm install --save-dev serve

# 在 package.json 添加启动脚本
"scripts": {
  "start": "serve -s dist -l 3002"
}
```

然后在 Zeabur 配置：
- 构建命令：`npm run build`
- 启动命令：`npm start`

## 环境变量

- `VITE_API_BASE_URL`：API 基础 URL
  - 开发环境：留空（使用 vite.config.ts 中的代理）
  - 生产环境：留空（使用 nginx 代理）或设置为完整 API URL
- `API_UPSTREAM`：Nginx 运行时反向代理目标（Docker 运行时变量）
  - 默认值：`http://localhost:3000`（镜像内占位，部署时必须覆盖）
  - 推荐：在容器平台显式配置为 `https://api.your-domain.com`

## API 代理

### 开发环境
通过 `vite.config.ts` 配置代理到 `http://localhost:3000`

### 生产环境
通过 `nginx.conf` 模板 + `API_UPSTREAM` 运行时变量代理到后端服务

## 项目结构

```
landing-web/
├── src/
│   ├── pages/          # 页面组件
│   │   ├── Landing.tsx # 首页
│   │   └── Register.tsx # 注册页
│   ├── lib/            # 工具库
│   │   └── api.ts      # API 调用
│   ├── App.tsx         # 路由配置
│   └── main.tsx        # 入口文件
├── Dockerfile          # Docker 构建配置
├── nginx.conf          # Nginx 配置
└── vite.config.ts      # Vite 配置
```

## 注册流程

1. 用户访问 `/register?ref=ABC123`（带邀请码）
2. 填写邮箱、密码、昵称
3. 提交注册 → 调用 `/api/auth/register`
4. 注册成功 → 自动调用 `/api/referrals/apply` 绑定推荐关系
5. 显示成功页面 → 提供桌面客户端下载链接

## 技术栈

- React 19
- React Router 7
- Vite 6
- Tailwind CSS 3
- TypeScript 5
