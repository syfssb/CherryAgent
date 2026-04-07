#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── 统一清理 trap：确保 zip/dmg/失败路径都能清理 Python 临时文件 ──
_cleanup_python() { rm -rf "$ROOT_DIR/resources/python-current" "$ROOT_DIR/electron-builder.python.json"; }
trap _cleanup_python EXIT
ARCH="${1:-arm64}"
TARGET="${2:-zip}"
FINAL_OUTPUT_DIR="$ROOT_DIR/dist-installer"

if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
	echo "Unsupported arch: $ARCH"
	echo "Usage: bash scripts/pack-mac.sh [arm64|x64] [zip|dmg]"
	exit 1
fi

if [[ "$TARGET" != "zip" && "$TARGET" != "dmg" ]]; then
	echo "Unsupported target: $TARGET"
	echo "Usage: bash scripts/pack-mac.sh [arm64|x64] [zip|dmg]"
	exit 1
fi

cd "$ROOT_DIR"
app_version="$(node -e 'const fs=require("fs");console.log(JSON.parse(fs.readFileSync("package.json","utf8")).version)')"

host_arch_raw="$(uname -m)"
if [[ "$host_arch_raw" == "arm64" ]]; then
	HOST_ARCH="arm64"
else
	HOST_ARCH="x64"
fi

should_restore_dev_binary=0
if [[ "$HOST_ARCH" != "$ARCH" ]]; then
	should_restore_dev_binary=1
fi

# ── Ensure target-arch Codex CLI binary is present ──
# bun install only downloads optionalDependencies for the host platform/arch.
# When cross-compiling (e.g., arm64 → x64), the target binary won't exist.
codex_version="$(node -e "const p=require('./node_modules/@openai/codex/package.json'); console.log(p.version)")"
codex_target_pkg="@openai/codex-darwin-${ARCH}"
codex_target_dir="node_modules/${codex_target_pkg}"
if [[ "$ARCH" == "arm64" ]]; then
	codex_target_triple="aarch64-apple-darwin"
else
	codex_target_triple="x86_64-apple-darwin"
fi

if [[ ! -d "$codex_target_dir/vendor/$codex_target_triple/codex" ]]; then
	echo "Installing ${codex_target_pkg} (v${codex_version}) for ${ARCH} build..."
	tmp_dir="$(mktemp -d)"
	spec="@openai/codex@${codex_version}-darwin-${ARCH}"
	tarball_name="$(npm pack "$spec" --silent --pack-destination "$tmp_dir" | tail -n 1)"
	tar -xzf "$tmp_dir/$tarball_name" -C "$tmp_dir"
	mkdir -p "node_modules/@openai"
	rm -rf "$codex_target_dir"
	mv "$tmp_dir/package" "$codex_target_dir"
	rm -rf "$tmp_dir"

	if [[ ! -d "$codex_target_dir/vendor/$codex_target_triple/codex" ]]; then
		echo "Warning: Failed to install ${codex_target_pkg}. Codex CLI may not work on macOS ${ARCH}."
	fi
fi

# ── Prepare bundled Python for target arch ──
python_src="resources/python/darwin-${ARCH}/python"
python_dest="resources/python-current"

if [[ -d "$python_src" ]]; then
	echo "Preparing bundled Python for ${ARCH}..."
	rm -rf "$python_dest"
	cp -R "$python_src" "$python_dest"

	# macOS 公证要求：对所有 Mach-O 二进制和 .so/.dylib 签名
	echo "Signing Python binaries for notarization..."

	# 检测是否有可用的 Developer ID 签名身份
	SIGN_IDENTITY="${APPLE_SIGN_IDENTITY:-}"
	if [[ -z "$SIGN_IDENTITY" ]]; then
		SIGN_IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | awk -F'"' '{print $2}' || true)
	fi

	if [[ -n "$SIGN_IDENTITY" ]]; then
		echo "Using Developer ID: $SIGN_IDENTITY"
		# Try with secure timestamp; fall back to no-timestamp if TSA is unavailable.
		# electron-builder will re-sign all binaries with proper timestamps during packaging.
		if codesign --force --sign "$SIGN_IDENTITY" --timestamp --options runtime /usr/bin/true >/dev/null 2>&1; then
			CODESIGN_ARGS=(--force --sign "$SIGN_IDENTITY" --timestamp --options runtime)
		else
			echo "WARNING: Apple timestamp service unavailable. Using --timestamp=none for Python pre-signing."
			echo "         electron-builder will apply proper timestamps during app bundle signing."
			CODESIGN_ARGS=(--force --sign "$SIGN_IDENTITY" --timestamp=none --options runtime)
		fi
	elif [[ "${CHERRY_MAC_UNSIGNED:-}" == "1" ]]; then
		echo "WARNING: No Developer ID found, using ad-hoc signing (CHERRY_MAC_UNSIGNED=1)."
		echo "NOTE: ad-hoc builds use separate entitlement file and should NOT be distributed."
		CODESIGN_ARGS=(--force --sign - --timestamp=none)
	else
		echo "ERROR: No Developer ID found and CHERRY_MAC_UNSIGNED is not set."
		echo "For development builds, set CHERRY_MAC_UNSIGNED=1 to allow ad-hoc signing."
		echo "For release builds, configure Apple Developer ID signing credentials."
		exit 1
	fi

	sign_failures=0
	while IFS= read -r binary; do
		if file "$binary" | grep -q "Mach-O"; then
			if ! codesign "${CODESIGN_ARGS[@]}" "$binary"; then
				echo "ERROR: Failed to sign $binary"
				sign_failures=$((sign_failures + 1))
			fi
		fi
	done < <(find "$python_dest" -type f \( -name "*.so" -o -name "*.dylib" -o -perm +111 \))

	if [[ $sign_failures -gt 0 ]]; then
		echo "ERROR: $sign_failures Python binaries failed to sign. Aborting."
		exit 1
	fi

	# 签名后验证所有 Mach-O 文件
	echo "Verifying all Mach-O signatures..."
	verify_failures=0
	while IFS= read -r binary; do
		if file "$binary" | grep -q "Mach-O"; then
			if ! codesign --verify "$binary" 2>/dev/null; then
				echo "ERROR: Signature verification failed for $binary"
				verify_failures=$((verify_failures + 1))
			fi
		fi
	done < <(find "$python_dest" -type f \( -name "*.so" -o -name "*.dylib" -o -perm +111 \))

	if [[ $verify_failures -gt 0 ]]; then
		echo "ERROR: $verify_failures signatures failed verification. Aborting."
		exit 1
	fi
	echo "All Python binaries signed and verified successfully."
elif [[ "${BUNDLE_PYTHON:-false}" == "true" ]]; then
	echo "ERROR: BUNDLE_PYTHON=true but Python not found at $python_src"
	echo "Run 'bash scripts/download-python.sh darwin-${ARCH}' first."
	exit 1
else
	echo "No bundled Python found for darwin-${ARCH}, skipping (set BUNDLE_PYTHON=true to require it)."
fi

if [[ ! -d node_modules ]]; then
	echo "node_modules not found. Run 'bun install' first."
	exit 1
fi

duplicate_dirs=()
while IFS= read -r -d '' entry; do
	name="$(basename "$entry")"
	if [[ "$name" =~ [[:space:]][0-9]+$ ]]; then
		duplicate_dirs+=("$name")
	fi
done < <(find node_modules -mindepth 1 -maxdepth 1 \( -type d -o -type l \) -print0)

if (( ${#duplicate_dirs[@]} > 0 )); then
	echo "Found duplicated entries in node_modules (this slows packaging a lot):"
	printf '  - %s\n' "${duplicate_dirs[@]}"
	echo "Run 'bun run repair:node-modules' and then retry."
	exit 1
fi

if command -v xattr >/dev/null 2>&1; then
	xattr -cr "$ROOT_DIR/node_modules/electron/dist/Electron.app" 2>/dev/null || true
	xattr -cr "$ROOT_DIR/build" "$ROOT_DIR/resources" "$ROOT_DIR/cherry2-square.png" 2>/dev/null || true
fi

unsigned_mode="${CHERRY_MAC_UNSIGNED:-0}"
builder_output_dir="$FINAL_OUTPUT_DIR"
cleanup_builder_output=0
if [[ "$unsigned_mode" == "1" ]]; then
	echo "Packing unsigned mac artifact (CHERRY_MAC_UNSIGNED=1)."
	export CSC_IDENTITY_AUTO_DISCOVERY=false
	builder_mac_args=(
		-c.mac.identity=null
		-c.mac.hardenedRuntime=false
		-c.mac.gatekeeperAssess=false
	)
else
	echo "Packing signed mac artifact (default)."
	export CSC_IDENTITY_AUTO_DISCOVERY=true
	builder_output_dir="$(mktemp -d "${TMPDIR:-/tmp}/cherry-builder-output-${ARCH}.XXXXXX")"
	cleanup_builder_output=1
	echo "Using temporary build output directory: $builder_output_dir"
	if [[ -n "${CSC_NAME:-}" ]]; then
		if [[ "$CSC_NAME" == Developer\ ID\ Application:\ * ]]; then
			export CSC_NAME="${CSC_NAME#Developer ID Application: }"
			echo "Normalized CSC_NAME to: $CSC_NAME"
		fi
	else
		detected_identity="$(
			security find-identity -v -p codesigning 2>/dev/null \
				| sed -n 's/.*"\(Developer ID Application:.*\)"/\1/p' \
				| head -n 1
		)"
		if [[ -z "$detected_identity" ]]; then
			echo "No Developer ID Application certificate found."
			echo "Please create one in Xcode -> Settings -> Accounts -> Manage Certificates."
			exit 1
		fi
		echo "Detected signing identity: $detected_identity"
	fi
	builder_mac_args=()
fi

builder_target="$TARGET"
if [[ "$TARGET" == "dmg" ]]; then
	builder_target="dir"
fi

mkdir -p "$FINAL_OUTPUT_DIR"

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

max_sign_attempts="${CHERRY_MAC_SIGN_RETRY_MAX:-3}"
sign_retry_delay_base="${CHERRY_MAC_SIGN_RETRY_DELAY_SECONDS:-20}"

run_electron_builder() {
	local config_args=(--config "$BUILDER_CONFIG")
	# CHERRY_MAC_UNSIGNED=1 时使用 unsigned entitlement
	if [[ "${unsigned_mode}" == "1" ]]; then
		config_args+=(
			-c.mac.entitlements=build/entitlements.mac.unsigned.plist
			-c.mac.entitlementsInherit=build/entitlements.mac.unsigned.plist
		)
	fi
	if (( ${#builder_mac_args[@]} > 0 )); then
		npx electron-builder --mac "$builder_target" --"$ARCH" --publish always \
			"${config_args[@]}" \
			-c.directories.output="$builder_output_dir" \
			"${builder_mac_args[@]}"
	else
		npx electron-builder --mac "$builder_target" --"$ARCH" --publish always \
			"${config_args[@]}" \
			-c.directories.output="$builder_output_dir"
	fi
}

attempt=1
builder_log_file=""
pack_status=1
while true; do
	builder_log_file="$(mktemp "${TMPDIR:-/tmp}/cherry-electron-builder-${ARCH}.XXXXXX")"
	echo "Running electron-builder (attempt $attempt/$max_sign_attempts)..."
	set +e
	run_electron_builder 2>&1 | tee "$builder_log_file"
	pack_status=${PIPESTATUS[0]}
	set -e

	if [[ "$pack_status" -eq 0 ]]; then
		break
	fi

	if [[ "$unsigned_mode" != "1" ]] && grep -qi "The timestamp service is not available" "$builder_log_file"; then
		if (( attempt < max_sign_attempts )); then
			sleep_seconds=$((sign_retry_delay_base * attempt))
			echo "Apple timestamp service is unavailable. Retry in ${sleep_seconds}s..."
			rm -f "$builder_log_file"
			builder_log_file=""
			((attempt++))
			sleep "$sleep_seconds"
			continue
		fi
	fi

	break
done

if [[ -n "$builder_log_file" ]]; then
	rm -f "$builder_log_file"
fi

if [[ "$pack_status" -eq 0 && "$TARGET" == "dmg" ]]; then
	product_name="Cherry Agent"
	dmg_background="$ROOT_DIR/assets/dmg-background.png"

	if [[ "$ARCH" == "arm64" ]]; then
		app_bundle="$builder_output_dir/mac-arm64/${product_name}.app"
		dmg_output="$FINAL_OUTPUT_DIR/${product_name}-${app_version}-arm64.dmg"
	else
		app_bundle="$builder_output_dir/mac/${product_name}.app"
		dmg_output="$FINAL_OUTPUT_DIR/${product_name}-${app_version}.dmg"
	fi

	if [[ ! -d "$app_bundle" ]]; then
		echo "App bundle not found: $app_bundle"
		pack_status=1
	else
		stage_dir="$(mktemp -d)"
		rw_dmg="/tmp/${product_name// /_}-${ARCH}-rw-$$.dmg"
		device=""
		mount_point=""
		cleanup() {
			if [[ -n "$device" ]]; then
				hdiutil detach "$device" >/dev/null 2>&1 || true
			elif [[ -n "$mount_point" ]]; then
				hdiutil detach "$mount_point" >/dev/null 2>&1 || true
			fi
			rm -rf "$stage_dir"
			rm -f "$rw_dmg"
			rm -rf "resources/python-current" "electron-builder.python.json"
		}
		trap cleanup EXIT

		ditto "$app_bundle" "$stage_dir/${product_name}.app"
		ln -s /Applications "$stage_dir/Applications"
		if [[ -f "$dmg_background" ]]; then
			mkdir -p "$stage_dir/.background"
			cp "$dmg_background" "$stage_dir/.background/background.png"
		fi

		rm -f "$rw_dmg"
		rm -f "$dmg_output"
		set +e
		hdiutil create \
			-volname "$product_name" \
			-srcfolder "$stage_dir" \
			-ov \
			-format UDRW \
			"$rw_dmg"
		pack_status=$?
		set -e

		if [[ "$pack_status" -eq 0 ]]; then
			attach_output="$(hdiutil attach -readwrite -noverify -noautoopen "$rw_dmg")"
			device="$(echo "$attach_output" | awk '/\/Volumes\//{print $1; exit}')"
			mount_point="$(echo "$attach_output" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')"
			if [[ -z "$device" || -z "$mount_point" ]]; then
				echo "Failed to mount temporary DMG."
				pack_status=1
			else
				volume_name="$(basename "$mount_point")"
				if [[ -f "$mount_point/.background/background.png" ]]; then
					osascript <<APPLE_SCRIPT >/dev/null 2>&1 || echo "Warning: failed to set DMG Finder layout, continuing with default layout."
tell application "Finder"
	tell disk "$volume_name"
		open
		tell container window
			set current view to icon view
			set toolbar visible to false
			set statusbar visible to false
			set bounds to {100, 100, 760, 520}
		end tell
		set theViewOptions to the icon view options of container window
		set arrangement of theViewOptions to not arranged
		set icon size of theViewOptions to 128
		set text size of theViewOptions to 12
		set background picture of theViewOptions to file ".background:background.png"
		set position of item "${product_name}.app" of container window to {150, 230}
		set position of item "Applications" of container window to {510, 230}
		close
		open
		update without registering applications
		delay 1
	end tell
end tell
APPLE_SCRIPT
				fi
				sync
				hdiutil detach "$device" >/dev/null
				device=""
				mount_point=""
				set +e
				hdiutil convert "$rw_dmg" -ov -format UDZO -imagekey zlib-level=9 -o "$dmg_output"
				pack_status=$?
				set -e
			fi
		fi
		trap - EXIT
		cleanup
	fi
fi

if [[ "$pack_status" -eq 0 && "$TARGET" == "zip" ]]; then
	shopt -s nullglob
	zip_files=(
		"$builder_output_dir"/Cherry\ Agent-*mac.zip
		"$builder_output_dir"/Cherry\ Agent-*mac.zip.blockmap
		"$builder_output_dir"/latest-mac.yml
	)
	shopt -u nullglob
	if (( ${#zip_files[@]} > 0 )) && [[ "$builder_output_dir" != "$FINAL_OUTPUT_DIR" ]]; then
		cp -f "${zip_files[@]}" "$FINAL_OUTPUT_DIR/"
	fi
fi

if [[ "$pack_status" -eq 0 && "$TARGET" == "dmg" ]]; then
	notary_profile="${APPLE_KEYCHAIN_PROFILE:-cherry-notary}"
	notary_apple_id="${APPLE_NOTARY_APPLE_ID:-sezenucuzi05@gmail.com}"
	notary_team_id="${APPLE_NOTARY_TEAM_ID:-C36DGH2H9S}"
	notary_password="${APPLE_NOTARY_PASSWORD:-}"
	notary_password_service="${APPLE_NOTARY_PASSWORD_SERVICE:-cherry-notary-password}"
	if [[ "$unsigned_mode" == "1" ]]; then
		echo "Skipping notarization because build is unsigned."
	else
		if ! command -v xcrun >/dev/null 2>&1; then
			echo "xcrun not found. Please install Xcode Command Line Tools."
			exit 1
		fi
		if [[ -z "$notary_password" ]]; then
			if [[ -n "$notary_apple_id" ]]; then
				notary_password="$(security find-generic-password -a "$notary_apple_id" -s "$notary_password_service" -w 2>/dev/null || true)"
			fi
		fi
		if [[ -n "$notary_apple_id" && -n "$notary_team_id" && -n "$notary_password" ]]; then
			echo "Submitting DMG for notarization via Apple ID credentials..."
			xcrun notarytool submit "$dmg_output" \
				--apple-id "$notary_apple_id" \
				--team-id "$notary_team_id" \
				--password "$notary_password" \
				--wait
		elif xcrun notarytool history --keychain-profile "$notary_profile" >/dev/null 2>&1; then
			echo "Submitting DMG for notarization via profile: $notary_profile"
			xcrun notarytool submit "$dmg_output" --keychain-profile "$notary_profile" --wait
		else
			echo "Notarization credentials are missing."
			echo "Option A (recommended here):"
			echo "  security add-generic-password -a \"$notary_apple_id\" -s \"$notary_password_service\" -w \"<APP_SPECIFIC_PASSWORD>\" -U"
			echo "Option B (notarytool profile):"
			echo "  xcrun notarytool store-credentials \"$notary_profile\" --apple-id \"<APPLE_ID>\" --team-id \"<TEAM_ID>\" --password \"<APP_SPECIFIC_PASSWORD>\""
			exit 1
		fi
		echo "Stapling notarization ticket to DMG..."
		xcrun stapler staple "$dmg_output"
		xcrun stapler validate "$dmg_output" || true
	fi
fi

if (( cleanup_builder_output == 1 )); then
	rm -rf "$builder_output_dir"
fi

if (( should_restore_dev_binary == 1 )); then
	echo "Restoring better-sqlite3 for local $HOST_ARCH development..."
	npx electron-rebuild -f -w better-sqlite3 >/dev/null 2>&1 || true
fi

exit "$pack_status"
