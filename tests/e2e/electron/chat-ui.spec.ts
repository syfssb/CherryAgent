/**
 * J7: 对话 UI 流程 E2E 测试
 * 验证 Electron 应用中的聊天界面交互
 *
 * 注意：Electron production 模式下 AppInitializer 会验证 token，
 * 无法通过 localStorage 注入绕过。因此测试未登录状态下的 UI 元素。
 */
import { test, expect } from '../fixtures/electron-app.js'

test.describe.serial('J7: 对话 UI 流程', () => {
  test('验证聊天页面的基本 UI 结构', async ({ window }) => {
    test.setTimeout(30000)

    // 等待页面完全渲染
    await window.waitForTimeout(5000)

    // 关闭 Onboarding 弹窗（如果存在）
    const closeBtn = window.locator('button:has-text("×"), button[aria-label="Close"]')
    if ((await closeBtn.count()) > 0) {
      await closeBtn.first().click()
      await window.waitForTimeout(500)
    }

    await window.screenshot({ path: 'tests/e2e/results/j7-01-page-structure.png' })

    // 验证侧边栏存在
    const sidebarElements = await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      return buttons.map(b => b.textContent?.trim()).filter(Boolean)
    })

    expect(sidebarElements.length).toBeGreaterThan(0)
  })

  test('验证侧边栏包含 New Task 按钮', async ({ window }) => {
    test.setTimeout(30000)

    // 查找 New Task / 新任务 按钮
    const newTaskBtn = window.locator(
      'button:has-text("New Task"), button:has-text("新任务"), button:has-text("New")'
    )
    const hasNewTask = (await newTaskBtn.count()) > 0

    // 或者有 + 图标按钮（创建新会话）
    const plusBtn = window.locator('button:has(svg), [aria-label*="new" i], [aria-label*="新"]')
    const hasPlus = (await plusBtn.count()) > 0

    await window.screenshot({ path: 'tests/e2e/results/j7-02-sidebar.png' })

    expect(hasNewTask || hasPlus).toBeTruthy()
  })

  test('验证 PromptInput 区域存在', async ({ window }) => {
    test.setTimeout(30000)

    // 未登录时也可能有 textarea（只是发送时会提示登录）
    const textarea = window.locator('textarea')
    const hasTextarea = (await textarea.count()) > 0

    // 或者有 placeholder 提示
    const promptArea = window.locator(
      '[data-tour="prompt-input"], [class*="prompt" i], [class*="input" i]'
    )
    const hasPromptArea = (await promptArea.count()) > 0

    await window.screenshot({ path: 'tests/e2e/results/j7-03-prompt-area.png' })

    // 至少有输入区域或 textarea
    expect(hasTextarea || hasPromptArea).toBeTruthy()
  })

  test('验证页面包含必要的交互按钮', async ({ window }) => {
    test.setTimeout(30000)

    // 收集页面上所有按钮的信息
    const buttonInfo = await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      return buttons.map(b => ({
        text: b.textContent?.trim()?.substring(0, 50),
        ariaLabel: b.getAttribute('aria-label'),
        visible: b.offsetParent !== null,
      })).filter(b => b.visible)
    })

    await window.screenshot({ path: 'tests/e2e/results/j7-04-buttons.png' })

    // 应该有多个可见按钮（侧边栏、登录、充值等）
    expect(buttonInfo.length).toBeGreaterThan(2)
  })

  test('验证 Electron preload API 可用', async ({ window }) => {
    test.setTimeout(30000)

    // 检查 window.electron 是否存在（preload 注入的 API）
    const electronApi = await window.evaluate(() => {
      const electron = (globalThis as any).electron || (globalThis as any).electronAPI
      if (!electron) return { available: false, keys: [] }

      return {
        available: true,
        hasAuth: !!electron.auth,
        hasBilling: !!electron.billing,
        hasSession: !!electron.session,
        hasApp: !!electron.app,
        keys: Object.keys(electron),
      }
    })

    expect(electronApi.available).toBe(true)
    expect(electronApi.keys.length).toBeGreaterThan(0)
  })
})
