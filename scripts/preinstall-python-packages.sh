#!/usr/bin/env bash
# 用内置 Python 的 pip 预装 Skill 依赖包
# 用法: bash scripts/preinstall-python-packages.sh [platform|all]
#   platform: darwin-arm64, darwin-x64, win32-x64
#   all: 遍历所有已下载平台
#   无参数: 同 all
#
# 原生构建: 直接运行目标 Python 的 pip install --require-hashes
# 跨平台构建: pip download --platform 下载目标 wheel，再 pip install --target 安装

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

PYTHON_VERSION="3.12.8"

# 平台名 → pip --platform 字符串映射（函数代替 declare -A，兼容 macOS bash 3.2）
get_pip_platform() {
  local platform=$1
  case "$platform" in
    darwin-arm64) echo "macosx_11_0_arm64" ;;
    darwin-x64)   echo "macosx_10_13_x86_64" ;;
    win32-x64)    echo "win_amd64" ;;
    *) echo "" ;;
  esac
}

# ── 检测当前宿主平台 ──
get_host_platform() {
  local os arch
  os=$(uname -s)
  arch=$(uname -m)
  if [[ "$os" == "Darwin" && "$arch" == "arm64" ]]; then
    echo "darwin-arm64"
  elif [[ "$os" == "Darwin" && "$arch" == "x86_64" ]]; then
    echo "darwin-x64"
  elif [[ "$os" == "MINGW"* || "$os" == "MSYS"* ]]; then
    echo "win32-x64"
  else
    echo "unknown"
  fi
}

# ── 安装包到指定平台的 Python ──
install_packages() {
  local platform=$1
  local python_dir="resources/python/${platform}/python"

  if [[ ! -d "$python_dir" ]]; then
    echo "WARNING: Python directory not found at $python_dir, skipping."
    return
  fi

  # 选择对应平台的 requirements 锁文件
  local req_file="scripts/python-requirements-${platform}.txt"
  if [[ ! -f "$req_file" ]]; then
    echo "ERROR: $req_file not found."
    echo "Run 'pip-compile --generate-hashes --platform $(get_pip_platform "$platform") ...' to generate."
    exit 1
  fi

  local host_platform
  host_platform=$(get_host_platform)

  if [[ "$host_platform" == "$platform" ]]; then
    # ── 原生构建：直接用目标 Python 执行 pip install ──
    local python_bin="$python_dir/bin/python3"
    if [[ ! -f "$python_bin" ]]; then
      python_bin="$python_dir/python.exe"
    fi

    if [[ ! -f "$python_bin" ]]; then
      echo "ERROR: Python binary not found in $python_dir"
      exit 1
    fi

    echo "Native install: $platform (using $python_bin)..."
    "$python_bin" -m pip install --require-hashes -r "$req_file"
    echo "Native install completed for $platform."
  else
    # ── 跨平台构建 ──
    # 1. 创建临时 venv 隔离构建工具
    # 2. pip download --platform 下载目标 wheel 到持久化 wheelhouse
    # 3. pip install --target 安装到目标 Python 的 site-packages
    local pip_platform
    pip_platform=$(get_pip_platform "$platform")

    echo "Cross-platform install: host=$host_platform target=$platform..."
    echo "  Using pip download --platform $pip_platform..."

    # 持久化 wheelhouse：按 Python版本+平台+requirements hash 命名，复用已下载的 wheel
    local req_hash
    req_hash=$(shasum -a 256 "$req_file" | awk '{print $1}' | head -c 12)
    local wheelhouse="resources/python/.wheelhouse/py${PYTHON_VERSION}-${platform}-${req_hash}"

    # 创建临时 venv 以隔离构建工具，不污染宿主 Python 环境
    local build_venv
    build_venv=$(mktemp -d "${TMPDIR:-/tmp}/cherry-build-venv.XXXXXX")
    echo "  Creating isolated build venv at $build_venv..."
    python3 -m venv "$build_venv"
    local venv_pip="$build_venv/bin/pip"
    [[ -f "$build_venv/Scripts/pip.exe" ]] && venv_pip="$build_venv/Scripts/pip.exe"

    # 下载 wheel（缓存命中则跳过）
    if [[ -d "$wheelhouse" ]] && [[ -n "$(ls -A "$wheelhouse" 2>/dev/null)" ]]; then
      echo "  Using cached wheels from $wheelhouse"
    else
      mkdir -p "$wheelhouse"
      "$venv_pip" download \
        --platform "$pip_platform" \
        --python-version 3.12 \
        --implementation cp \
        --abi cp312 \
        --only-binary=:all: \
        --require-hashes \
        -r "$req_file" \
        -d "$wheelhouse"
    fi

    # 确定目标 Python 的 site-packages 路径
    local site_packages
    if [[ "$platform" == win32-* ]]; then
      site_packages="$python_dir/Lib/site-packages"
    else
      site_packages="$python_dir/lib/python3.12/site-packages"
    fi

    # 使用 pip install --target 安装 wheel 到目标 site-packages
    # --target 会将所有包文件平铺安装到指定目录，无需 installer 包
    local venv_pip_bin="$build_venv/bin/pip"
    [[ -f "$build_venv/Scripts/pip.exe" ]] && venv_pip_bin="$build_venv/Scripts/pip.exe"

    echo "  Installing wheels to $site_packages..."
    mkdir -p "$site_packages"

    for whl in "$wheelhouse"/*.whl; do
      echo "  Installing $(basename "$whl")..."
      "$venv_pip_bin" install \
        --target "$site_packages" \
        --no-deps \
        --no-compile \
        "$whl"
    done

    # 注意：不删除 wheelhouse，持久化供下次构建复用
    # 清理临时 venv
    rm -rf "$build_venv"
    echo "Cross-platform install completed for $platform."
  fi
}

# ── 参数处理 ──
VALID_PLATFORMS="darwin-arm64 darwin-x64 win32-x64"

if [[ $# -gt 0 ]]; then
  target="$1"
  if [[ "$target" == "all" ]]; then
    for platform_dir in resources/python/*/python; do
      if [[ -d "$platform_dir" ]]; then
        platform=$(basename "$(dirname "$platform_dir")")
        install_packages "$platform"
      fi
    done
  else
    # 校验平台名合法性
    if ! echo "$VALID_PLATFORMS" | grep -qw "$target"; then
      echo "ERROR: Unknown platform '$target'"
      echo "Valid platforms: $VALID_PLATFORMS"
      exit 1
    fi
    install_packages "$target"
  fi
else
  # 无参数：遍历所有已下载平台
  found=0
  for platform_dir in resources/python/*/python; do
    if [[ -d "$platform_dir" ]]; then
      platform=$(basename "$(dirname "$platform_dir")")
      install_packages "$platform"
      found=1
    fi
  done
  if [[ "$found" -eq 0 ]]; then
    echo "No Python installations found in resources/python/."
    echo "Run 'bash scripts/download-python.sh <platform>' first."
    exit 1
  fi
fi

echo "Done."
