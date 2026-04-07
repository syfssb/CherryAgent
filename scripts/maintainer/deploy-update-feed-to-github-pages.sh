#!/usr/bin/env bash
# =============================================================================
# MAINTAINER ONLY — Do not run this script as a regular contributor.
#
# Purpose : Push update-feed YML files to a GitHub Pages branch so that
#           electron-updater can fetch them as the auto-update feed.
#
# Prerequisites:
#   - jq installed (brew install jq)
#   - Required environment variables:
#       GITHUB_TOKEN (or GH_TOKEN)  GitHub token with repo write permission
#       GITHUB_REPO                  Target repo in owner/repo format
#                                   (defaults to GITHUB_REPO env var)
#   - Optional environment variables:
#       GITHUB_PAGES_BRANCH         Branch to push to (default: gh-pages)
#       GITHUB_PAGES_SUBDIR         Subdirectory within the branch (default: root)
#       GITHUB_PAGES_BASE_URL       Public Pages URL override
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-installer"

GITHUB_REPO="${GITHUB_REPO:?GITHUB_REPO must be set (e.g. your-org/your-repo)}"
GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
GITHUB_PAGES_BRANCH="${GITHUB_PAGES_BRANCH:-gh-pages}"
GITHUB_PAGES_SUBDIR="${GITHUB_PAGES_SUBDIR:-}"
GITHUB_API="https://api.github.com"

if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "Missing GITHUB_TOKEN (or GH_TOKEN)."
  echo "Export a token with repo permissions before running."
  exit 1
fi

if [[ "$GITHUB_REPO" != */* ]]; then
  echo "Invalid GITHUB_REPO: $GITHUB_REPO (expected owner/repo)"
  exit 1
fi

if [[ ! -d "$DIST_DIR" ]]; then
  echo "dist-installer not found: $DIST_DIR"
  exit 1
fi

win_latest="$DIST_DIR/latest.yml"
arm_latest="$DIST_DIR/update-feed/mac-arm64/latest-mac.yml"
x64_latest="$DIST_DIR/update-feed/mac-x64/latest-mac.yml"

required_files=(
  "$win_latest"
  "$arm_latest"
  "$x64_latest"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file"
    echo "Run feed generation first (prepare:update-feeds:cos or equivalent)."
    exit 1
  fi
done

owner="${GITHUB_REPO%/*}"
repo="${GITHUB_REPO#*/}"

subdir="$(printf '%s' "$GITHUB_PAGES_SUBDIR" | sed -E 's#^/+##; s#/+$##')"
if [[ -n "$subdir" ]]; then
  prefix="${subdir}/"
else
  prefix=""
fi

auth_headers=(
  -H "Authorization: Bearer ${GITHUB_TOKEN}"
  -H "Accept: application/vnd.github+json"
  -H "X-GitHub-Api-Version: 2022-11-28"
)

ensure_pages_branch_exists() {
  if curl -fsS "${auth_headers[@]}" \
    "${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${GITHUB_PAGES_BRANCH}" >/dev/null; then
    return 0
  fi

  echo "GitHub Pages branch '${GITHUB_PAGES_BRANCH}' not found, creating it..."
  local default_branch base_sha create_payload
  default_branch="$(
    curl -fsS "${auth_headers[@]}" "${GITHUB_API}/repos/${owner}/${repo}" \
      | jq -r '.default_branch'
  )"
  base_sha="$(
    curl -fsS "${auth_headers[@]}" \
      "${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${default_branch}" \
      | jq -r '.object.sha'
  )"
  create_payload="$(
    jq -n --arg ref "refs/heads/${GITHUB_PAGES_BRANCH}" --arg sha "$base_sha" '{ref:$ref, sha:$sha}'
  )"
  curl -fsS -X POST "${auth_headers[@]}" \
    "${GITHUB_API}/repos/${owner}/${repo}/git/refs" \
    -d "$create_payload" >/dev/null || true
}

upload_file() {
  local source_file="$1"
  local target_path="$2"
  local encoded_content existing_json sha payload

  encoded_content="$(base64 < "$source_file" | tr -d '\n')"
  existing_json="$(
    curl -fsS "${auth_headers[@]}" \
      "${GITHUB_API}/repos/${owner}/${repo}/contents/${target_path}?ref=${GITHUB_PAGES_BRANCH}" \
      || true
  )"
  sha="$(printf '%s' "$existing_json" | jq -r '.sha // empty' 2>/dev/null || true)"

  if [[ -n "$sha" ]]; then
    payload="$(jq -n \
      --arg message "chore: update feed ${target_path}" \
      --arg content "$encoded_content" \
      --arg branch "$GITHUB_PAGES_BRANCH" \
      --arg sha "$sha" \
      '{message:$message, content:$content, branch:$branch, sha:$sha}')"
  else
    payload="$(jq -n \
      --arg message "chore: add feed ${target_path}" \
      --arg content "$encoded_content" \
      --arg branch "$GITHUB_PAGES_BRANCH" \
      '{message:$message, content:$content, branch:$branch}')"
  fi

  curl -fsS -X PUT "${auth_headers[@]}" \
    "${GITHUB_API}/repos/${owner}/${repo}/contents/${target_path}" \
    -d "$payload" >/dev/null

  echo "Uploaded: ${target_path}"
}

tmp_nojekyll="$(mktemp)"
touch "$tmp_nojekyll"

ensure_pages_branch_exists

upload_file "$win_latest" "${prefix}latest.yml"
upload_file "$arm_latest" "${prefix}update-feed/mac-arm64/latest-mac.yml"
upload_file "$x64_latest" "${prefix}update-feed/mac-x64/latest-mac.yml"
upload_file "$tmp_nojekyll" "${prefix}.nojekyll"

rm -f "$tmp_nojekyll"

default_pages_base="https://${owner}.github.io/${repo}"
pages_base="${GITHUB_PAGES_BASE_URL:-$default_pages_base}"
if [[ -n "$subdir" ]]; then
  feed_base="${pages_base%/}/${subdir}"
else
  feed_base="${pages_base%/}"
fi

echo "GitHub Pages feed deploy done."
echo "Repo: $GITHUB_REPO"
echo "Branch: $GITHUB_PAGES_BRANCH"
echo "Feed base URL: $feed_base"
echo "Check URLs:"
echo "  - ${feed_base}/latest.yml"
echo "  - ${feed_base}/update-feed/mac-arm64/latest-mac.yml"
echo "  - ${feed_base}/update-feed/mac-x64/latest-mac.yml"

# ── 最终清理：删除本地 yml / update-feed 目录 ──
version="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync("'"$ROOT_DIR/package.json"'","utf8")).version)')"
echo ""
echo "── 最终清理本地临时文件 ──"
find "$DIST_DIR" -maxdepth 1 -type f \( \
  -name "*.yml" -o -name "*.yaml" \
\) ! -name "builder-debug.yml" ! -name "builder-effective-config.yaml" \
-print -delete 2>/dev/null || true
rm -rf "$DIST_DIR/update-feed" 2>/dev/null || true
echo "Final cleanup done (v${version} build artifacts cleaned)"
