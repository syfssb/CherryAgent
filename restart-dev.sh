#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/private/tmp/cherry-agent-desktop.log"
REACT_LOG_FILE="/private/tmp/cherry-agent-react.log"
VITE_PORT=5173

kill_pid_safely() {
  local pid="$1"
  kill "$pid" 2>/dev/null || true
}

kill_pattern() {
  local pattern="$1"
  while IFS= read -r line; do
    local pid="${line%% *}"
    local cmd="${line#* }"
    if [[ "$cmd" == *"$ROOT_DIR"* ]]; then
      kill_pid_safely "$pid"
    fi
  done < <(pgrep -af "$pattern" 2>/dev/null || true)
}

kill_project_port() {
  local port="$1"
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    local cmd
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$cmd" == *"$ROOT_DIR"* ]]; then
      kill_pid_safely "$pid"
    fi
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
}

force_kill_leftovers() {
  local pattern="$1"
  while IFS= read -r line; do
    local pid="${line%% *}"
    local cmd="${line#* }"
    if [[ "$cmd" == *"$ROOT_DIR"* ]]; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done < <(pgrep -af "$pattern" 2>/dev/null || true)
}

quit_installed_cherry_agent() {
  # 避免安装版占用单实例锁，导致开发版“启动无反应”
  osascript -e 'tell application "Cherry Agent" to quit' >/dev/null 2>&1 || true
  pkill -f "/Applications/Cherry Agent.app/Contents/MacOS/Cherry Agent" 2>/dev/null || true
  pkill -f "Cherry Agent Helper" 2>/dev/null || true
}

echo "[restart-dev] project root: $ROOT_DIR"
echo "[restart-dev] stopping desktop processes..."

quit_installed_cherry_agent
kill_pattern "bun run dev$"
kill_pattern "bun run dev:electron"
kill_pattern "bun run dev:react"
kill_pattern "electron"
kill_pattern "vite"
kill_project_port "$VITE_PORT"

sleep 1

force_kill_leftovers "bun run dev$"
force_kill_leftovers "bun run dev:electron"
force_kill_leftovers "bun run dev:react"
force_kill_leftovers "electron"
force_kill_leftovers "vite"
kill_project_port "$VITE_PORT"
quit_installed_cherry_agent

echo "[restart-dev] starting desktop..."
cd "$ROOT_DIR"

: > "$REACT_LOG_FILE"
: > "$LOG_FILE"
nohup bun run dev:react > "$REACT_LOG_FILE" 2>&1 &
REACT_PID=$!

READY=0
for _ in $(seq 1 30); do
  if lsof -nP -iTCP:"$VITE_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [[ "$READY" -ne 1 ]]; then
  echo "[restart-dev] warning: vite not listening on $VITE_PORT yet"
  echo "[restart-dev] react log:"
  tail -n 60 "$REACT_LOG_FILE" || true
  exit 1
fi

echo "[restart-dev] vite is listening on 127.0.0.1:$VITE_PORT"
nohup bun run dev:electron > "$LOG_FILE" 2>&1 &
ELECTRON_PID=$!

echo "[restart-dev] react pid: $REACT_PID"
echo "[restart-dev] electron pid: $ELECTRON_PID"
echo "[restart-dev] electron log file: $LOG_FILE"
echo "[restart-dev] react log file: $REACT_LOG_FILE"

# 等待主进程落盘日志，便于快速发现启动问题
sleep 2
if ! kill -0 "$ELECTRON_PID" 2>/dev/null; then
  echo "[restart-dev] warning: electron process exited early"
  tail -n 80 "$LOG_FILE" || true
  exit 1
fi

# 尝试把桌面窗口激活到前台（dev 名称可能是 Electron 或 Cherry Agent）
osascript -e 'tell application "Electron" to activate' >/dev/null 2>&1 || true
osascript -e 'tell application "Cherry Agent" to activate' >/dev/null 2>&1 || true
