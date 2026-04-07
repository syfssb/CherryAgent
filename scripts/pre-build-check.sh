#!/bin/bash

# 构建前检查脚本
# 检查构建所需的所有依赖和文件

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 符号定义
CHECK="✓"
CROSS="✗"
WARN="⚠"

# 错误计数
ERRORS=0
WARNINGS=0

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Cherry Agent 构建前检查${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. 检查 Node.js 版本
echo -e "${BLUE}[1/6]${NC} 检查 Node.js 版本..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}${CHECK}${NC} Node.js 已安装: ${NODE_VERSION}"
else
    echo -e "${RED}${CROSS}${NC} Node.js 未安装"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 2. 检查 Bun 版本
echo -e "${BLUE}[2/6]${NC} 检查 Bun 版本..."
if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    echo -e "${GREEN}${CHECK}${NC} Bun 已安装: v${BUN_VERSION}"
else
    echo -e "${RED}${CROSS}${NC} Bun 未安装"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 3. 检查依赖是否安装
echo -e "${BLUE}[3/6]${NC} 检查依赖安装..."
if [ -d "$PROJECT_ROOT/node_modules" ]; then
    MODULE_COUNT=$(find "$PROJECT_ROOT/node_modules" -maxdepth 1 -type d | wc -l)
    echo -e "${GREEN}${CHECK}${NC} node_modules 存在 (${MODULE_COUNT} 个模块)"
else
    echo -e "${RED}${CROSS}${NC} node_modules 不存在，请运行 'bun install'"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 4. 检查图标文件
echo -e "${BLUE}[4/6]${NC} 检查图标文件..."
ICON_FILE="$PROJECT_ROOT/cherry2-square.png"
if [ -f "$ICON_FILE" ]; then
    ICON_SIZE=$(du -h "$ICON_FILE" | cut -f1)
    echo -e "${GREEN}${CHECK}${NC} 图标文件存在: cherry2-square.png (${ICON_SIZE})"
else
    echo -e "${RED}${CROSS}${NC} 图标文件不存在: cherry2-square.png"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 5. 检查 build 目录和权限文件
echo -e "${BLUE}[5/6]${NC} 检查 build 配置..."
BUILD_DIR="$PROJECT_ROOT/build"
ENTITLEMENTS_FILE="$BUILD_DIR/entitlements.mac.plist"

if [ -d "$BUILD_DIR" ]; then
    echo -e "${GREEN}${CHECK}${NC} build 目录存在"

    if [ -f "$ENTITLEMENTS_FILE" ]; then
        echo -e "${GREEN}${CHECK}${NC} entitlements.mac.plist 存在"
    else
        echo -e "${YELLOW}${WARN}${NC} entitlements.mac.plist 不存在（可能在构建时自动生成）"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${YELLOW}${WARN}${NC} build 目录不存在（可能在构建时自动创建）"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 6. 检查 Git 状态
echo -e "${BLUE}[6/6]${NC} 检查 Git 状态..."
cd "$PROJECT_ROOT"

if [ -d ".git" ]; then
    # 检查是否有未提交的更改
    if git diff-index --quiet HEAD -- 2>/dev/null; then
        echo -e "${GREEN}${CHECK}${NC} 工作目录干净，没有未提交的更改"
    else
        echo -e "${YELLOW}${WARN}${NC} 有未提交的更改"
        WARNINGS=$((WARNINGS + 1))

        # 显示未提交的文件
        MODIFIED_FILES=$(git diff --name-only | head -5)
        if [ -n "$MODIFIED_FILES" ]; then
            echo -e "${YELLOW}  修改的文件:${NC}"
            echo "$MODIFIED_FILES" | while read -r file; do
                echo -e "    - $file"
            done
        fi

        UNTRACKED_FILES=$(git ls-files --others --exclude-standard | head -5)
        if [ -n "$UNTRACKED_FILES" ]; then
            echo -e "${YELLOW}  未跟踪的文件:${NC}"
            echo "$UNTRACKED_FILES" | while read -r file; do
                echo -e "    - $file"
            done
        fi
    fi

    # 显示当前分支
    CURRENT_BRANCH=$(git branch --show-current)
    echo -e "${GREEN}${CHECK}${NC} 当前分支: ${CURRENT_BRANCH}"
else
    echo -e "${YELLOW}${WARN}${NC} 不是 Git 仓库"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 总结
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  检查结果${NC}"
echo -e "${BLUE}========================================${NC}"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}${CHECK} 所有检查通过！可以开始构建。${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}${WARN} 检查完成，有 ${WARNINGS} 个警告${NC}"
    echo -e "${YELLOW}  警告不会阻止构建，但建议检查${NC}"
    exit 0
else
    echo -e "${RED}${CROSS} 检查失败，发现 ${ERRORS} 个错误和 ${WARNINGS} 个警告${NC}"
    echo -e "${RED}  请修复错误后再构建${NC}"
    exit 1
fi
