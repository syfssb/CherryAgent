#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "Repairing dependency workspace for faster packaging..."

old_node_modules=""
if [[ -d node_modules ]]; then
	project_name="$(basename "$ROOT_DIR")"
	parent_dir="$(dirname "$ROOT_DIR")"
	old_node_modules="$parent_dir/.${project_name}.node_modules.__old__.$(date +%s)"
	echo "Renaming existing node_modules to $old_node_modules..."
	mv node_modules "$old_node_modules"
fi

echo "Removing package-manager cache folders..."
rm -rf .turbo .vite

echo "Reinstalling dependencies with bun..."
bun install

if [[ -n "$old_node_modules" && -d "$old_node_modules" ]]; then
	echo "Cleaning old node_modules in background..."
	nohup rm -rf "$old_node_modules" >/dev/null 2>&1 &
fi

echo "Done. You can now run:"
echo "  bun run dist:mac-arm64"
