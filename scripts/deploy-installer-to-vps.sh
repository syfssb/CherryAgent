#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-installer"

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_HOST="${DEPLOY_HOST:?DEPLOY_HOST must be set to your VPS IP or hostname}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_KEY="${DEPLOY_KEY:-$HOME/.ssh/id_rsa}"
DEPLOY_REMOTE_DIR="${DEPLOY_REMOTE_DIR:?DEPLOY_REMOTE_DIR must be set to your VPS deploy directory}"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/deploy-installer-to-vps.sh

Optional env vars:
  DEPLOY_USER
  DEPLOY_HOST
  DEPLOY_PORT
  DEPLOY_KEY
  DEPLOY_REMOTE_DIR
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -d "$DIST_DIR" ]]; then
  echo "dist-installer not found: $DIST_DIR"
  exit 1
fi

if [[ -d "$DEPLOY_KEY" ]]; then
  preferred_key="$DEPLOY_KEY/172.93.221.155_id_ed25519"
  if [[ -f "$preferred_key" ]]; then
    DEPLOY_KEY="$preferred_key"
  else
    first_key="$(find "$DEPLOY_KEY" -maxdepth 1 -type f \( -name '*_id_ed25519' -o -name '*.pem' \) | head -n 1)"
    if [[ -n "$first_key" ]]; then
      DEPLOY_KEY="$first_key"
    fi
  fi
fi

if [[ ! -f "$DEPLOY_KEY" ]]; then
  echo "SSH key not found: $DEPLOY_KEY"
  exit 1
fi

chmod 600 "$DEPLOY_KEY" 2>/dev/null || true

if [[ -z "$DEPLOY_REMOTE_DIR" || "$DEPLOY_REMOTE_DIR" == "/" ]]; then
  echo "Unsafe DEPLOY_REMOTE_DIR: $DEPLOY_REMOTE_DIR"
  exit 1
fi

version="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync("package.json","utf8")).version)')"

arm_dmg="$DIST_DIR/Cherry Agent-${version}-arm64.dmg"
x64_dmg="$DIST_DIR/Cherry Agent-${version}.dmg"
win_exe="$DIST_DIR/Cherry Agent Setup ${version}.exe"
win_block="$win_exe.blockmap"
win_latest="$DIST_DIR/latest.yml"

arm_feed="$DIST_DIR/update-feed/mac-arm64"
x64_feed="$DIST_DIR/update-feed/mac-x64"

required_files=(
  "$arm_dmg"
  "$x64_dmg"
  "$win_exe"
  "$win_block"
  "$win_latest"
  "$arm_feed/latest-mac.yml"
  "$x64_feed/latest-mac.yml"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file"
    echo "Please run packaging first."
    exit 1
  fi
done

shopt -s nullglob
arm_feed_payload=( "$arm_feed"/*.zip "$arm_feed"/*.blockmap )
x64_feed_payload=( "$x64_feed"/*.zip "$x64_feed"/*.blockmap )
shopt -u nullglob

if (( ${#arm_feed_payload[@]} == 0 )); then
  echo "Missing arm64 feed zip/blockmap in: $arm_feed"
  exit 1
fi

if (( ${#x64_feed_payload[@]} == 0 )); then
  echo "Missing x64 feed zip/blockmap in: $x64_feed"
  exit 1
fi

stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/cherry-release-stage.XXXXXX")"
archive_path="${TMPDIR:-/tmp}/cherry-release-$(date +%Y%m%d-%H%M%S).tar.gz"
remote_archive="/tmp/cherry-release-${version}-$(date +%s).tar.gz"

cleanup() {
  rm -rf "$stage_dir"
  rm -f "$archive_path"
}
trap cleanup EXIT

mkdir -p "$stage_dir/update-feed/mac-arm64" "$stage_dir/update-feed/mac-x64"

cp -f "$arm_dmg" "$stage_dir/"
cp -f "$x64_dmg" "$stage_dir/"
cp -f "$win_exe" "$stage_dir/"
cp -f "$win_block" "$stage_dir/"
cp -f "$win_latest" "$stage_dir/latest.yml"

cp -f "$arm_feed/latest-mac.yml" "$stage_dir/update-feed/mac-arm64/latest-mac.yml"
cp -f "$x64_feed/latest-mac.yml" "$stage_dir/update-feed/mac-x64/latest-mac.yml"
cp -f "${arm_feed_payload[@]}" "$stage_dir/update-feed/mac-arm64/"
cp -f "${x64_feed_payload[@]}" "$stage_dir/update-feed/mac-x64/"

# 固定下载链接（landing-web 可长期不改）
cp -f "$arm_dmg" "$stage_dir/Cherry Agent-latest-arm64.dmg"
cp -f "$x64_dmg" "$stage_dir/Cherry Agent-latest.dmg"
cp -f "$win_exe" "$stage_dir/Cherry Agent Setup Latest.exe"

tar -C "$stage_dir" -czf "$archive_path" .

ssh_opts=(
  -i "$DEPLOY_KEY"
  -p "$DEPLOY_PORT"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
)

scp_opts=(
  -i "$DEPLOY_KEY"
  -P "$DEPLOY_PORT"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
)

echo "Uploading release archive to ${DEPLOY_USER}@${DEPLOY_HOST}:${remote_archive} ..."
scp "${scp_opts[@]}" "$archive_path" "${DEPLOY_USER}@${DEPLOY_HOST}:${remote_archive}"

echo "Deploying to ${DEPLOY_REMOTE_DIR} (will remove existing files in that directory) ..."
ssh "${ssh_opts[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" "bash -s" -- "$DEPLOY_REMOTE_DIR" "$remote_archive" <<'REMOTE_SCRIPT'
set -euo pipefail

remote_dir="$1"
archive="$2"

if [[ -z "$remote_dir" || "$remote_dir" == "/" ]]; then
  echo "Unsafe remote_dir: $remote_dir"
  exit 1
fi

mkdir -p "$remote_dir"
find "$remote_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
tar -xzf "$archive" -C "$remote_dir"
rm -f "$archive"
REMOTE_SCRIPT

echo "Deployment done."
echo "Remote directory: $DEPLOY_REMOTE_DIR"
echo "Fixed download files:"
echo "  - Cherry Agent-latest-arm64.dmg"
echo "  - Cherry Agent-latest.dmg"
echo "  - Cherry Agent Setup Latest.exe"
