#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── 统一清理 trap：确保失败路径也能清理 Python 临时文件 ──
_cleanup_python() { rm -rf "$ROOT_DIR/resources/python-current" "$ROOT_DIR/electron-builder.python.json"; }
trap _cleanup_python EXIT

cd "$ROOT_DIR"

# ── Ensure Windows Codex CLI binary is present ──
# bun install only downloads optionalDependencies for the host platform.
# When cross-compiling for Windows from Mac/Linux, the win32-x64 binary
# won't exist. Install it via npm pack + extract to avoid EBADPLATFORM.
codex_version="$(node -e "const p=require('./node_modules/@openai/codex/package.json'); console.log(p.version)")"
win_pkg_dir="node_modules/@openai/codex-win32-x64"
win_pkg_triple="x86_64-pc-windows-msvc"

if [[ ! -d "$win_pkg_dir/vendor/$win_pkg_triple/codex" ]]; then
	echo "Installing @openai/codex-win32-x64 (v${codex_version}) for Windows build..."
	tmp_dir="$(mktemp -d)"
	spec="@openai/codex@${codex_version}-win32-x64"
	tarball_name="$(npm pack "$spec" --silent --pack-destination "$tmp_dir" | tail -n 1)"
	tar -xzf "$tmp_dir/$tarball_name" -C "$tmp_dir"
	mkdir -p "node_modules/@openai"
	rm -rf "$win_pkg_dir"
	mv "$tmp_dir/package" "$win_pkg_dir"
	rm -rf "$tmp_dir"

	if [[ ! -d "$win_pkg_dir/vendor/$win_pkg_triple/codex" ]]; then
		echo "Warning: Failed to install codex-win32-x64. Codex CLI may not work on Windows."
	fi
fi

# ── Ensure busybox-w32 (coreutils only) is present for Windows build ──
# busybox-w32 provides lightweight POSIX coreutils (ls, cat, grep, sed, etc.)
# for Windows. It is used ONLY as coreutils — NOT as bash/sh.
# Real bash comes from MSYS2 (see below) for full bash syntax compatibility.
VENDOR_DIR="resources/vendor/win32"
BUSYBOX_EXE="$VENDOR_DIR/busybox.exe"
BUSYBOX_VARIANT="busybox64u"
BUSYBOX_VARIANT_FILE="$VENDOR_DIR/.busybox-variant"
BUSYBOX_DOWNLOAD_URL="https://frippery.org/files/busybox/busybox64u.exe"

needs_busybox_refresh=false
if [[ ! -f "$BUSYBOX_EXE" ]]; then
	needs_busybox_refresh=true
elif [[ ! -f "$BUSYBOX_VARIANT_FILE" ]] || [[ "$(cat "$BUSYBOX_VARIANT_FILE" 2>/dev/null || true)" != "$BUSYBOX_VARIANT" ]]; then
	needs_busybox_refresh=true
fi

if [[ "$needs_busybox_refresh" == "true" ]]; then
	echo "Downloading busybox-w32 (POSIX coreutils for Windows)..."
	mkdir -p "$VENDOR_DIR"
	# 使用 busybox64u.exe（Unicode 变体）：支持中文用户名路径 (busybox-w32 issue #447)
	tmp_busybox="$(mktemp "$VENDOR_DIR/busybox64u.XXXXXX")"
	curl -fsSL "$BUSYBOX_DOWNLOAD_URL" -o "$tmp_busybox"
	mv "$tmp_busybox" "$BUSYBOX_EXE"
	printf '%s\n' "$BUSYBOX_VARIANT" > "$BUSYBOX_VARIANT_FILE"
	echo "busybox-w32 coreutils downloaded: $(du -h "$BUSYBOX_EXE" | cut -f1)"
else
	echo "busybox-w32 coreutils already present: $BUSYBOX_EXE"
fi

# ── Ensure MSYS2 real bash + cygpath + all runtime DLLs ──
# Claude Code 官方要求 Git Bash（真正的 GNU Bash），不是 busybox ash。
# busybox ash 不支持 [[ ]]、数组、extglob、进程替换等 bash 专有语法，
# 导致 AI 生成的 bash 命令偶发失败 → 反复重试 → 超时。
#
# 从 MSYS2 pinned packages 提取最小依赖集：
#   bash        → bash.exe (GNU Bash 5.3, ~1.5MB)
#   msys2-runtime → msys-2.0.dll (~3.5MB) + cygpath.exe (~50KB)
#   libreadline → msys-readline8.dll (~250KB, bash 行编辑依赖)
#   ncurses     → msys-ncursesw6.dll (~250KB, readline 依赖)
#   libintl     → msys-intl-8.dll (~500KB, cygpath 运行时依赖)
#   libiconv    → msys-iconv-2.dll (~500KB, libintl 依赖)
#   gcc-libs    → msys-gcc_s-seh-1.dll (~100KB, ncurses 传递依赖)
BASH_EXE="$VENDOR_DIR/bash.exe"
SH_EXE="$VENDOR_DIR/sh.exe"
CYGPATH_EXE="$VENDOR_DIR/cygpath.exe"
MSYS_DLL="$VENDOR_DIR/msys-2.0.dll"
MSYS_READLINE_DLL="$VENDOR_DIR/msys-readline8.dll"
MSYS_NCURSES_DLL="$VENDOR_DIR/msys-ncursesw6.dll"
MSYS_INTL_DLL="$VENDOR_DIR/msys-intl-8.dll"
MSYS_ICONV_DLL="$VENDOR_DIR/msys-iconv-2.dll"
MSYS_GCC_DLL="$VENDOR_DIR/msys-gcc_s-seh-1.dll"

# 标记文件：记录 bash 来源类型，版本变更时强制刷新
BASH_SOURCE_FILE="$VENDOR_DIR/.bash-source"
BASH_SOURCE_TAG="msys2-bash-5.3.009"

needs_msys2_refresh=false
if [[ ! -f "$BASH_EXE" ]] || [[ ! -f "$CYGPATH_EXE" ]] || [[ ! -f "$MSYS_DLL" ]] \
   || [[ ! -f "$MSYS_READLINE_DLL" ]] || [[ ! -f "$MSYS_NCURSES_DLL" ]] \
   || [[ ! -f "$MSYS_INTL_DLL" ]] || [[ ! -f "$MSYS_ICONV_DLL" ]] || [[ ! -f "$MSYS_GCC_DLL" ]]; then
	needs_msys2_refresh=true
elif [[ ! -f "$BASH_SOURCE_FILE" ]] || [[ "$(cat "$BASH_SOURCE_FILE" 2>/dev/null || true)" != "$BASH_SOURCE_TAG" ]]; then
	needs_msys2_refresh=true
fi

if [[ "$needs_msys2_refresh" == "true" ]]; then
	echo "Downloading MSYS2 real bash + cygpath + runtime DLLs..."
	mkdir -p "$VENDOR_DIR"

	# Ensure zstd is available to decompress MSYS2 .pkg.tar.zst packages
	if ! command -v zstd &>/dev/null; then
		if command -v brew &>/dev/null; then
			echo "  Installing zstd via Homebrew..."
			brew install zstd
		else
			echo "ERROR: zstd is required to extract pinned MSYS2 packages."
			echo "Install zstd first, then rerun the build:"
			echo "  macOS: brew install zstd"
			echo "  Ubuntu/Debian: sudo apt-get install zstd"
			echo "  Arch: sudo pacman -S zstd"
			exit 1
		fi
	fi

	TMP_MSYS="$(mktemp -d)"

	# Helper: download + decompress a MSYS2 package and copy files to VENDOR_DIR
	extract_msys2_pkg() {
		local url="$1"
		shift
		local files=("$@")
		local pkg_name
		pkg_name="$(basename "$url")"
		echo "  Downloading $pkg_name..."
		curl -fsSL "$url" -o "$TMP_MSYS/$pkg_name"
		zstd -q -d "$TMP_MSYS/$pkg_name" -o "$TMP_MSYS/${pkg_name%.zst}"
		for f in "${files[@]}"; do
			tar -xf "$TMP_MSYS/${pkg_name%.zst}" -C "$TMP_MSYS" "./$f" 2>/dev/null \
				|| tar -xf "$TMP_MSYS/${pkg_name%.zst}" -C "$TMP_MSYS" "$f" 2>/dev/null \
				|| { echo "  Warning: $f not found in $pkg_name"; continue; }
			cp "$TMP_MSYS/$f" "$VENDOR_DIR/$(basename "$f")"
			echo "  Extracted $(basename "$f"): $(du -h "$VENDOR_DIR/$(basename "$f")" | cut -f1)"
		done
	}

	# Pinned MSYS2 package versions for reproducible builds
	# Mirror: https://mirror.msys2.org/msys/x86_64/

	# 1. GNU Bash 5.3 — 真正的 bash，完整支持 [[ ]]、数组、extglob 等语法
	extract_msys2_pkg \
		"https://mirror.msys2.org/msys/x86_64/bash-5.3.009-1-x86_64.pkg.tar.zst" \
		"usr/bin/bash.exe"

	# 2. MSYS2 核心运行时 + cygpath（路径转换）
	extract_msys2_pkg \
		"https://mirror.msys2.org/msys/x86_64/msys2-runtime-3.6.7-1-x86_64.pkg.tar.zst" \
		"usr/bin/msys-2.0.dll" "usr/bin/cygpath.exe"

	# 3. libreadline — bash 行编辑依赖（即使非交互模式也必须加载）
	extract_msys2_pkg \
		"https://mirror.msys2.org/msys/x86_64/libreadline-8.2.013-1-x86_64.pkg.tar.zst" \
		"usr/bin/msys-readline8.dll"

	# 4. ncurses — readline 的运行时依赖
	extract_msys2_pkg \
		"https://mirror.msys2.org/msys/x86_64/ncurses-6.5.20240831-2-x86_64.pkg.tar.zst" \
		"usr/bin/msys-ncursesw6.dll"

	# 5. libintl + libiconv — cygpath 和 bash 的国际化依赖
	extract_msys2_pkg \
		"https://mirror.msys2.org/msys/x86_64/libintl-0.22.5-1-x86_64.pkg.tar.zst" \
		"usr/bin/msys-intl-8.dll"

	extract_msys2_pkg \
		"https://mirror.msys2.org/msys/x86_64/libiconv-1.17-1-x86_64.pkg.tar.zst" \
		"usr/bin/msys-iconv-2.dll"

	# 6. GCC 运行时 — ncurses 的传递依赖（bash → readline → ncurses → gcc-libs）
	extract_msys2_pkg \
		"https://mirror.msys2.org/msys/x86_64/gcc-libs-15.2.0-1-x86_64.pkg.tar.zst" \
		"usr/bin/msys-gcc_s-seh-1.dll"

	# sh.exe = bash.exe 的副本（Claude CLI 可能用 sh 作为 fallback）
	if [[ -f "$BASH_EXE" ]]; then
		cp "$BASH_EXE" "$SH_EXE"
	fi

	rm -rf "$TMP_MSYS"

	# 写入来源标记
	printf '%s\n' "$BASH_SOURCE_TAG" > "$BASH_SOURCE_FILE"

	# 验证完整性
	missing=()
	for f in "$BASH_EXE" "$SH_EXE" "$CYGPATH_EXE" "$MSYS_DLL" "$MSYS_READLINE_DLL" \
	         "$MSYS_NCURSES_DLL" "$MSYS_INTL_DLL" "$MSYS_ICONV_DLL" "$MSYS_GCC_DLL"; do
		[[ -f "$f" ]] || missing+=("$(basename "$f")")
	done
	if [[ ${#missing[@]} -eq 0 ]]; then
		echo "MSYS2 bash + cygpath + all runtime DLLs ready in $VENDOR_DIR"
	else
		echo "WARNING: Missing files after download: ${missing[*]}"
		echo "Claude Bash tool may not work correctly on Windows."
	fi
else
	echo "MSYS2 real bash + runtime already present: $BASH_EXE"
fi

# ── Prepare bundled Python for Windows ──
python_src="resources/python/win32-x64/python"
python_dest="resources/python-current"

if [[ -d "$python_src" ]]; then
	echo "Preparing bundled Python for Windows..."
	rm -rf "$python_dest"
	cp -R "$python_src" "$python_dest"
elif [[ "${BUNDLE_PYTHON:-false}" == "true" ]]; then
	echo "ERROR: BUNDLE_PYTHON=true but Python not found at $python_src"
	echo "Run 'bash scripts/download-python.sh win32-x64' first."
	exit 1
else
	echo "No bundled Python found for win32-x64, skipping (set BUNDLE_PYTHON=true to require it)."
fi

# ── 动态注入 Python extraResources ──
BUILDER_CONFIG="electron-builder.json"
if [[ -d "resources/python-current" ]] && [[ -n "$(ls -A resources/python-current 2>/dev/null)" ]]; then
	echo "Python detected, generating build config with Python extraResources..."
	python3 -c "
import json
with open('electron-builder.json') as f:
    config = json.load(f)
extra = config.get('extraResources', [])
extra.append({'from': 'resources/python-current', 'to': 'python', 'filter': ['**/*']})
config['extraResources'] = extra
with open('electron-builder.python.json', 'w') as f:
    json.dump(config, f, indent=2)
"
	BUILDER_CONFIG="electron-builder.python.json"
fi

set +e
npx electron-builder --win --x64 --publish always --config "$BUILDER_CONFIG"
pack_status=$?
set -e

if [[ "$OSTYPE" == "darwin"* || "$OSTYPE" == "linux"* ]]; then
	echo "Restoring better-sqlite3 for local development..."
	npx electron-rebuild -f -w better-sqlite3 >/dev/null 2>&1 || true
fi

exit "$pack_status"
