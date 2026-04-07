# src/lib/

## Responsibility
通用工具函数库，提供样式工具（cn）、格式化工具（货币、日期、数字）、数据处理（导出CSV、JSON 安全解析等）、验证和映射工具（状态标签、角色标签等）。

## Design
**工具分类：**

1. **样式工具：**
   - cn() — 合并 Tailwind classes（clsx + tailwind-merge）

2. **格式化工具：**
   - formatCurrency(amount, currency) → "xx.xx 积分"
   - formatNumber(num) → "1.2M" / "3.4K" / "5B"
   - formatDateTime(date) → "2025-03-08 14:30:45"
   - formatDate(date) → "2025-03-08"
   - formatRelativeTime(date) → "刚刚" / "5分钟前" / "2天前"
   - copyToClipboard(text) → Promise<boolean>

3. **函数式工具：**
   - debounce<T>(fn, delay) — 返回防抖后的函数
   - throttle<T>(fn, delay) — 返回节流后的函数
   - sleep(ms) — Promise 延迟
   - generateId() → 随机 ID

4. **数据处理：**
   - safeJsonParse<T>(json, fallback) — 安全 JSON 解析，异常返回 fallback
   - maskApiKey(key) — API Key 脱敏（"sk-...xxxx"）
   - exportToCSV(data, filename) — 导出表格数据为 CSV

5. **映射/标签工具：**
   - getUserStatusLabel(status) → "正常" / "已封禁" / "待激活"
   - getUserRoleLabel(role) → "普通用户" / "管理员" / "超级管理员"
   - getPaymentMethodLabel(method) → "支付宝" / "微信" / "Stripe"
   - getRechargeStatusLabel(status) → "待支付" / "已完成" / "失败"
   - getUsageStatusLabel(status) → "成功" / "失败" / "处理中"
   - getModelTypeLabel(type) → "对话" / "补全" / "嵌入"

## Flow
工具使用流：
1. 组件导入所需工具函数
2. 直接调用，得到转换后的值
3. 返回值用于渲染或计算

**示例：**
- 显示用户金额：formatCurrency(user.balance) → "100.00 积分"
- 显示相对时间：formatRelativeTime(createdAt) → "2小时前"
- 表格状态列：getRechargeStatusLabel(record.status)

## Integration
- **依赖：** clsx, tailwind-merge（cn）、无其他外部依赖
- **被依赖：** 所有组件、页面、服务层
- **关键接口：** cn, formatCurrency, formatDateTime, formatNumber, getXxxLabel, exportToCSV, safeJsonParse, maskApiKey
