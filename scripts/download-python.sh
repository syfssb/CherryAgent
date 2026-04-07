#!/usr/bin/env bash
# 下载 python-build-standalone 到 resources/python/{platform}/
# 用法: bash scripts/download-python.sh [darwin-arm64|darwin-x64|win32-x64|all]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

PYTHON_VERSION="3.12.8"
RELEASE_TAG="20241219"
BASE_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}"

# 变体：install_only_stripped（最小体积，无调试符号）
# 使用函数代替 declare -A（macOS 默认 bash 3.2 不支持关联数组）
get_url() {
  local platform=$1
  case "$platform" in
    darwin-arm64) echo "${BASE_URL}/cpython-${PYTHON_VERSION}+${RELEASE_TAG}-aarch64-apple-darwin-install_only_stripped.tar.gz" ;;
    darwin-x64)   echo "${BASE_URL}/cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-apple-darwin-install_only_stripped.tar.gz" ;;
    win32-x64)    echo "${BASE_URL}/cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz" ;;
    *) echo "" ;;
  esac
}

VALID_PLATFORMS="darwin-arm64 darwin-x64 win32-x64"

# ── SHA256 校验：fail-closed 策略 ──
# 必须使用仓库内已审计的 checksum lock 文件（供应链安全）
CHECKSUM_LOCK="scripts/python-checksums.lock"

if [[ ! -f "$CHECKSUM_LOCK" ]]; then
  echo "ERROR: $CHECKSUM_LOCK not found. Cannot verify download integrity."
  echo ""
  echo "To generate the lock file (first-time setup, requires manual audit):"
  echo "  1. Download SHA256SUMS from the release page:"
  echo "     curl -L -o /tmp/SHA256SUMS '${BASE_URL}/SHA256SUMS'"
  echo "  2. Manually verify the checksums (compare with release page / GPG sig)"
  echo "  3. Create $CHECKSUM_LOCK with format:"
  echo "     # Audited by <name> on <date>"
  echo "     # Source: ${BASE_URL}/SHA256SUMS"
  echo "     darwin-arm64=<sha256>"
  echo "     darwin-x64=<sha256>"
  echo "     win32-x64=<sha256>"
  echo "  4. Commit $CHECKSUM_LOCK to the repository"
  exit 1
fi
echo "Using audited checksums from $CHECKSUM_LOCK"

# lock 文件自身的 hash（前 12 字符），用于缓存 stamp
lock_hash=$(shasum -a 256 "$CHECKSUM_LOCK" | awk '{print $1}' | head -c 12)

get_expected_sha() {
  local platform=$1
  grep "^${platform}=" "$CHECKSUM_LOCK" | cut -d= -f2
}

# ── 缓存命中检查 ──
# stamp 格式: ${PYTHON_VERSION}+${RELEASE_TAG}+lock:${lock_hash}
check_cache() {
  local platform=$1
  local dest="resources/python/${platform}"
  local stamp_file="${dest}/.python-stamp"
  local expected_stamp="${PYTHON_VERSION}+${RELEASE_TAG}+lock:${lock_hash}"

  if [[ ! -f "$stamp_file" ]]; then
    return 1
  fi

  local current_stamp
  current_stamp=$(cat "$stamp_file")
  if [[ "$current_stamp" != "$expected_stamp" ]]; then
    return 1
  fi

  # stamp 匹配，但二进制必须真实存在
  if [[ "$platform" == win32-* ]]; then
    [[ -f "${dest}/python/python.exe" ]] && return 0
  else
    [[ -f "${dest}/python/bin/python3" ]] && return 0
  fi

  return 1
}

write_stamp() {
  local platform=$1
  local dest="resources/python/${platform}"
  local stamp_file="${dest}/.python-stamp"
  echo "${PYTHON_VERSION}+${RELEASE_TAG}+lock:${lock_hash}" > "$stamp_file"
}

download_and_verify() {
  local platform=$1
  local url
  url=$(get_url "$platform")
  local expected_sha
  expected_sha=$(get_expected_sha "$platform")

  if [[ -z "$expected_sha" ]]; then
    echo "ERROR: Could not find SHA256 for $platform in $CHECKSUM_LOCK"
    exit 1
  fi

  local dest="resources/python/${platform}"

  # 缓存命中 → 跳过下载
  if check_cache "$platform"; then
    echo "Cache hit for ${platform} (stamp: ${PYTHON_VERSION}+${RELEASE_TAG}+lock:${lock_hash}), skipping download."
    return 0
  fi

  local tarball="/tmp/python-${platform}.tar.gz"

  echo "Downloading Python ${PYTHON_VERSION} for ${platform}..."
  echo "  URL: $url"
  curl -L --fail -o "$tarball" "$url" || { echo "Download failed for $platform"; exit 1; }

  # SHA256 校验
  local actual_sha
  actual_sha=$(shasum -a 256 "$tarball" | awk '{print $1}')
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "SHA256 mismatch for ${platform}!"
    echo "  expected: $expected_sha"
    echo "  actual:   $actual_sha"
    rm -f "$tarball"
    exit 1
  fi
  echo "  SHA256 verified: $actual_sha"

  # 原子替换：先解压到临时目录，再替换目标目录（避免新旧文件混合）
  local tmp_dest="${dest}.tmp.$$"
  rm -rf "$tmp_dest"
  mkdir -p "$tmp_dest"
  tar -xzf "$tarball" -C "$tmp_dest"
  rm -f "$tarball"

  # 替换目标目录
  rm -rf "$dest"
  mv "$tmp_dest" "$dest"

  # 写入缓存 stamp
  write_stamp "$platform"

  echo "  Installed to $dest"
}

# ── Main entry point ──
if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/download-python.sh <platform|all>"
  echo "  platform: $VALID_PLATFORMS"
  exit 1
fi

target="$1"
if [[ "$target" == "all" ]]; then
  for plat in $VALID_PLATFORMS; do
    download_and_verify "$plat"
  done
else
  # 校验平台名合法性
  if ! echo "$VALID_PLATFORMS" | grep -qw "$target"; then
    echo "ERROR: Unknown platform '$target'"
    echo "Valid platforms: $VALID_PLATFORMS"
    exit 1
  fi
  download_and_verify "$target"
fi

echo "Done."
