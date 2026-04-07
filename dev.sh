#!/bin/bash
# 一键启动/重启所有开发服务
# 用法: ./dev.sh [start|stop|restart]

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTION="${1:-restart}"
PID_DIR="/tmp/cherry-agent-pids"
API_PID_FILE="$PID_DIR/api-server.pid"
DESKTOP_PID_FILE="$PID_DIR/desktop.pid"
ADMIN_PID_FILE="$PID_DIR/admin-web.pid"

ensure_pid_dir() {
  mkdir -p "$PID_DIR"
}

is_pid_alive() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

kill_process_tree() {
  local pid="$1"
  [ -n "$pid" ] || return
  is_pid_alive "$pid" || return

  local children child
  children=$(pgrep -P "$pid" 2>/dev/null || true)

  for child in $children; do
    kill_process_tree "$child"
  done

  kill "$pid" 2>/dev/null || true
}

kill_from_pid_file() {
  local pid_file="$1"
  [ -f "$pid_file" ] || return

  local pid
  pid="$(cat "$pid_file" 2>/dev/null)"

  if is_pid_alive "$pid"; then
    kill_process_tree "$pid"
    sleep 1
    if is_pid_alive "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  rm -f "$pid_file"
}

kill_project_processes() {
  local pid cmd

  while IFS= read -r line; do
    pid="${line%% *}"
    cmd="${line#* }"

    if [[ "$cmd" == *"$ROOT_DIR"* ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done < <(pgrep -fal "vite|electron|tsx.*src/app|bun run dev|pnpm run dev|pnpm dev" 2>/dev/null || true)
}

kill_project_ports() {
  local port pid cmd
  for port in 3099 3001 5173; do
    while IFS= read -r pid; do
      [ -n "$pid" ] || continue
      cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      if [[ "$cmd" == *"$ROOT_DIR"* ]]; then
        kill "$pid" 2>/dev/null || true
      fi
    done < <(lsof -ti:"$port" 2>/dev/null || true)
  done
}

start_service() {
  local name="$1"
  local cwd="$2"
  local command="$3"
  local log_file="$4"
  local pid_file="$5"

  echo "==> 启动 $name..."
  nohup bash -lc "
    export NVM_DIR=\"\$HOME/.nvm\"
    if [ -s \"\$NVM_DIR/nvm.sh\" ]; then
      . \"\$NVM_DIR/nvm.sh\"
      nvm use 24 >/dev/null 2>&1 || \
      nvm use 22 >/dev/null 2>&1 || \
      nvm use 20 >/dev/null 2>&1 || \
      nvm use default >/dev/null 2>&1 || true
    fi
    NODE_MAJOR=\$(node -p \"Number(process.versions.node.split('.')[0])\" 2>/dev/null || echo 0)
    echo \"[dev.sh] $name runtime: node=\$(node -v 2>/dev/null || echo missing), bun=\$(bun --version 2>/dev/null || echo missing)\"
    if [ \"\$NODE_MAJOR\" -lt 20 ]; then
      echo \"[dev.sh] $name 启动失败：Node 版本过低（需要 >=20）\" >&2
      exit 1
    fi
    cd \"$cwd\" && exec $command
  " > "$log_file" 2>&1 &
  local pid=$!
  echo "$pid" > "$pid_file"
}

stop_all() {
  echo "==> 停止所有服务..."
  ensure_pid_dir

  kill_from_pid_file "$API_PID_FILE"
  kill_from_pid_file "$DESKTOP_PID_FILE"
  kill_from_pid_file "$ADMIN_PID_FILE"

  # 双保险：仅清理当前项目路径下的相关进程
  kill_project_processes
  sleep 1

  # 仅清理被当前项目占用的端口进程
  kill_project_ports
  sleep 1

  echo "    所有服务已停止"
}

start_all() {
  ensure_pid_dir

  start_service "api-server (端口 3099)" "$ROOT_DIR/api-server" "bun run dev" "/tmp/cherry-agent-api.log" "$API_PID_FILE"
  start_service "桌面应用 (Electron + Vite 5173)" "$ROOT_DIR" "bun run dev" "/tmp/cherry-agent-electron.log" "$DESKTOP_PID_FILE"

  # 等桌面应用的 pkill -f vite 执行完毕后再启动 admin-web
  sleep 3

  start_service "admin-web (端口 3001)" "$ROOT_DIR/admin-web" "bun run dev" "/tmp/cherry-agent-admin.log" "$ADMIN_PID_FILE"

  # 等待服务启动
  echo "==> 等待服务启动..."
  sleep 6

  echo ""
  echo "===== 服务状态 ====="
  check_port 3099 "api-server"
  check_port 3001 "admin-web"
  check_port 5173 "桌面应用 (Vite)"

  ELECTRON_COUNT=$(ps aux | grep 'Electron.app' | grep -v grep | wc -l | tr -d ' ')
  if [ "$ELECTRON_COUNT" -gt 0 ]; then
    echo "  ✓ Electron        运行中"
  else
    echo "  ✗ Electron        未启动"
  fi

  echo ""
  echo "日志文件:"
  echo "  api-server:  /tmp/cherry-agent-api.log"
  echo "  admin-web:   /tmp/cherry-agent-admin.log"
  echo "  桌面应用:    /tmp/cherry-agent-electron.log"
}

check_port() {
  if lsof -iTCP:"$1" -sTCP:LISTEN -P >/dev/null 2>&1; then
    echo "  ✓ $2  端口 $1 运行中"
  else
    echo "  ✗ $2  端口 $1 未启动"
  fi
}

case "$ACTION" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    start_all
    ;;
  *)
    echo "用法: $0 [start|stop|restart]"
    exit 1
    ;;
esac
