#!/bin/bash

# Stripe 配置脚本
# 用于通过 API 配置 Stripe 支付

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

echo "==================================="
echo "Stripe 配置工具"
echo "==================================="
echo ""

# 1. 登录获取 token
echo "步骤 1: 登录管理后台..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败！请检查管理员账号密码"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ 登录成功"
echo ""

# 2. 获取当前 Stripe 配置
echo "步骤 2: 获取当前 Stripe 配置..."
CURRENT_CONFIG=$(curl -s -X GET "$API_BASE_URL/api/admin/settings/payment/channels/stripe" \
  -H "Authorization: Bearer $TOKEN")

echo "当前配置:"
echo "$CURRENT_CONFIG" | jq '.'
echo ""

# 3. 提示用户输入配置
echo "步骤 3: 请输入 Stripe 配置信息"
echo "-----------------------------------"
echo ""

read -p "Stripe Publishable Key (pk_test_... 或 pk_live_...): " PUBLISHABLE_KEY
read -p "Stripe Secret Key (sk_test_... 或 sk_live_...): " SECRET_KEY
read -p "Stripe Webhook Secret (whsec_...): " WEBHOOK_SECRET

echo ""
echo "确认配置信息:"
echo "  Publishable Key: ${PUBLISHABLE_KEY:0:20}..."
echo "  Secret Key: ${SECRET_KEY:0:20}..."
echo "  Webhook Secret: ${WEBHOOK_SECRET:0:20}..."
echo ""

read -p "确认更新配置？(y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
  echo "已取消"
  exit 0
fi

# 4. 更新配置
echo ""
echo "步骤 4: 更新 Stripe 配置..."

UPDATE_RESPONSE=$(curl -s -X PUT "$API_BASE_URL/api/admin/settings/payment/channels/stripe" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"enabled\": true,
    \"config\": {
      \"stripePublishableKey\": \"$PUBLISHABLE_KEY\",
      \"stripeSecretKey\": \"$SECRET_KEY\",
      \"stripeWebhookSecret\": \"$WEBHOOK_SECRET\"
    }
  }")

echo "更新结果:"
echo "$UPDATE_RESPONSE" | jq '.'
echo ""

# 5. 验证配置
echo "步骤 5: 验证配置..."
VERIFY_RESPONSE=$(curl -s -X GET "$API_BASE_URL/api/billing/payment-methods")

echo "可用支付方式:"
echo "$VERIFY_RESPONSE" | jq '.'
echo ""

if echo "$VERIFY_RESPONSE" | grep -q '"id":"stripe"'; then
  echo "✅ Stripe 配置成功！"
  echo ""
  echo "下一步："
  echo "1. 在 Stripe Dashboard 配置 Webhook："
  echo "   URL: $API_BASE_URL/api/webhooks/stripe"
  echo "   事件: checkout.session.completed, checkout.session.expired"
  echo ""
  echo "2. 测试支付流程"
else
  echo "❌ Stripe 配置可能有问题，请检查"
fi
