#!/usr/bin/env bash
set -euo pipefail

# Verify we're in a project with index.html
if [ ! -f "index.html" ]; then
  echo "❌ No index.html found in current directory."
  echo "   Run this script from your project root."
  exit 1
fi

# Detect package manager
if command -v bun &>/dev/null; then
  PM="bun"
  PMX="bunx"
elif command -v pnpm &>/dev/null; then
  PM="pnpm"
  PMX="pnpm dlx"
else
  PM="npm"
  PMX="npx"
fi

echo "📦 Installing bundling dependencies..."
$PM install -D parcel @parcel/config-default parcel-resolver-tspaths html-inline

# Create Parcel config with path alias support
cat > .parcelrc << 'EOF'
{
  "extends": "@parcel/config-default",
  "resolvers": ["parcel-resolver-tspaths", "..."]
}
EOF

echo "🔨 Building with Parcel..."
# Clean previous build
rm -rf parcel-dist .parcel-cache

$PMX parcel build index.html --no-source-maps --dist-dir parcel-dist

echo "📄 Inlining assets into single HTML..."
$PMX html-inline -i parcel-dist/index.html -o bundle.html -b parcel-dist

# Clean up build artifacts
rm -rf parcel-dist .parcel-cache

FILE_SIZE=$(wc -c < bundle.html | tr -d ' ')
echo ""
echo "✅ Bundled to bundle.html (${FILE_SIZE} bytes)"
echo "   This self-contained HTML file can be shared as a Claude artifact."
