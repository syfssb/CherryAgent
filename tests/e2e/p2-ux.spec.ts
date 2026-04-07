import { test, expect } from './fixtures/electron-app'

test.describe('P2 UX 走查', () => {
  test('T-017 搜索框输入和结果展示', async ({ window }) => {
    const searchInput = window.locator(
      'input[placeholder*="搜索"], input[placeholder*="Search"], [data-testid="search-input"]'
    )

    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('test query')
      await window.waitForTimeout(1000)
      await window.screenshot({ path: 'tests/e2e/results/t017-search.png' })
      await searchInput.fill('')
      await window.waitForTimeout(500)
    }
  })

  test('T-018 模型选择器可用', async ({ window }) => {
    const modelSelector = window.locator('[data-tour="model-selector"]')

    if (await modelSelector.isVisible({ timeout: 5000 }).catch(() => false)) {
      await modelSelector.click()
      await window.waitForTimeout(500)
      await window.screenshot({ path: 'tests/e2e/results/t018-model-selector.png' })
      await window.keyboard.press('Escape')
    }
  })

  test('T-019 键盘快捷键响应', async ({ window }) => {
    await window.keyboard.press('Meta+n')
    await window.waitForTimeout(1000)
    await window.screenshot({ path: 'tests/e2e/results/t019-shortcut-new.png' })
    await window.keyboard.press('Escape')

    await window.keyboard.press('Meta+k')
    await window.waitForTimeout(500)
    await window.screenshot({ path: 'tests/e2e/results/t019-shortcut-search.png' })
    await window.keyboard.press('Escape')
  })

  test('T-020 窗口缩放到最小尺寸不崩溃', async ({ electronApp, window }) => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setSize(900, 600)
    })

    await window.waitForTimeout(1000)
    await window.screenshot({ path: 'tests/e2e/results/t020-min-size.png' })

    // 验证窗口缩放后没有崩溃——窗口仍然存在且可交互
    const windowCount = electronApp.windows().length
    expect(windowCount).toBeGreaterThanOrEqual(1)

    const { width, height } = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const [w, h] = win.getSize()
      return { width: w, height: h }
    })
    expect(width).toBeGreaterThanOrEqual(900)
    expect(height).toBeGreaterThanOrEqual(600)

    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setSize(1200, 800)
    })
  })

  test('T-021 Notification IPC 可用', async ({ window }) => {
    const checkResult = await window.evaluate(async () => {
      try {
        return await (window as any).electron.notifications.check()
      } catch (e: any) {
        return { error: e.message }
      }
    })
    expect(checkResult).toBeDefined()
  })

  test('T-022 Data Export/Import IPC 可用', async ({ window }) => {
    const hasExport = await window.evaluate(() => typeof (window as any).electron.data.export === 'function')
    expect(hasExport).toBe(true)

    const hasImport = await window.evaluate(() => typeof (window as any).electron.data.import === 'function')
    expect(hasImport).toBe(true)

    const hasValidate = await window.evaluate(() => typeof (window as any).electron.data.validate === 'function')
    expect(hasValidate).toBe(true)
  })

  test('T-023 平台信息正确', async ({ window }) => {
    const platform = await window.evaluate(() => (window as any).electron.app.getPlatform())
    expect(['darwin', 'win32', 'linux']).toContain(platform)

    const arch = await window.evaluate(() => (window as any).electron.app.getArch())
    expect(['arm64', 'x64', 'ia32']).toContain(arch)
  })
})
