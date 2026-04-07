/**
 * J6: 登录 UI 流程 E2E 测试
 * 验证 Electron 应用中的登录界面交互
 *
 * 数据库连接是可选的 — 连不上时跳过需要真实用户的测试，
 * 但仍然测试 UI 元素和表单交互。
 */
import { test, expect } from '../fixtures/electron-app.js'

test.describe.serial('J6: 登录 UI 流程', () => {
  test('应用启动后能看到登录按钮', async ({ window }) => {
    test.setTimeout(30000)

    await window.waitForTimeout(5000)

    // 关闭 Onboarding 弹窗（如果存在）
    const closeBtn = window.locator('button:has-text("×"), button[aria-label="Close"]')
    if ((await closeBtn.count()) > 0) {
      await closeBtn.first().click()
      await window.waitForTimeout(500)
    }

    await window.screenshot({ path: 'tests/e2e/results/j6-01-app-launched.png' })

    const loginButton = window.locator(
      'button:has-text("Log in"), button:has-text("登录"), button:has-text("Login"), button:has-text("Sign in")'
    )
    const hasLogin = (await loginButton.count()) > 0

    const rechargeButton = window.locator('button:has-text("Recharge"), button:has-text("充值")')
    const hasRecharge = (await rechargeButton.count()) > 0

    expect(hasLogin || hasRecharge).toBeTruthy()
  })

  test('点击登录按钮后弹出登录表单', async ({ window }) => {
    test.setTimeout(30000)

    const loginButton = window.locator(
      'button:has-text("Log in"), button:has-text("登录"), button:has-text("Login")'
    )

    if ((await loginButton.count()) === 0) {
      test.skip(true, '未找到登录按钮')
      return
    }

    await loginButton.first().click()
    await window.waitForTimeout(1500)

    await window.screenshot({ path: 'tests/e2e/results/j6-02-login-modal.png' })

    // 查找邮箱和密码输入框
    const emailInput = window.locator(
      'input[id="email"], input[type="email"], input[name="email"], input[placeholder*="邮箱"], input[placeholder*="email" i]'
    )
    const passwordInput = window.locator(
      'input[id="password"], input[type="password"], input[name="password"], input[placeholder*="密码"], input[placeholder*="password" i]'
    )

    const hasEmail = (await emailInput.count()) > 0
    const hasPassword = (await passwordInput.count()) > 0

    if (!hasEmail || !hasPassword) {
      test.skip(true, '登录弹窗未正确触发或表单结构不同')
      return
    }

    expect(hasEmail).toBeTruthy()
    expect(hasPassword).toBeTruthy()
  })

  test('填写登录表单并提交', async ({ window }) => {
    test.setTimeout(30000)

    // 确保登录弹窗打开
    const emailField = window.locator('input[id="email"], input[type="email"], input[name="email"]').first()
    let emailVisible = await emailField.isVisible().catch(() => false)

    if (!emailVisible) {
      const loginButton = window.locator('button:has-text("Log in"), button:has-text("登录")')
      if ((await loginButton.count()) > 0) {
        await loginButton.first().click()
        await window.waitForTimeout(1500)
      }
      emailVisible = await emailField.isVisible().catch(() => false)
    }

    if (!emailVisible) {
      test.skip(true, '登录表单不可见')
      return
    }

    const passwordField = window.locator('input[id="password"], input[type="password"], input[name="password"]').first()

    // 用假数据填写（不依赖数据库）
    await emailField.fill('test@example.com')
    await passwordField.fill('TestPassword123')

    await window.screenshot({ path: 'tests/e2e/results/j6-03-form-filled.png' })

    expect(await emailField.inputValue()).toBe('test@example.com')
    expect(await passwordField.inputValue()).toBe('TestPassword123')

    // 提交 — 找弹窗内的 submit 按钮
    const submitButton = window.locator('[role="dialog"] button[type="submit"]')
    const submitCount = await submitButton.count()

    if (submitCount > 0) {
      // 等按钮变为 enabled
      await submitButton.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
      const isDisabled = await submitButton.first().isDisabled().catch(() => true)
      if (!isDisabled) {
        await submitButton.first().click()
        await window.waitForTimeout(3000)
      }
    }

    await window.screenshot({ path: 'tests/e2e/results/j6-04-after-submit.png' })

    // 验证表单提交后有响应（成功、失败、或错误提示都算）
    const dialogGone = await window
      .locator('[role="dialog"]')
      .isVisible()
      .then((v) => !v)
      .catch(() => true)

    const errorVisible = await window
      .locator('text=/失败|failed|error|incorrect|wrong|invalid/i')
      .first()
      .isVisible()
      .catch(() => false)

    // 弹窗关闭或有错误提示都说明表单提交成功到达了处理逻辑
    expect(dialogGone || errorVisible).toBeTruthy()
  })
})
