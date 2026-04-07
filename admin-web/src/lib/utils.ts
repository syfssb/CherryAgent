import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, _currency?: string): string {
  return `¥${amount.toFixed(2)}`
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return formatDate(d)
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function throttle<T extends (...args: unknown[]) => unknown>(fn: T, delay: number) {
  let last = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - last >= delay) {
      last = now
      fn(...args)
    }
  }
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

export function maskApiKey(key: string): string {
  if (key.length <= 12) return '****'
  return `${key.slice(0, 8)}...${key.slice(-4)}`
}

export function getUserStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: '正常',
    suspended: '已封禁',
    pending: '待激活',
  }
  return map[status] || status
}

export function getUserRoleLabel(role: string): string {
  const map: Record<string, string> = {
    user: '普通用户',
    admin: '管理员',
    super_admin: '超级管理员',
    operator: '运营',
  }
  return map[role] || role
}

export function getPaymentMethodLabel(method: string): string {
  const map: Record<string, string> = {
    alipay: '支付宝',
    wechat: '微信支付',
    stripe: 'Stripe',
    paypal: 'PayPal',
    manual: '手动转账',
  }
  return map[method] || method
}

export function getRechargeStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '待支付',
    completed: '已完成',
    failed: '失败',
    refunded: '已退款',
  }
  return map[status] || status
}

export function getUsageStatusLabel(status: string): string {
  const map: Record<string, string> = {
    success: '成功',
    failed: '失败',
    pending: '处理中',
  }
  return map[status] || status
}

export function getModelTypeLabel(type: string): string {
  const map: Record<string, string> = {
    chat: '对话',
    completion: '补全',
    embedding: '嵌入',
    image: '图像',
    audio: '音频',
    video: '视频',
  }
  return map[type] || type
}

export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return
  const headers = Object.keys(data[0] ?? {})
  const csvContent = [
    headers.join(','),
    ...data.map((row) =>
      headers.map((h) => {
        const val = row[h]
        let str = val === null || val === undefined ? '' : String(val)
        // 防止 CSV 公式注入：仅对字符串类型且以 = + - @ 开头的单元格前置制表符
        // 数值类型（number/bigint）不做处理，避免负数被误判
        if (typeof val === 'string' && /^[=+\-@]/.test(str)) {
          str = '\t' + str
        }
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str
      }).join(',')
    ),
  ].join('\n')

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}
