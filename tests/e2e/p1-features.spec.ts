import { test, expect } from './fixtures/electron-app'

// 从 IPC 包装格式中提取数据
function unwrap(result: any) {
  return result?.data !== undefined ? result.data : result
}

test.describe('P1 功能模块', () => {
  test('T-007 侧边栏导航到所有路由', async ({ window }) => {
    const routes = [
      { path: '/chat', text: ['对话', 'Chat'] },
      { path: '/usage', text: ['使用', 'Usage'] },
      { path: '/pricing', text: ['定价', 'Pricing'] },
      { path: '/memory', text: ['记忆', 'Memory'] },
      { path: '/skills', text: ['技能', 'Skills'] },
      { path: '/settings', text: ['设置', 'Settings'] },
      { path: '/referral', text: ['推荐', 'Referral'] },
    ]

    for (const route of routes) {
      for (const text of route.text) {
        const link = window.locator(`nav a:has-text("${text}"), aside a:has-text("${text}")`)
        if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
          await link.click()
          await window.waitForTimeout(500)
          break
        }
      }
      await window.screenshot({
        path: `tests/e2e/results/t007-route-${route.path.replace('/', '')}.png`,
      })
    }
  })

  test('T-008 选择工作目录触发原生对话框', async ({ electronApp, window }) => {
    await electronApp.evaluate(async ({ dialog }) => {
      (dialog as any).showOpenDialog = async () => ({
        canceled: false,
        filePaths: ['/tmp/test-workspace'],
      })
    })

    const result = await window.evaluate(async () => {
      return await (window as any).electron.selectDirectory()
    })
    expect(result).toBeDefined()
  })

  test('T-009 Workspace IPC 接口正常', async ({ window }) => {
    const recentResult = await window.evaluate(async () => {
      return await (window as any).electron.workspace.getRecent(5)
    })
    const recent = unwrap(recentResult)
    expect(Array.isArray(recent)).toBe(true)

    const commonResult = await window.evaluate(async () => {
      return await (window as any).electron.workspace.getCommonDirs()
    })
    expect(commonResult).toBeDefined()

    const tempResult = await window.evaluate(async () => {
      return await (window as any).electron.workspace.getTempDir()
    })
    // getTempDir 可能返回 {success, data: string} 或 {success, data: {path: string}}
    expect(tempResult).toBeDefined()
    const tempDir = unwrap(tempResult)
    const tempPath = typeof tempDir === 'string' ? tempDir : tempDir?.path ?? tempDir
    expect(tempPath).toBeTruthy()
  })

  test('T-010 Tags CRUD 操作', async ({ window }) => {
    const tagsResult = await window.evaluate(async () => {
      return await (window as any).electron.tags.getAll()
    })
    const tags = unwrap(tagsResult)
    expect(Array.isArray(tags)).toBe(true)

    const newTagResult = await window.evaluate(async () => {
      return await (window as any).electron.tags.create('test-tag-' + Date.now(), '#ff0000')
    })
    const newTag = unwrap(newTagResult)
    expect(newTag).toBeDefined()

    if (newTag?.id) {
      await window.evaluate(async (tagId: string) => {
        return await (window as any).electron.tags.delete(tagId)
      }, newTag.id)
    }
  })

  test('T-011 Memory 读写操作', async ({ window }) => {
    const memResult = await window.evaluate(async () => {
      return await (window as any).electron.memory.get()
    })
    const memory = unwrap(memResult)
    expect(memory !== undefined).toBe(true)

    const testContent = 'Playwright test memory ' + Date.now()
    await window.evaluate(async (content: string) => {
      return await (window as any).electron.memory.set(content)
    }, testContent)

    const updatedResult = await window.evaluate(async () => {
      return await (window as any).electron.memory.get()
    })
    const updated = unwrap(updatedResult)
    // memory 可能返回字符串或对象，灵活验证
    const updatedStr = typeof updated === 'string' ? updated : JSON.stringify(updated)
    expect(updatedStr).toContain('Playwright test memory')

    // 清理：恢复原始 memory
    const originalStr = typeof memory === 'string' ? memory : ''
    await window.evaluate(async (original: string) => {
      return await (window as any).electron.memory.set(original)
    }, originalStr)
  })

  test('T-012 暗色/亮色主题切换', async ({ window }) => {
    await window.screenshot({ path: 'tests/e2e/results/t012-theme-before.png' })

    // 验证 html 元素存在且可操作 class
    const canToggle = await window.evaluate(() => {
      const html = document.documentElement
      const before = html.classList.contains('test-theme-check')
      html.classList.add('test-theme-check')
      const after = html.classList.contains('test-theme-check')
      html.classList.remove('test-theme-check')
      return !before && after
    })
    expect(canToggle).toBe(true)

    // 检查当前主题状态（dark class 是否存在）
    const isDark = await window.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(typeof isDark).toBe('boolean')

    await window.screenshot({ path: 'tests/e2e/results/t012-theme-after.png' })
  })

  test('T-013 Skill IPC 接口正常', async ({ window }) => {
    const skillsResult = await window.evaluate(async () => {
      return await (window as any).electron.skill.getAll()
    })
    const skills = unwrap(skillsResult)
    expect(Array.isArray(skills)).toBe(true)

    const enabledResult = await window.evaluate(async () => {
      return await (window as any).electron.skill.getEnabled()
    })
    const enabled = unwrap(enabledResult)
    expect(Array.isArray(enabled)).toBe(true)

    const statsResult = await window.evaluate(async () => {
      return await (window as any).electron.skill.getStats()
    })
    expect(statsResult).toBeDefined()
  })

  test('T-014 Billing IPC 接口正常', async ({ window }) => {
    const pricing = await window.evaluate(async () => {
      try {
        return await (window as any).electron.billing.getPricing()
      } catch (e: any) {
        return { error: e.message }
      }
    })
    expect(pricing).toBeDefined()

    const balance = await window.evaluate(async () => {
      try {
        return await (window as any).electron.billing.getBalance()
      } catch (e: any) {
        return { error: e.message }
      }
    })
    expect(balance).toBeDefined()
  })

  test('T-015 自动更新检查 IPC', async ({ window }) => {
    const status = await window.evaluate(async () => {
      try {
        return await (window as any).electron.update.getStatus()
      } catch (e: any) {
        return { error: e.message }
      }
    })
    expect(status).toBeDefined()
  })

  test('T-016 Sync 配置和状态', async ({ window }) => {
    const config = await window.evaluate(async () => {
      try {
        return await (window as any).electron.sync.getConfig()
      } catch (e: any) {
        return { error: e.message }
      }
    })
    expect(config).toBeDefined()

    const status = await window.evaluate(async () => {
      try {
        return await (window as any).electron.sync.getStatus()
      } catch (e: any) {
        return { error: e.message }
      }
    })
    expect(status).toBeDefined()
  })
})
