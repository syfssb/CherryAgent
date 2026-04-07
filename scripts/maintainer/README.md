# Maintainer Scripts

These scripts are used **only by project maintainers** when publishing official releases.
Contributors working on features or bug fixes do **not** need to run any of these.

## Scripts

### `prepare-cos-update-urls.sh`

Rewrites the download URLs inside the generated update-feed YML files
(`dist-installer/latest.yml`, `dist-installer/update-feed/**/*.yml`) to point
to the configured CDN/storage base URL.

**Prerequisites:**
- Run after electron-builder has produced `dist-installer/` artifacts
- `CHERRY_DOWNLOAD_BASE_URL` must be set to your CDN base URL

**Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `CHERRY_DOWNLOAD_BASE_URL` | Yes | Base URL for installer downloads (e.g. `https://dl.example.com`) |

---

### `deploy-installer-to-cos.sh`

Uploads installer packages (DMG, EXE, ZIP) and update-feed YML files to a
Tencent Cloud COS bucket, then triggers CDN cache purge.

**Prerequisites:**
- `coscli` v1.0.8+ installed (`~/bin/coscli` or in `PATH`)
  Download: https://github.com/tencentyun/coscli/releases
- COS credentials available (env var or macOS Keychain)

**Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `COS_SECRET_ID` | Yes* | Tencent Cloud SecretId |
| `COS_SECRET_KEY` | Yes* | Tencent Cloud SecretKey |
| `COS_BUCKET` | Yes | COS bucket name (e.g. `my-bucket-1234567890`) |
| `COS_REGION` | Yes | COS region (e.g. `ap-hongkong`) |
| `CHERRY_DOWNLOAD_BASE_URL` | Yes | CDN base URL for purge script |

*On macOS, credentials can be stored in Keychain instead:
```bash
security add-generic-password -a "cos-secret-id" -s "tencent-cos" -w "<SecretId>" -U
security add-generic-password -a "cos-secret-key" -s "tencent-cos" -w "<SecretKey>" -U
```

---

### `purge-cdn-cache.sh`

Purges the CDN cache for installer alias files and update-feed YMLs so they
take effect immediately after a release without waiting for TTL expiry.

**Prerequisites:**
- Python 3 with `tencentcloud-sdk-python-cdn`:
  ```bash
  pip3 install tencentcloud-sdk-python-cdn
  ```
- CDN credentials (same as COS credentials above)

**Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `CDN_SECRET_ID` | Yes* | Tencent Cloud SecretId (can share with COS) |
| `CDN_SECRET_KEY` | Yes* | Tencent Cloud SecretKey (can share with COS) |
| `CHERRY_DOWNLOAD_BASE_URL` | Yes | CDN domain to purge (e.g. `https://dl.example.com`) |

*Falls back to macOS Keychain (`tencent-cos` entries) if env vars are not set.

---

### `deploy-update-feed-to-github-pages.sh`

Pushes update-feed YML files to a GitHub Pages branch so electron-updater can
fetch them as the auto-update feed URL.

**Prerequisites:**
- `jq` installed (`brew install jq`)
- GitHub token with `repo` write permission

**Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` or `GH_TOKEN` | Yes | GitHub personal access token |
| `GITHUB_REPO` | Yes | Target repo (`owner/repo`) |
| `GITHUB_PAGES_BRANCH` | No | Branch to push to (default: `gh-pages`) |
| `GITHUB_PAGES_SUBDIR` | No | Subdirectory within the branch (default: root) |
| `GITHUB_PAGES_BASE_URL` | No | Override for the public Pages URL |

---

## Typical Release Flow

```
1. build:desktop          (bun run build:desktop)
2. pack:mac-arm64:dmg     (bash scripts/pack-mac.sh arm64)
3. pack:mac-x64:dmg       (bash scripts/pack-mac.sh x64)
4. prepare:update-feeds:mac
5. pack:win               (bash scripts/pack-win.sh)
6. prepare:update-feeds:cos  → scripts/maintainer/prepare-cos-update-urls.sh
7. deploy:installer:cos      → scripts/maintainer/deploy-installer-to-cos.sh
                                  (includes CDN purge automatically)
8. deploy:update-feed:github → scripts/maintainer/deploy-update-feed-to-github-pages.sh
```
