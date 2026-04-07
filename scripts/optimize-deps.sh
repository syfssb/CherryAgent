#!/usr/bin/env bash

set -euo pipefail

echo "Starting packaging optimization flow..."

echo "Step 1/3: Repair dependencies (remove duplicate node_modules entries)..."
bun run repair:node-modules

echo "Step 2/3: Build desktop artifacts once..."
bun run build:desktop

echo "Step 3/3: Pack macOS arm64 ZIP installer..."
bun run dist:mac-arm64:pack-only

echo "Done."
echo "Installer output: dist-installer/*-arm64-mac.zip"
