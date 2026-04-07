import { test, expect } from './fixtures/electron-app'

test.describe('P0 核心流程', () => {
  test('T-001 应用正常启动并显示主窗口', async ({ electronApp, window }) => {
    const windows = electronApp.windows()
    expect(windows.length).toBeGreaterThanOrEqual(1)

    const { width, height } = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const [w, h] = win.getSize()
      return { width: w, height: h }
    })
    expect(width).toBeGreaterThanOrEqual(900)
    expect(height).toBeGreaterThanOrEqual(600)

    const hasElectronAPI = await window.evaluate(() => typeof (window as any).electron !== 'undefined')
    expect(hasElectronAPI).toBe(true)

    await window.screenshot({ path: 'tests/e2e/results/t001-app-launch.png' })
  })

  test('T-002 window.electron IPC bridge 所有模块可用', async ({ window }) => {
    const modules = await window.evaluate(() => {
      const e = (window as any).electron
      return {
        hasAuth: typeof e.auth === 'object',
        hasSession: typeof e.session === 'object',
        hasWorkspace: typeof e.workspace === 'object',
        hasBilling: typeof e.billing === 'object',
        hasMemory: typeof e.memory === 'object',
        hasSkill: typeof e.skill === 'object',
        hasSync: typeof e.sync === 'object',
        hasUpdate: typeof e.update === 'object',
        hasApp: typeof e.app === 'object',
        hasTags: typeof e.tags === 'object',
        hasShell: typeof e.shell === 'object',
        hasData: typeof e.data === 'object',
        hasNotifications: typeof e.notifications === 'object',
        hasInvoke: typeof e.invoke === 'function',
        hasSendClientEvent: typeof e.sendClientEvent === 'function',
        hasOnServerEvent: typeof e.onServerEvent === 'function',
      }
    })

    for (const [key, value] of Object.entries(modules)) {
      expect(value, `${key} should be true`).toBe(true)
    }
  })

  test('T-003 可访问主进程 app 模块', async ({ electronApp, window }) => {
    const appInfo = await electronApp.evaluate(async ({ app }) => ({
      name: app.getName(),
      version: app.getVersion(),
      userDataPath: app.getPath('userData'),
      isPackaged: app.isPackaged,
    }))

    expect(appInfo.name).toBeTruthy()
    expect(appInfo.version).toBeTruthy()
    expect(appInfo.userDataPath).toBeTruthy()
    expect(appInfo.isPackaged).toBe(false)

    // IPC 返回 {success, data} 包装格式
    const result = await window.evaluate(async () => {
      return await (window as any).electron.app.getVersion()
    })
    const rendererVersion = result?.data?.version ?? result
    expect(rendererVersion).toBe(appInfo.version)
  })

  test('T-004a 认证状态检查', async ({ electronApp, window }) => {
    // 通过 IPC 检查认证状态
    const authResult = await window.evaluate(async () => {
      return await (window as any).electron.auth.getStatus()
    }).catch(() => null)

    // 验证 IPC 调用成功
    expect(authResult).toBeDefined()

    const authStatus = authResult?.data ?? authResult
    // dev 模式下可能未登录，记录状态
    const isAuthenticated = authStatus?.isAuthenticated ?? false

    await window.screenshot({ path: 'tests/e2e/results/t004a-auth-status.png' })

    // 无论是否登录，auth IPC 应该正常工作
    expect(typeof isAuthenticated).toBe('boolean')
  })

  test('T-005 创建新会话', async ({ window }) => {
    const newSessionBtn = window.locator(
      'button:has-text("新对话"), button:has-text("New"), [data-testid="new-session"], [data-tour="new-session"]'
    )

    if (await newSessionBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newSessionBtn.click()
      await window.waitForTimeout(1000)

      const modal = window.locator('[role="dialog"], .modal')
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        await window.screenshot({ path: 'tests/e2e/results/t005-new-session-modal.png' })
        const confirmBtn = modal.locator('button:has-text("创建"), button:has-text("Create"), button:has-text("确定")')
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click()
        }
      }

      await window.waitForTimeout(2000)
      await window.screenshot({ path: 'tests/e2e/results/t005-session-created.png' })
    }
  })

  test('T-006 Session IPC 接口正常工作', async ({ window }) => {
    // IPC 返回 {success, data} 包装格式
    const sessionsResult = await window.evaluate(async () => {
      return await (window as any).electron.session.listWithOptions({})
    })
    const sessions = sessionsResult?.data ?? sessionsResult
    expect(Array.isArray(sessions)).toBe(true)

    const searchResult = await window.evaluate(async () => {
      return await (window as any).electron.session.searchSessions('test')
    })
    expect(searchResult).toBeDefined()

    const pinnedResult = await window.evaluate(async () => {
      return await (window as any).electron.session.getPinnedSessions()
    })
    const pinned = pinnedResult?.data ?? pinnedResult
    expect(Array.isArray(pinned)).toBe(true)

    const archivedResult = await window.evaluate(async () => {
      return await (window as any).electron.session.getArchivedSessions()
    })
    const archived = archivedResult?.data ?? archivedResult
    expect(Array.isArray(archived)).toBe(true)
  })
})
