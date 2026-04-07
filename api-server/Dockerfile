# ============================================================
# 构建阶段
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# 安装构建依赖
COPY package.json ./

# 使用 npm 安装（避免 bun 在 alpine 的兼容性问题）
RUN npm install --legacy-peer-deps

# 复制源码
COPY tsconfig.json ./
COPY src ./src

# 构建：tsup 输出到 dist/
RUN npm run build

# ============================================================
# 运行阶段（仅包含生产依赖和构建产物）
# ============================================================
FROM node:20-alpine AS runner

WORKDIR /app

# 安装 curl（健康检查用）
RUN apk add --no-cache curl

# 只复制生产依赖声明，重新安装（更小的镜像）
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 非 root 用户运行
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "dist/app.js"]
