#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-installer"

GITHUB_REPO="${GITHUB_REPO:?GITHUB_REPO must be set (e.g. your-org/your-repo)}"

urlencode() {
  printf '%s' "$1" | jq -sRr @uri
}

update_yaml() {
  local file="$1"
  local url="$2"
  local tmp
  tmp="$(mktemp)"
  awk -v url="$url" '
    /^[[:space:]]*- url:/ { $0 = "  - url: " url }
    /^path:/ { $0 = "path: " url }
    { print }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

version="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync("package.json","utf8")).version)')"
tag="v${version}"
download_base="https://github.com/${GITHUB_REPO}/releases/download/${tag}"

win_latest="$DIST_DIR/latest.yml"
arm_latest="$DIST_DIR/update-feed/mac-arm64/latest-mac.yml"
x64_latest="$DIST_DIR/update-feed/mac-x64/latest-mac.yml"

win_exe_local="Cherry Agent Setup ${version}.exe"
arm_zip_local="Cherry Agent-${version}-arm64-mac.zip"
x64_zip_local="Cherry Agent-${version}-mac.zip"

win_exe_remote="Cherry.Agent.Setup.${version}.exe"
arm_zip_remote="Cherry.Agent-${version}-arm64-mac.zip"
x64_zip_remote="Cherry.Agent-${version}-mac.zip"

required_files=(
  "$win_latest"
  "$arm_latest"
  "$x64_latest"
  "$DIST_DIR/$win_exe_local"
  "$DIST_DIR/update-feed/mac-arm64/$arm_zip_local"
  "$DIST_DIR/update-feed/mac-x64/$x64_zip_local"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file"
    echo "Run packaging first."
    exit 1
  fi
done

win_url="${download_base}/$(urlencode "$win_exe_remote")"
arm_url="${download_base}/$(urlencode "$arm_zip_remote")"
x64_url="${download_base}/$(urlencode "$x64_zip_remote")"

update_yaml "$win_latest" "$win_url"
update_yaml "$arm_latest" "$arm_url"
update_yaml "$x64_latest" "$x64_url"

echo "Updated update feeds to GitHub release URLs:"
echo "  - $win_latest"
echo "  - $arm_latest"
echo "  - $x64_latest"
echo "Repository: $GITHUB_REPO"
echo "Tag: $tag"
