#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-installer"

GITHUB_REPO="${GITHUB_REPO:?GITHUB_REPO must be set (e.g. your-org/your-repo)}"
GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
GITHUB_API="https://api.github.com"

if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "Missing GITHUB_TOKEN (or GH_TOKEN)."
  echo "Export a token with repo permissions before running."
  exit 1
fi

version="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync("package.json","utf8")).version)')"
tag="v${version}"

arm_dmg="$DIST_DIR/Cherry Agent-${version}-arm64.dmg"
x64_dmg="$DIST_DIR/Cherry Agent-${version}.dmg"
win_exe="$DIST_DIR/Cherry Agent Setup ${version}.exe"
win_block="$win_exe.blockmap"
win_latest="$DIST_DIR/latest.yml"

arm_feed="$DIST_DIR/update-feed/mac-arm64"
x64_feed="$DIST_DIR/update-feed/mac-x64"
arm_latest="$arm_feed/latest-mac.yml"
x64_latest="$x64_feed/latest-mac.yml"
arm_zip="$arm_feed/Cherry Agent-${version}-arm64-mac.zip"
arm_zip_block="$arm_zip.blockmap"
x64_zip="$x64_feed/Cherry Agent-${version}-mac.zip"
x64_zip_block="$x64_zip.blockmap"

required_files=(
  "$arm_dmg"
  "$x64_dmg"
  "$win_exe"
  "$win_block"
  "$win_latest"
  "$arm_latest"
  "$x64_latest"
  "$arm_zip"
  "$arm_zip_block"
)

# x64 zip 是可选的（Apple Timestamp 服务不可用时可能无法生成签名的 x64 zip）
optional_files=(
  "$x64_zip"
  "$x64_zip_block"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file"
    echo "Run packaging first."
    exit 1
  fi
done

for file in "${optional_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Warning: optional file missing, will skip: $(basename "$file")"
  fi
done

auth_headers=(
  -H "Authorization: Bearer ${GITHUB_TOKEN}"
  -H "Accept: application/vnd.github+json"
  -H "X-GitHub-Api-Version: 2022-11-28"
)

release_json="$(curl -fsS "${auth_headers[@]}" "${GITHUB_API}/repos/${GITHUB_REPO}/releases/tags/${tag}" || true)"
if [[ -z "$release_json" || "$release_json" == *"Not Found"* ]]; then
  release_json="$(curl -fsS -X POST "${auth_headers[@]}" "${GITHUB_API}/repos/${GITHUB_REPO}/releases" \
    -d "{\"tag_name\":\"${tag}\",\"name\":\"${tag}\",\"draft\":false,\"prerelease\":false,\"make_latest\":\"true\"}")"
fi

release_id="$(printf '%s' "$release_json" | jq -r '.id')"
upload_url="$(printf '%s' "$release_json" | jq -r '.upload_url' | sed 's/{?name,label}//')"

if [[ -z "$release_id" || "$release_id" == "null" ]]; then
  echo "Failed to resolve GitHub release id."
  echo "$release_json"
  exit 1
fi

urlencode() {
  printf '%s' "$1" | jq -sRr @uri
}

delete_asset_if_exists() {
  local asset_name="$1"
  local existing_ids
  existing_ids="$(
    curl -fsS "${auth_headers[@]}" "${GITHUB_API}/repos/${GITHUB_REPO}/releases/${release_id}/assets?per_page=100" \
      | jq -r --arg name "$asset_name" '
          .[]
          | select(.name == $name or .name == ($name | gsub(" "; ".")))
          | .id
        '
  )"

  while IFS= read -r existing_id; do
    [[ -n "$existing_id" && "$existing_id" != "null" ]] || continue
    curl -fsS -X DELETE "${auth_headers[@]}" "${GITHUB_API}/repos/${GITHUB_REPO}/releases/assets/${existing_id}" >/dev/null
  done <<< "$existing_ids"
}

upload_asset() {
  local source_file="$1"
  local asset_name="$2"
  local encoded_name
  encoded_name="$(urlencode "$asset_name")"

  delete_asset_if_exists "$asset_name"
  echo "Uploading asset: ${asset_name}"
  curl -fsS \
    -X POST \
    "${auth_headers[@]}" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @"${source_file}" \
    "${upload_url}?name=${encoded_name}" >/dev/null
}

declare -a assets=(
  "$arm_dmg::Cherry.Agent-${version}-arm64.dmg"
  "$x64_dmg::Cherry.Agent-${version}.dmg"
  "$win_exe::Cherry.Agent.Setup.${version}.exe"
  "$win_block::Cherry.Agent.Setup.${version}.exe.blockmap"
  "$win_latest::latest.yml"
  "$arm_latest::latest-mac-arm64.yml"
  "$x64_latest::latest-mac-x64.yml"
  "$arm_zip::Cherry.Agent-${version}-arm64-mac.zip"
  "$arm_zip_block::Cherry.Agent-${version}-arm64-mac.zip.blockmap"
  "$arm_dmg::Cherry.Agent-latest-arm64.dmg"
  "$x64_dmg::Cherry.Agent-latest.dmg"
  "$win_exe::Cherry.Agent.Setup.Latest.exe"
)

# x64 zip 是可选的（Apple Timestamp 服务不可用时可能无法生成）
declare -a optional_assets=(
  "$x64_zip::Cherry.Agent-${version}-mac.zip"
  "$x64_zip_block::Cherry.Agent-${version}-mac.zip.blockmap"
)

for item in "${assets[@]}"; do
  src="${item%%::*}"
  name="${item##*::}"
  upload_asset "$src" "$name"
done

for item in "${optional_assets[@]}"; do
  src="${item%%::*}"
  name="${item##*::}"
  if [[ -f "$src" ]]; then
    upload_asset "$src" "$name"
  else
    echo "Skipping optional asset (file not found): $name"
  fi
done

echo "GitHub release upload done."
echo "Repo: $GITHUB_REPO"
echo "Tag: $tag"
echo "Release URL: https://github.com/${GITHUB_REPO}/releases/tag/${tag}"
echo "Stable download URLs:"
echo "  - https://github.com/${GITHUB_REPO}/releases/latest/download/Cherry.Agent-latest-arm64.dmg"
echo "  - https://github.com/${GITHUB_REPO}/releases/latest/download/Cherry.Agent-latest.dmg"
echo "  - https://github.com/${GITHUB_REPO}/releases/latest/download/Cherry.Agent.Setup.Latest.exe"
