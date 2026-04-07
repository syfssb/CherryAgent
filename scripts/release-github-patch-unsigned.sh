#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

resolve_github_token() {
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    printf '%s' "$GITHUB_TOKEN"
    return 0
  fi
  if [[ -n "${GH_TOKEN:-}" ]]; then
    printf '%s' "$GH_TOKEN"
    return 0
  fi

  local credential token
  credential="$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null || true)"
  token="$(printf '%s' "$credential" | awk -F= '/^password=/{print $2; exit}')"
  if [[ -n "$token" ]]; then
    printf '%s' "$token"
    return 0
  fi

  return 1
}

token="$(resolve_github_token || true)"
if [[ -z "$token" ]]; then
  echo "Missing GitHub token."
  echo "Please set GITHUB_TOKEN/GH_TOKEN or configure git credential for github.com."
  exit 1
fi

old_version="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync("package.json","utf8")).version)')"
npm version patch --no-git-tag-version >/dev/null
new_version="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync("package.json","utf8")).version)')"

echo "Version bumped: ${old_version} -> ${new_version}"
GITHUB_REPO="${GITHUB_REPO:?GITHUB_REPO must be set (e.g. your-org/your-repo)}"
echo "Publishing unsigned release to ${GITHUB_REPO} ..."
echo "Note: desktop clients currently detect updates from feed and open installers in the browser."
echo "      Unsigned mac artifacts must not be treated as native in-app auto-install releases."
export GITHUB_REPO
export GITHUB_TOKEN="$token"
export CHERRY_MAC_UNSIGNED=1
export BUNDLE_PYTHON=true

bun run build:desktop && \
  bun run pack:mac-arm64:dmg && \
  bun run pack:mac-x64:dmg && \
  bun run prepare:update-feeds:mac && \
  bun run pack:win && \
  bun run prepare:update-feeds:cos && \
  bun run deploy:installer:cos && \
  bun run deploy:installer:github && \
  bun run deploy:update-feed:github
