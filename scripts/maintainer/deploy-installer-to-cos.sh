#!/usr/bin/env bash
# =============================================================================
# MAINTAINER ONLY — Do not run this script as a regular contributor.
#
# Purpose : Upload installer packages (DMG, EXE, ZIP) and update-feed YML
#           files to a Tencent Cloud COS bucket, then purge CDN cache.
#
# Prerequisites:
#   - coscli installed at ~/bin/coscli or in PATH
#       Download: https://github.com/tencentyun/coscli/releases
#   - COS credentials set via environment variables:
#       COS_SECRET_ID   Tencent Cloud SecretId
#       COS_SECRET_KEY  Tencent Cloud SecretKey
#   - Required environment variables:
#       COS_BUCKET              Bucket name (e.g. my-bucket-1234567890)
#       COS_REGION              Bucket region (e.g. ap-hongkong)
#       CHERRY_DOWNLOAD_BASE_URL  CDN base URL (e.g. https://dl.example.com)
#
# macOS Keychain fallback (original maintainer setup):
#   security add-generic-password -a "cos-secret-id" -s "tencent-cos" -w "<SecretId>" -U
#   security add-generic-password -a "cos-secret-key" -s "tencent-cos" -w "<SecretKey>" -U
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-installer"

cd "$ROOT_DIR"

# ── 从环境变量或 macOS Keychain 读取凭据 ──
if [[ -z "${COS_SECRET_ID:-}" ]] && command -v security >/dev/null 2>&1; then
  COS_SECRET_ID="$(security find-generic-password -a "cos-secret-id" -s "tencent-cos" -w 2>/dev/null || true)"
fi
if [[ -z "${COS_SECRET_KEY:-}" ]] && command -v security >/dev/null 2>&1; then
  COS_SECRET_KEY="$(security find-generic-password -a "cos-secret-key" -s "tencent-cos" -w 2>/dev/null || true)"
fi

if [[ -z "${COS_SECRET_ID:-}" || -z "${COS_SECRET_KEY:-}" ]]; then
  echo "Missing COS credentials. Set COS_SECRET_ID and COS_SECRET_KEY env vars."
  echo "Or on macOS, store in Keychain:"
  echo "  security add-generic-password -a 'cos-secret-id' -s 'tencent-cos' -w '<SecretId>' -U"
  exit 1
fi

COS_BUCKET="${COS_BUCKET:?COS_BUCKET must be set (e.g. my-bucket-1234567890)}"
COS_REGION="${COS_REGION:?COS_REGION must be set (e.g. ap-hongkong)}"

# 自动在 ~/bin 中查找 coscli（~/.zshrc 可能未 source）
if ! command -v coscli >/dev/null 2>&1; then
  if [[ -x "$HOME/bin/coscli" ]]; then
    export PATH="$HOME/bin:$PATH"
  else
    echo "coscli not found. Download from https://github.com/tencentyun/coscli/releases"
    exit 1
  fi
fi

version="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync("package.json","utf8")).version)')"
echo "Uploading Cherry Agent v${version} to COS (${COS_BUCKET})..."

# ── 上传函数 ──
cos_upload() {
  local src="$1"
  local key="$2"
  echo "  → ${key}"
  coscli cp "$src" "cos://${COS_BUCKET}/${key}" \
    --secret-id "$COS_SECRET_ID" \
    --secret-key "$COS_SECRET_KEY" \
    -e "cos.${COS_REGION}.myqcloud.com"
}

# ── 源文件路径 ──
arm64_dmg="$DIST_DIR/Cherry Agent-${version}-arm64.dmg"
x64_dmg="$DIST_DIR/Cherry Agent-${version}.dmg"
win_exe="$DIST_DIR/Cherry Agent Setup ${version}.exe"
win_block="$DIST_DIR/Cherry Agent Setup ${version}.exe.blockmap"

# 检查必要文件存在
for f in "$arm64_dmg" "$x64_dmg" "$win_exe" "$win_block"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing required file: $f"
    exit 1
  fi
done

echo ""
echo "── 带版本号文件（自动更新用）──"
cos_upload "$arm64_dmg"  "Cherry-Agent-${version}-arm64.dmg"
cos_upload "$x64_dmg"    "Cherry-Agent-${version}.dmg"
cos_upload "$win_exe"    "Cherry-Agent-Setup-${version}.exe"
cos_upload "$win_block"  "Cherry-Agent-Setup-${version}.exe.blockmap"

# zip 文件（electron-updater 无感更新下载源）
arm64_zip="$DIST_DIR/update-feed/mac-arm64/Cherry Agent-${version}-arm64-mac.zip"
x64_zip="$DIST_DIR/update-feed/mac-x64/Cherry Agent-${version}-mac.zip"
if [[ -f "$arm64_zip" ]]; then
  cos_upload "$arm64_zip" "Cherry-Agent-${version}-arm64-mac.zip"
else
  echo "  ⚠ arm64 zip not found, skipping: $arm64_zip"
fi
if [[ -f "$x64_zip" ]]; then
  cos_upload "$x64_zip" "Cherry-Agent-${version}-mac.zip"
else
  echo "  ⚠ x64 zip not found, skipping: $x64_zip"
fi

echo ""
echo "── 稳定名称文件（落地页用，覆盖旧版）──"
cos_upload "$arm64_dmg"  "Cherry-Agent-latest-arm64.dmg"
cos_upload "$x64_dmg"    "Cherry-Agent-latest.dmg"
cos_upload "$win_exe"    "Cherry-Agent-Setup-Latest.exe"

# ── 上传 update-feed yml 到 COS ──
echo ""
echo "── 上传 update-feed yml 到 COS ──"
arm_yml="$DIST_DIR/update-feed/mac-arm64/latest-mac.yml"
x64_yml="$DIST_DIR/update-feed/mac-x64/latest-mac.yml"
win_yml="$DIST_DIR/latest.yml"

[[ -f "$arm_yml" ]] && cos_upload "$arm_yml" "update-feed/mac-arm64/latest-mac.yml"
[[ -f "$x64_yml" ]] && cos_upload "$x64_yml" "update-feed/mac-x64/latest-mac.yml"
[[ -f "$win_yml" ]] && cos_upload "$win_yml" "latest.yml"

echo ""
echo "COS upload complete."
echo "Base URL: https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com"

# ── 刷新 CDN 缓存（让 latest 别名和 yml 立即生效）──
echo ""
bash "$ROOT_DIR/scripts/maintainer/purge-cdn-cache.sh" || echo "⚠ CDN cache purge failed (non-fatal, cache will expire naturally)"

# ── 清理 COS 旧版本（保留当前版本 + latest 稳定链接）──
echo ""
echo "── 清理 COS 旧版本 ──"
cos_ls_output=$(coscli ls "cos://${COS_BUCKET}/" \
  --secret-id "$COS_SECRET_ID" \
  --secret-key "$COS_SECRET_KEY" \
  -e "cos.${COS_REGION}.myqcloud.com" 2>/dev/null || true)

while IFS= read -r line; do
  key=$(echo "$line" | awk '{print $1}')
  [[ -z "$key" ]] && continue
  if [[ "$key" =~ ^Cherry-Agent.*[0-9]+\.[0-9]+\.[0-9]+.*\.(dmg|exe|exe\.blockmap|zip)$ ]]; then
    if [[ "$key" == *"${version}"* ]]; then
      continue
    fi
    echo "  Deleting old: $key"
    coscli rm "cos://${COS_BUCKET}/${key}" \
      --secret-id "$COS_SECRET_ID" \
      --secret-key "$COS_SECRET_KEY" \
      -e "cos.${COS_REGION}.myqcloud.com" -f 2>/dev/null || true
  fi
done <<< "$cos_ls_output"
echo "COS cleanup done (kept v${version} + latest links)"

# ── 清理本地旧版本安装包 ──
echo ""
echo "── 清理本地旧版本安装包 ──"
find "$DIST_DIR" -maxdepth 1 -type f \( \
  -name "*.dmg" -o -name "*.exe" -o -name "*.zip" -o -name "*.blockmap" \
\) ! -name "*${version}*" \
-print -delete 2>/dev/null || true
rm -rf "$DIST_DIR/mac" "$DIST_DIR/mac-arm64" "$DIST_DIR/win-unpacked" 2>/dev/null || true
echo "Local cleanup done (kept v${version} binaries + update-feed for next step)"
