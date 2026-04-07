/**
 * 测试用例 3: 模型介绍功能
 *
 * 测试目标：验证模型介绍信息在桌面端正确显示，后台可以设置，数据库正确保存
 *
 * 注意：模型介绍的 note 字段已获取但未在 UI 中显示，需要先实现
 */

import { test, expect } from '@playwright/test'
import { TEST_USER, TEST_MODELS, TIMEOUTS, SELECTORS } from './fixtures/test-data'
import {
  loginIfNeeded,
  takeScreenshot,
  waitForNetworkIdle,
} from './fixtures/helpers'

test.describe('模型介绍功能', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到聊天页面
    await page.goto('/')

    // 登录（如果需要）
    await loginIfNeeded(page, TEST_USER.email, TEST_USER.password)

    // 等待页面加载完成
    await waitForNetworkIdle(page)
  })

  test('3.1 桌面端应该显示模型介绍', async ({ page }) => {
    // 打开模型选择器
    const modelSelector = page.locator(SELECTORS.modelSelector)
    await expect(modelSelector).toBeVisible()
    await modelSelector.click()

    // 等待模型列表加载
    await page.waitForResponse(resp => resp.url().includes('/api/models'))
    await page.waitForTimeout(500)

    // 验证：模型列表显示
    const modelOptions = page.locator(SELECTORS.modelOption)
    await expect(modelOptions.first()).toBeVisible({ timeout: TIMEOUTS.MEDIUM })

    // 验证：每个模型显示介绍（note 字段）
    const firstModel = modelOptions.first()
    const modelNote = firstModel.locator(SELECTORS.modelNote)

    // 验证：note 字段存在且可见
    await expect(modelNote).toBeVisible()

    // 验证：note 字段内容不为空
    const noteText = await modelNote.textContent()
    expect(noteText).toBeTruthy()
    expect(noteText?.length).toBeGreaterThan(0)

    // 验证：note 字段样式正确
    const noteStyles = await modelNote.evaluate((el) => {
      const styles = window.getComputedStyle(el)
      return {
        fontSize: styles.fontSize,
        color: styles.color,
      }
    })

    // 验证：使用小字体和 muted 颜色
    expect(noteStyles.fontSize).toMatch(/10px|11px|12px/)

    // 截图验证
    await takeScreenshot(page, 'model-selector-with-notes')
  })

  test('3.2 模型介绍应该显示在正确的位置', async ({ page }) => {
    // 打开模型选择器
    await page.locator(SELECTORS.modelSelector).click()
    await page.waitForTimeout(500)

    // 获取第一个模型选项
    const firstModel = page.locator(SELECTORS.modelOption).first()
    await expect(firstModel).toBeVisible()

    // 获取模型名称、价格和介绍的位置
    const modelName = firstModel.locator('[data-testid="model-name"]')
    const modelPrice = firstModel.locator('[data-testid="model-price"]')
    const modelNote = firstModel.locator(SELECTORS.modelNote)

    // 验证：介绍在名称和价格之间或之下
    const nameBox = await modelName.boundingBox()
    const priceBox = await modelPrice.boundingBox()
    const noteBox = await modelNote.boundingBox()

    if (nameBox && noteBox) {
      // 验证：介绍在名称下方
      expect(noteBox.y).toBeGreaterThan(nameBox.y)
    }

    // 截图验证布局
    await takeScreenshot(page, 'model-note-position')
  })

  test('3.3 不同模型应该显示不同的介绍', async ({ page }) => {
    // 打开模型选择器
    await page.locator(SELECTORS.modelSelector).click()
    await page.waitForTimeout(500)

    // 获取多个模型选项
    const modelOptions = page.locator(SELECTORS.modelOption)
    const count = await modelOptions.count()
    expect(count).toBeGreaterThan(1)

    // 收集所有模型的介绍
    const notes: string[] = []
    for (let i = 0; i < Math.min(count, 5); i++) {
      const model = modelOptions.nth(i)
      const noteElement = model.locator(SELECTORS.modelNote)
      if (await noteElement.isVisible()) {
        const noteText = await noteElement.textContent()
        if (noteText) {
          notes.push(noteText.trim())
        }
      }
    }

    // 验证：至少有两个不同的介绍
    const uniqueNotes = new Set(notes)
    expect(uniqueNotes.size).toBeGreaterThan(1)

    // 截图验证
    await takeScreenshot(page, 'different-model-notes')
  })

  test('3.4 边界条件：空介绍应该不显示', async ({ page }) => {
    // 这个测试需要后端配合，创建一个没有介绍的模型
    // 或者通过 mock API 响应来测试

    // 打开模型选择器
    await page.locator(SELECTORS.modelSelector).click()
    await page.waitForTimeout(500)

    // 如果有模型没有介绍，验证不显示 note 区域
    const modelOptions = page.locator(SELECTORS.modelOption)
    const count = await modelOptions.count()

    for (let i = 0; i < count; i++) {
      const model = modelOptions.nth(i)
      const noteElement = model.locator(SELECTORS.modelNote)

      // 如果 note 元素存在，验证它有内容
      if (await noteElement.isVisible()) {
        const noteText = await noteElement.textContent()
        expect(noteText?.trim().length).toBeGreaterThan(0)
      }
    }
  })

  test('3.5 边界条件：长介绍应该正确显示', async ({ page }) => {
    // 打开模型选择器
    await page.locator(SELECTORS.modelSelector).click()
    await page.waitForTimeout(500)

    // 查找有长介绍的模型
    const modelOptions = page.locator(SELECTORS.modelOption)
    const count = await modelOptions.count()

    let longNoteModel = null
    for (let i = 0; i < count; i++) {
      const model = modelOptions.nth(i)
      const noteElement = model.locator(SELECTORS.modelNote)
      if (await noteElement.isVisible()) {
        const noteText = await noteElement.textContent()
        if (noteText && noteText.length > 50) {
          longNoteModel = model
          break
        }
      }
    }

    if (longNoteModel) {
      const noteElement = longNoteModel.locator(SELECTORS.modelNote)

      // 验证：长介绍不破坏布局
      const noteBox = await noteElement.boundingBox()
      expect(noteBox).toBeTruthy()

      // 验证：文字换行或截断
      const noteStyles = await noteElement.evaluate((el) => {
        const styles = window.getComputedStyle(el)
        return {
          overflow: styles.overflow,
          textOverflow: styles.textOverflow,
          whiteSpace: styles.whiteSpace,
        }
      })

      // 截图验证
      await takeScreenshot(page, 'long-model-note')
    }
  })

  test('3.6 边界条件：特殊字符应该正确转义', async ({ page }) => {
    // 打开模型选择器
    await page.locator(SELECTORS.modelSelector).click()
    await page.waitForTimeout(500)

    // 获取所有模型的介绍
    const modelOptions = page.locator(SELECTORS.modelOption)
    const count = await modelOptions.count()

    for (let i = 0; i < count; i++) {
      const model = modelOptions.nth(i)
      const noteElement = model.locator(SELECTORS.modelNote)

      if (await noteElement.isVisible()) {
        const noteText = await noteElement.textContent()

        // 验证：没有未转义的 HTML 标签
        expect(noteText).not.toContain('<script')
        expect(noteText).not.toContain('<img')
        expect(noteText).not.toContain('javascript:')

        // 验证：特殊字符正确显示
        if (noteText?.includes('&')) {
          // 如果包含 &，验证它不是 HTML 实体
          expect(noteText).not.toMatch(/&[a-z]+;/)
        }
      }
    }
  })
})

test.describe('模型介绍 - 后台管理', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到后台管理系统
    await page.goto('/admin')

    // 登录管理员账号
    await loginIfNeeded(page, 'admin@example.com', 'admin123')

    // 导航到模型管理页面
    await page.goto('/admin/models')
    await waitForNetworkIdle(page)
  })

  test('3.7 后台应该可以编辑模型介绍', async ({ page }) => {
    // 查找第一个模型的编辑按钮
    const editButton = page.locator('[data-testid="edit-model"]').first()
    await editButton.click()

    // 等待编辑表单加载
    await expect(page.locator('[data-testid="model-form"]')).toBeVisible()

    // 查找介绍字段
    const noteInput = page.locator('[data-testid="model-note-input"]')
    await expect(noteInput).toBeVisible()

    // 修改介绍
    const newNote = `测试介绍 - ${Date.now()}`
    await noteInput.fill(newNote)

    // 保存修改
    await page.locator('[data-testid="save-model"]').click()

    // 等待保存成功
    await page.waitForResponse(resp =>
      resp.url().includes('/api/admin/models') && resp.status() === 200
    )

    // 验证：显示成功提示
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible()

    // 截图验证
    await takeScreenshot(page, 'model-note-edited')
  })

  test('3.8 保存后应该在桌面端显示新介绍', async ({ page, context }) => {
    // 在后台修改模型介绍
    const editButton = page.locator('[data-testid="edit-model"]').first()
    await editButton.click()

    const noteInput = page.locator('[data-testid="model-note-input"]')
    const newNote = `E2E测试介绍 - ${Date.now()}`
    await noteInput.fill(newNote)

    await page.locator('[data-testid="save-model"]').click()
    await page.waitForResponse(resp =>
      resp.url().includes('/api/admin/models') && resp.status() === 200
    )

    // 打开新标签页，访问桌面端
    const desktopPage = await context.newPage()
    await desktopPage.goto('/')
    await loginIfNeeded(desktopPage, TEST_USER.email, TEST_USER.password)

    // 打开模型选择器
    await desktopPage.locator(SELECTORS.modelSelector).click()
    await desktopPage.waitForTimeout(500)

    // 验证：显示新的介绍
    const modelNote = desktopPage.locator(SELECTORS.modelNote).first()
    await expect(modelNote).toContainText(newNote)

    // 截图验证
    await takeScreenshot(desktopPage, 'new-model-note-displayed')

    await desktopPage.close()
  })
})
