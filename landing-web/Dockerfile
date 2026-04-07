# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package.json
COPY package.json ./

# 安装依赖（不使用 lock 文件，避免 optional dependencies bug）
RUN npm install --legacy-peer-deps

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 生产阶段
FROM nginx:alpine

# 后端地址，必须在部署时通过环境变量覆盖（如 docker run -e API_UPSTREAM=https://api.your-domain.com）
ENV API_UPSTREAM=http://localhost:3000

# 复制构建产物到 nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置模板（不放到 /etc/nginx/templates/ 避免默认 envsubst 替换所有变量）
COPY nginx.conf /etc/nginx/nginx.conf.template

# 复制自定义 entrypoint（只替换 $API_UPSTREAM，保留 nginx 内置变量）
COPY docker-entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

# 暴露端口（Zeabur 通过 PORT 环境变量注入实际端口）
EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint-custom.sh"]
