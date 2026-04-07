#!/usr/bin/env bash
# =============================================================================
# MAINTAINER ONLY — Do not run this script as a regular contributor.
#
# Purpose : Purge CDN cache for installer download URLs after a release so
#           that "latest" alias files and update-feed YMLs take effect
#           immediately without waiting for cache expiry.
#
# Prerequisites:
#   - python3 with tencentcloud-sdk-python-cdn installed:
#       pip3 install --break-system-packages tencentcloud-sdk-python-cdn
#   - CDN credentials set via environment variables:
#       CDN_SECRET_ID   Tencent Cloud SecretId (or set via macOS Keychain)
#       CDN_SECRET_KEY  Tencent Cloud SecretKey (or set via macOS Keychain)
#   - CHERRY_DOWNLOAD_BASE_URL set to your CDN domain
#
# macOS Keychain fallback (original maintainer setup):
#   security add-generic-password -a "cos-secret-id" -s "tencent-cos" -w "<SecretId>" -U
#   security add-generic-password -a "cos-secret-key" -s "tencent-cos" -w "<SecretKey>" -U
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# Prefer explicit env vars; fall back to macOS Keychain for maintainer convenience
if [[ -z "${CDN_SECRET_ID:-}" ]] && command -v security >/dev/null 2>&1; then
  CDN_SECRET_ID="$(security find-generic-password -a "cos-secret-id" -s "tencent-cos" -w 2>/dev/null || true)"
fi
if [[ -z "${CDN_SECRET_KEY:-}" ]] && command -v security >/dev/null 2>&1; then
  CDN_SECRET_KEY="$(security find-generic-password -a "cos-secret-key" -s "tencent-cos" -w 2>/dev/null || true)"
fi

if [[ -z "${CDN_SECRET_ID:-}" || -z "${CDN_SECRET_KEY:-}" ]]; then
  echo "ERROR: CDN credentials not found."
  echo "Set CDN_SECRET_ID and CDN_SECRET_KEY environment variables, or add them to macOS Keychain."
  exit 1
fi

CDN_DOMAIN="${CHERRY_DOWNLOAD_BASE_URL:?CHERRY_DOWNLOAD_BASE_URL must be set to your CDN domain (e.g. https://your-cdn.example.com)}"

# URLs to purge: latest alias files + update-feed YMLs
URLS=(
  "${CDN_DOMAIN}/Cherry-Agent-latest-arm64.dmg"
  "${CDN_DOMAIN}/Cherry-Agent-latest.dmg"
  "${CDN_DOMAIN}/Cherry-Agent-Setup-Latest.exe"
  "${CDN_DOMAIN}/update-feed/mac-arm64/latest-mac.yml"
  "${CDN_DOMAIN}/update-feed/mac-x64/latest-mac.yml"
  "${CDN_DOMAIN}/latest.yml"
)

echo "── Purging CDN cache (${#URLS[@]} URLs) ──"
for u in "${URLS[@]}"; do
  echo "  → $u"
done

python3 - "$CDN_SECRET_ID" "$CDN_SECRET_KEY" "${URLS[@]}" << 'PYEOF'
import sys

secret_id = sys.argv[1]
secret_key = sys.argv[2]
urls = sys.argv[3:]

try:
    from tencentcloud.common import credential
    from tencentcloud.cdn.v20180606 import cdn_client, models
except ImportError:
    print("ERROR: tencentcloud-sdk-python-cdn not installed.")
    print("Run: pip3 install --break-system-packages tencentcloud-sdk-python-cdn")
    sys.exit(1)

cred = credential.Credential(secret_id, secret_key)
client = cdn_client.CdnClient(cred, "")

req = models.PurgeUrlsCacheRequest()
req.Urls = urls
resp = client.PurgeUrlsCache(req)
print(f"CDN purge submitted: TaskId={resp.TaskId}")
PYEOF

echo "CDN cache purge done."
