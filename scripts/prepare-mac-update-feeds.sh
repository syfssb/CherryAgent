#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-installer"
FEED_DIR="$DIST_DIR/update-feed"

version="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync("package.json","utf8")).version)')"

arm_zip="$DIST_DIR/Cherry Agent-${version}-arm64-mac.zip"
arm_block="$arm_zip.blockmap"
x64_zip="$DIST_DIR/Cherry Agent-${version}-mac.zip"
x64_block="$x64_zip.blockmap"

arm_feed_dir="$FEED_DIR/mac-arm64"
x64_feed_dir="$FEED_DIR/mac-x64"

mkdir -p "$arm_feed_dir" "$x64_feed_dir"

echo "Packing arm64 update artifacts..."
bun run dist:mac-arm64:pack-only

if [[ ! -f "$arm_zip" || ! -f "$arm_block" || ! -f "$DIST_DIR/latest-mac.yml" ]]; then
	echo "arm64 update artifacts are missing."
	exit 1
fi

cp -f "$arm_zip" "$arm_feed_dir/"
cp -f "$arm_block" "$arm_feed_dir/"
cp -f "$DIST_DIR/latest-mac.yml" "$arm_feed_dir/latest-mac.yml"

echo "Packing x64 update artifacts..."
bun run dist:mac-x64:pack-only

if [[ ! -f "$x64_zip" || ! -f "$x64_block" || ! -f "$DIST_DIR/latest-mac.yml" ]]; then
	echo "x64 update artifacts are missing."
	exit 1
fi

cp -f "$x64_zip" "$x64_feed_dir/"
cp -f "$x64_block" "$x64_feed_dir/"
cp -f "$DIST_DIR/latest-mac.yml" "$x64_feed_dir/latest-mac.yml"

echo "Done. Upload these two folders to your update server:"
echo "  - dist-installer/update-feed/mac-arm64"
echo "  - dist-installer/update-feed/mac-x64"
