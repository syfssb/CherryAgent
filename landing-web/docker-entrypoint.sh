#!/bin/sh
# 设置监听端口：优先用 Zeabur 注入的 PORT，默认 80
export LISTEN_PORT="${PORT:-80}"
# 只替换指定变量，保留 nginx 内置变量（$uri, $http_upgrade 等）
envsubst '$API_UPSTREAM $LISTEN_PORT' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
exec nginx -g 'daemon off;'
