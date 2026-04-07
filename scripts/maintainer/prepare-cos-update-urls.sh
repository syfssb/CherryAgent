#!/usr/bin/env bash
# =============================================================================
# MAINTAINER ONLY — Do not run this script as a regular contributor.
#
# Purpose : Rewrite installer download URLs in the generated update-feed YML
#           files to point to the configured download CDN/storage.
#
# Prerequisites:
#   - Run after electron-builder has generated dist-installer/ artifacts
#   - Set CHERRY_DOWNLOAD_BASE_URL env var to your CDN base URL
#
# Environment variables:
#   CHERRY_DOWNLOAD_BASE_URL  Base URL for installer downloads
#                             Example: https://dl.your-domain.com
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-installer"

cd "$ROOT_DIR"

# COS_BASE: base URL for installer downloads. Set CHERRY_DOWNLOAD_BASE_URL in env or CI secrets.
COS_BASE="${CHERRY_DOWNLOAD_BASE_URL:?CHERRY_DOWNLOAD_BASE_URL must be set (e.g. https://your-cdn.example.com)}"

version="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync("package.json","utf8")).version)')"

win_latest="$DIST_DIR/latest.yml"
arm_latest="$DIST_DIR/update-feed/mac-arm64/latest-mac.yml"
x64_latest="$DIST_DIR/update-feed/mac-x64/latest-mac.yml"

for f in "$win_latest" "$arm_latest" "$x64_latest"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing required file: $f"
    exit 1
  fi
done

# ── 更新 Windows latest.yml ──
# 同时修改 "  - url:" 和 "path:" 两字段，sha512/size 原样保留
win_exe_url="${COS_BASE}/Cherry-Agent-Setup-${version}.exe"
tmp="$(mktemp)"
awk -v url="$win_exe_url" '
  /^  - url:/  { $0 = "  - url: " url }
  /^path:/     { $0 = "path: " url }
  { print }
' "$win_latest" > "$tmp"
mv "$tmp" "$win_latest"
echo "Updated: $win_latest"
echo "  url/path → ${win_exe_url}"

# ── 更新 mac-arm64/latest-mac.yml ──
# 1. files[0].url / path → CDN zip URL（electron-updater 无感更新直接下载）
# 2. dmgUrl → CDN DMG URL（备用，浏览器打开 DMG 的链接）
arm_dmg_url="${COS_BASE}/Cherry-Agent-${version}-arm64.dmg"
arm_zip_url="${COS_BASE}/Cherry-Agent-${version}-arm64-mac.zip"
tmp="$(mktemp)"
awk -v zip_url="$arm_zip_url" '
  /^  - url:/  { $0 = "  - url: " zip_url }
  /^path:/     { $0 = "path: " zip_url }
  { print }
' "$arm_latest" > "$tmp"
# 移除旧 dmgUrl（如存在）再追加
grep -v '^dmgUrl:' "$tmp" > "${tmp}.2" || true
echo "dmgUrl: ${arm_dmg_url}" >> "${tmp}.2"
mv "${tmp}.2" "$arm_latest"
rm -f "$tmp"
echo "Updated: $arm_latest"
echo "  url/path → ${arm_zip_url}"
echo "  dmgUrl   → ${arm_dmg_url}"

# ── 更新 mac-x64/latest-mac.yml ──
x64_dmg_url="${COS_BASE}/Cherry-Agent-${version}.dmg"
x64_zip_url="${COS_BASE}/Cherry-Agent-${version}-mac.zip"
tmp="$(mktemp)"
awk -v zip_url="$x64_zip_url" '
  /^  - url:/  { $0 = "  - url: " zip_url }
  /^path:/     { $0 = "path: " zip_url }
  { print }
' "$x64_latest" > "$tmp"
grep -v '^dmgUrl:' "$tmp" > "${tmp}.2" || true
echo "dmgUrl: ${x64_dmg_url}" >> "${tmp}.2"
mv "${tmp}.2" "$x64_latest"
rm -f "$tmp"
echo "Updated: $x64_latest"
echo "  url/path → ${x64_zip_url}"
echo "  dmgUrl   → ${x64_dmg_url}"

echo ""
echo "Update URLs prepared. Version: ${version}, Base: ${COS_BASE}"
