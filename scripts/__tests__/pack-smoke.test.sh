#!/usr/bin/env bash
# 打包脚本 smoke test — 验证逻辑分支，不实际打包
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

PASS=0
FAIL=0
report() { echo "  $1"; }
pass() { PASS=$((PASS + 1)); report "✓ $1"; }
fail() { FAIL=$((FAIL + 1)); report "✗ $1"; }

# ── Test 1: download-python.sh 无 checksum lock 时应报错退出 ──
echo "Test 1: download-python.sh fail-closed without checksum lock"
tmpdir=$(mktemp -d)
# Recreate proper directory structure: tmpdir/scripts/download-python.sh + tmpdir as PROJECT_ROOT
mkdir -p "$tmpdir/scripts"
cp scripts/download-python.sh "$tmpdir/scripts/"
pushd "$tmpdir" > /dev/null
mkdir -p resources/python
# No checksum lock → should fail
# 注意：不用管道，因为 pipefail 会让整个管道返回非零退出码
output=$(bash scripts/download-python.sh darwin-arm64 2>&1 || true)
if echo "$output" | grep -q "ERROR\|not found"; then
  pass "download-python.sh correctly fails without checksum lock"
else
  fail "download-python.sh should fail without checksum lock"
fi
popd > /dev/null
rm -rf "$tmpdir"

# ── Test 2: download-python.sh 版本 stamp 缓存命中 ──
echo "Test 2: download-python.sh cache hit with valid stamp"
tmpdir=$(mktemp -d)
mkdir -p "$tmpdir/scripts"
cp scripts/download-python.sh "$tmpdir/scripts/"
pushd "$tmpdir" > /dev/null
# 提取脚本中的版本号
PYTHON_VERSION=$(grep '^PYTHON_VERSION=' scripts/download-python.sh | cut -d'"' -f2)
RELEASE_TAG=$(grep '^RELEASE_TAG=' scripts/download-python.sh | cut -d'"' -f2)
# 创建假的缓存目录和 stamp
mkdir -p "resources/python/darwin-arm64/python/bin"
touch "resources/python/darwin-arm64/python/bin/python3"
# 创建 dummy checksum lock
echo "darwin-arm64=dummy" > scripts/python-checksums.lock
# stamp 必须包含 lock hash
LOCK_HASH=$(shasum -a 256 scripts/python-checksums.lock | awk '{print $1}' | head -c 12)
echo "${PYTHON_VERSION}+${RELEASE_TAG}+lock:${LOCK_HASH}" > "resources/python/darwin-arm64/.python-stamp"
output=$(bash scripts/download-python.sh darwin-arm64 2>&1 || true)
if echo "$output" | grep -q "Cache hit\|already cached\|skipping download"; then
  pass "download-python.sh correctly skips cached platform"
else
  fail "download-python.sh should skip when stamp matches"
fi
popd > /dev/null
rm -rf "$tmpdir"

# ── Test 3: pack-mac.sh 语法有效 ──
echo "Test 3: pack-mac.sh syntax validation"
if bash -n scripts/pack-mac.sh 2>/dev/null; then
  pass "pack-mac.sh syntax is valid"
else
  fail "pack-mac.sh has syntax errors"
fi

# ── Test 4: pack-win.sh 语法有效 ──
echo "Test 4: pack-win.sh syntax validation"
if bash -n scripts/pack-win.sh 2>/dev/null; then
  pass "pack-win.sh syntax is valid"
else
  fail "pack-win.sh has syntax errors"
fi

# ── Test 5: entitlement 文件分离 ──
echo "Test 5: entitlement files separation"
if [[ -f "build/entitlements.mac.plist" ]]; then
  if grep -q "disable-library-validation" "build/entitlements.mac.plist"; then
    fail "Production entitlement should NOT contain disable-library-validation"
  else
    pass "Production entitlement correctly excludes disable-library-validation"
  fi
else
  report "SKIP: build/entitlements.mac.plist not found"
fi

if [[ -f "build/entitlements.mac.unsigned.plist" ]]; then
  if grep -q "disable-library-validation" "build/entitlements.mac.unsigned.plist"; then
    pass "Unsigned entitlement correctly includes disable-library-validation"
  else
    fail "Unsigned entitlement should include disable-library-validation"
  fi
else
  fail "build/entitlements.mac.unsigned.plist not found"
fi

# ── Test 6: bundled-runtime.ts 不含 ELECTRON_RUN_AS_NODE 赋值 ──
echo "Test 6: bundled-runtime.ts does not globally inject ELECTRON_RUN_AS_NODE"
if grep -q 'patch\.ELECTRON_RUN_AS_NODE\|patch\["ELECTRON_RUN_AS_NODE"\]' src/electron/libs/bundled-runtime.ts; then
  fail "bundled-runtime.ts should NOT assign patch.ELECTRON_RUN_AS_NODE"
else
  pass "bundled-runtime.ts correctly omits ELECTRON_RUN_AS_NODE assignment"
fi

# ── Test 7: bundled-runtime.ts 不含 PYTHONHOME 直接注入 ──
echo "Test 7: bundled-runtime.ts does not globally inject PYTHONHOME"
if grep -q "patch\.PYTHONHOME\b" src/electron/libs/bundled-runtime.ts; then
  fail "bundled-runtime.ts should NOT directly set patch.PYTHONHOME (use CHERRY_PYTHONHOME instead)"
else
  pass "bundled-runtime.ts correctly uses CHERRY_PYTHONHOME instead of PYTHONHOME"
fi

# ── Test 8: SKILL.md 文件包含 runtime 模板 ──
echo "Test 8: SKILL.md files contain runtime template"
for skill in pptx xlsx pdf docx; do
  skillfile="resources/preset-skills/$skill/SKILL.md"
  if [[ -f "$skillfile" ]]; then
    if grep -q "CHERRY_NODE" "$skillfile"; then
      pass "$skill/SKILL.md contains CHERRY_NODE reference"
    else
      fail "$skill/SKILL.md missing CHERRY_NODE reference"
    fi
  else
    fail "$skillfile not found"
  fi
done

# ── Test 9: download-python.sh 不接受非法平台名 ──
echo "Test 9: download-python.sh rejects invalid platform"
tmpdir=$(mktemp -d)
mkdir -p "$tmpdir/scripts"
cp scripts/download-python.sh "$tmpdir/scripts/"
pushd "$tmpdir" > /dev/null
echo "test=dummy" > scripts/python-checksums.lock
output=$(bash scripts/download-python.sh invalid-platform 2>&1 || true)
if echo "$output" | grep -qi "ERROR\|unknown\|invalid"; then
  pass "download-python.sh correctly rejects invalid platform"
else
  fail "download-python.sh should reject invalid platform"
fi
popd > /dev/null
rm -rf "$tmpdir"

# ── Test 10: 环境变量清理 ──
echo "Test 10: bundled-runtime.ts cleans high-risk env vars"
for var in NODE_OPTIONS PYTHONPATH PYTHONSTARTUP PYTHONUSERBASE; do
  if grep -q "patch\.$var" src/electron/libs/bundled-runtime.ts; then
    pass "bundled-runtime.ts cleans $var"
  else
    fail "bundled-runtime.ts should clean $var"
  fi
done

# ── Summary ──
echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
