/**
 * 测试辅助函数
 */

import { Page, expect } from '@playwright/test'
import { TIMEOUTS, SELECTORS } from './test-data'

/**
 * 等待任务开始执行
 */
export async function waitForTaskStart(page: Page) {
  // 等待输入框被禁用
  await expect(page.locator(SELECTORS.promptInput)).toBeDisabled({ timeout: TIMEOUTS.MEDIUM })

  // 等待停止按钮出现
  await expect(page.locator(SELECTORS.stopButton)).toBeVisible({ timeout: TIMEOUTS.MEDIUM })
}

/**
 * 等待任务执行完成
 */
export async function waitForTaskComplete(page: Page) {
  // 等待输入框恢复可用
  await expect(page.locator(SELECTORS.promptInput)).toBeEnabled({ timeout: TIMEOUTS.TASK_EXECUTION })

  // 等待发送按钮出现
  await expect(page.locator(SELECTORS.sendButton)).toBeVisible({ timeout: TIMEOUTS.MEDIUM })
}

/**
 * 发送消息并等待任务开始
 */
export async function sendMessage(page: Page, message: string) {
  const input = page.locator(SELECTORS.promptInput)
  await input.fill(message)
  await input.press('Enter')
  await waitForTaskStart(page)
}

/**
 * 停止任务执行
 */
export async function stopTask(page: Page) {
  await page.locator(SELECTORS.stopButton).click()
  await waitForTaskComplete(page)
}

/**
 * 登录（如果需要）
 */
export async function loginIfNeeded(page: Page, email: string, password: string) {
  // 检查是否已登录
  const isLoggedIn = await page.locator('[data-testid="user-menu"]').isVisible()

  if (!isLoggedIn) {
    // 点击登录按钮
    await page.locator('[data-testid="login-button"]').click()

    // 填写登录表单
    await page.locator('[data-testid="email-input"]').fill(email)
    await page.locator('[data-testid="password-input"]').fill(password)
    await page.locator('[data-testid="submit-login"]').click()

    // 等待登录成功
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible({ timeout: TIMEOUTS.LONG })
  }
}

/**
 * 设置工作目录
 */
export async function setWorkingDirectory(page: Page, path: string) {
  // 打开工作目录选择器
  await page.locator('[data-testid="workspace-selector"]').click()

  // 输入路径
  await page.locator('[data-testid="workspace-path-input"]').fill(path)

  // 确认
  await page.locator('[data-testid="workspace-confirm"]').click()

  // 等待工作目录设置完成
  await expect(page.locator('[data-testid="workspace-status"]')).toContainText(path, { timeout: TIMEOUTS.MEDIUM })
}

/**
 * 截图并保存
 */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ path: `tests/e2e/results/screenshots/${name}.png`, fullPage: true })
}

/**
 * 等待网络空闲
 */
export async function waitForNetworkIdle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.LONG })
}

/**
 * 检查元素是否在视口内
 */
export async function isInViewport(page: Page, selector: string): Promise<boolean> {
  return await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    )
  })
}

/**
 * 滚动到元素
 */
export async function scrollToElement(page: Page, selector: string) {
  await page.locator(selector).scrollIntoViewIfNeeded()
}
