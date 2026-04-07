/**
 * 测试用例 2: 文件 hover 按钮功能
 *
 * 测试目标：验证文件浏览器中 hover 到文件时显示的操作按钮功能
 *
 * 注意：此功能尚未实现，测试用例作为规范先行编写
 */

import { test, expect } from '@playwright/test'
import { TEST_USER, TEST_WORKSPACE, TIMEOUTS, SELECTORS } from './fixtures/test-data'
import {
  loginIfNeeded,
  setWorkingDirectory,
  takeScreenshot,
  scrollToElement,
  isInViewport,
} from './fixtures/helpers'

test.describe('文件 hover 按钮功能', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到聊天页面
    await page.goto('/')

    // 登录（如果需要）
    await loginIfNeeded(page, TEST_USER.email, TEST_USER.password)

    // 设置工作目录
    await setWorkingDirectory(page, TEST_WORKSPACE.path)

    // 打开文件浏览器（如果默认关闭）
    const fileExplorer = page.locator('[data-testid="file-explorer"]')
    const isVisible = await fileExplorer.isVisible()
    if (!isVisible) {
      await page.locator('[data-testid="toggle-file-explorer"]').click()
    }
  })

  test('2.1 Hover 到文件时应该显示操作按钮', async ({ page }) => {
    // 获取第一个文件项
    const fileItem = page.locator(SELECTORS.fileItem).first()
    await expect(fileItem).toBeVisible()

    // 验证初始状态：按钮不可见
    const openButton = fileItem.locator(SELECTORS.fileOpenButton)
    const copyButton = fileItem.locator(SELECTORS.fileCopyButton)
    await expect(openButton).not.toBeVisible()
    await expect(copyButton).not.toBeVisible()

    // Hover 到文件上
    await fileItem.hover()

    // 验证：按钮显示
    await expect(openButton).toBeVisible({ timeout: TIMEOUTS.SHORT })
    await expect(copyButton).toBeVisible({ timeout: TIMEOUTS.SHORT })

    // 验证：按钮有正确的文本或图标
    await expect(openButton).toHaveAttribute('title', /打开/)
    await expect(copyButton).toHaveAttribute('title', /复制/)

    // 截图验证
    await takeScreenshot(page, 'file-hover-buttons-visible')

    // 移开鼠标
    await page.mouse.move(0, 0)

    // 验证：按钮隐藏
    await expect(openButton).not.toBeVisible()
    await expect(copyButton).not.toBeVisible()
  })

  test('2.2 点击"打开"按钮应该打开文件', async ({ page, context }) => {
    // 监听 IPC 调用
    let openFileCalled = false
    let openedFilePath = ''

    // 注入监听器（如果可能）
    await page.evaluate(() => {
      // @ts-ignore
      const originalOpenFile = window.electron?.workspace?.openFile
      if (originalOpenFile) {
        // @ts-ignore
        window.electron.workspace.openFile = async (path: string) => {
          // @ts-ignore
          window.__testOpenFileCalled = true
          // @ts-ignore
          window.__testOpenedFilePath = path
          return originalOpenFile(path)
        }
      }
    })

    // 获取第一个文件项
    const fileItem = page.locator(SELECTORS.fileItem).first()
    const fileName = await fileItem.textContent()

    // Hover 并点击"打开"按钮
    await fileItem.hover()
    const openButton = fileItem.locator(SELECTORS.fileOpenButton)
    await openButton.click()

    // 等待一小段时间让 IPC 调用完成
    await page.waitForTimeout(1000)

    // 验证：IPC 调用被触发
    const testData = await page.evaluate(() => ({
      // @ts-ignore
      called: window.__testOpenFileCalled,
      // @ts-ignore
      path: window.__testOpenedFilePath,
    }))

    expect(testData.called).toBe(true)
    expect(testData.path).toContain(fileName?.trim() || '')

    // 截图验证
    await takeScreenshot(page, 'file-opened')
  })

  test('2.3 点击"复制文件名"按钮应该复制到剪贴板', async ({ page, context }) => {
    // 授予剪贴板权限
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    // 获取第一个文件项
    const fileItem = page.locator(SELECTORS.fileItem).first()
    const fileName = await fileItem.textContent()

    // Hover 并点击"复制文件名"按钮
    await fileItem.hover()
    const copyButton = fileItem.locator(SELECTORS.fileCopyButton)
    await copyButton.click()

    // 等待复制完成
    await page.waitForTimeout(500)

    // 验证：剪贴板内容正确
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toContain(fileName?.trim() || '')

    // 验证：显示成功提示（如果有）
    const toast = page.locator('[data-testid="toast"]')
    if (await toast.isVisible()) {
      await expect(toast).toContainText(/复制成功|已复制/)
    }

    // 截图验证
    await takeScreenshot(page, 'file-name-copied')
  })

  test('2.4 边界条件：快速 hover 多个文件', async ({ page }) => {
    // 获取多个文件项
    const fileItems = page.locator(SELECTORS.fileItem)
    const count = await fileItems.count()
    expect(count).toBeGreaterThan(2)

    // 快速 hover 多个文件
    for (let i = 0; i < Math.min(count, 5); i++) {
      await fileItems.nth(i).hover()
      await page.waitForTimeout(100) // 短暂延迟
    }

    // 验证：最后一个文件的按钮显示
    const lastFileItem = fileItems.nth(Math.min(count, 5) - 1)
    await lastFileItem.hover()
    const openButton = lastFileItem.locator(SELECTORS.fileOpenButton)
    await expect(openButton).toBeVisible()

    // 验证：没有闪烁或错误
    await takeScreenshot(page, 'fast-hover-multiple-files')
  })

  test('2.5 边界条件：目录 vs 文件的按钮显示', async ({ page }) => {
    // 获取目录项
    const directoryItem = page.locator('[data-testid="directory-item"]').first()
    if (await directoryItem.isVisible()) {
      // Hover 到目录
      await directoryItem.hover()

      // 验证：目录可能显示不同的按钮（或相同的按钮）
      // 这取决于产品需求
      const openButton = directoryItem.locator(SELECTORS.fileOpenButton)
      const copyButton = directoryItem.locator(SELECTORS.fileCopyButton)

      // 截图记录目录的按钮显示
      await takeScreenshot(page, 'directory-hover-buttons')
    }

    // 获取文件项
    const fileItem = page.locator(SELECTORS.fileItem).first()
    await fileItem.hover()

    // 验证：文件显示按钮
    const fileOpenButton = fileItem.locator(SELECTORS.fileOpenButton)
    const fileCopyButton = fileItem.locator(SELECTORS.fileCopyButton)
    await expect(fileOpenButton).toBeVisible()
    await expect(fileCopyButton).toBeVisible()

    // 截图记录文件的按钮显示
    await takeScreenshot(page, 'file-hover-buttons')
  })

  test('2.6 边界条件：长文件名的按钮位置', async ({ page }) => {
    // 查找长文件名的文件（如果有）
    const fileItems = page.locator(SELECTORS.fileItem)
    const count = await fileItems.count()

    let longNameFile = null
    for (let i = 0; i < count; i++) {
      const item = fileItems.nth(i)
      const text = await item.textContent()
      if (text && text.length > 30) {
        longNameFile = item
        break
      }
    }

    if (longNameFile) {
      // Hover 到长文件名的文件
      await longNameFile.hover()

      // 验证：按钮显示且位置正确
      const openButton = longNameFile.locator(SELECTORS.fileOpenButton)
      const copyButton = longNameFile.locator(SELECTORS.fileCopyButton)
      await expect(openButton).toBeVisible()
      await expect(copyButton).toBeVisible()

      // 验证：按钮不遮挡文件名
      const fileNameElement = longNameFile.locator('[data-testid="file-name"]')
      if (await fileNameElement.isVisible()) {
        const fileNameBox = await fileNameElement.boundingBox()
        const openButtonBox = await openButton.boundingBox()

        if (fileNameBox && openButtonBox) {
          // 验证：按钮在文件名右侧或下方，不重叠
          expect(
            openButtonBox.x >= fileNameBox.x + fileNameBox.width ||
            openButtonBox.y >= fileNameBox.y + fileNameBox.height
          ).toBe(true)
        }
      }

      // 截图验证
      await takeScreenshot(page, 'long-filename-buttons')
    }
  })

  test('2.7 交互细节：按钮 hover 效果', async ({ page }) => {
    // 获取第一个文件项
    const fileItem = page.locator(SELECTORS.fileItem).first()
    await fileItem.hover()

    // 获取"打开"按钮
    const openButton = fileItem.locator(SELECTORS.fileOpenButton)
    await expect(openButton).toBeVisible()

    // 截图：按钮正常状态
    await takeScreenshot(page, 'button-normal-state')

    // Hover 到按钮
    await openButton.hover()

    // 等待 hover 效果
    await page.waitForTimeout(300)

    // 截图：按钮 hover 状态
    await takeScreenshot(page, 'button-hover-state')

    // 验证：按钮有 hover 效果（颜色变化、阴影等）
    // 这需要通过视觉回归测试或 CSS 属性检查
    const buttonStyles = await openButton.evaluate((el) => {
      const styles = window.getComputedStyle(el)
      return {
        backgroundColor: styles.backgroundColor,
        cursor: styles.cursor,
      }
    })

    expect(buttonStyles.cursor).toBe('pointer')
  })
})
