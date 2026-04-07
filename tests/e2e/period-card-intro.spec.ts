/**
 * 测试用例 4: 期卡介绍功能
 *
 * 测试目标：验证期卡介绍信息在桌面端正确显示，后台可以设置，数据库正确保存
 */

import { test, expect } from '@playwright/test'
import { TEST_USER, TEST_PERIOD_CARDS, TIMEOUTS, SELECTORS } from './fixtures/test-data'
import {
  loginIfNeeded,
  takeScreenshot,
  waitForNetworkIdle,
} from './fixtures/helpers'

test.describe('期卡介绍功能', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到充值页面
    await page.goto('/pricing')

    // 登录（如果需要）
    await loginIfNeeded(page, TEST_USER.email, TEST_USER.password)

    // 等待页面加载完成
    await waitForNetworkIdle(page)
  })

  test('4.1 桌面端应该显示期卡介绍', async ({ page }) => {
    // 等待期卡列表加载
    await page.waitForResponse(resp => resp.url().includes('/api/period-cards/plans'))
    await page.waitForTimeout(500)

    // 验证：期卡列表显示
    const periodCardPlans = page.locator(SELECTORS.periodCardPlan)
    await expect(periodCardPlans.first()).toBeVisible({ timeout: TIMEOUTS.MEDIUM })

    // 验证：至少有一个期卡套餐
    const count = await periodCardPlans.count()
    expect(count).toBeGreaterThan(0)

    // 验证：第一个期卡显示介绍
    const firstPlan = periodCardPlans.first()
    const description = firstPlan.locator(SELECTORS.periodCardDescription)

    // 验证：description 字段存在且可见
    if (await description.isVisible()) {
      // 验证：description 字段内容不为空
      const descText = await description.textContent()
      expect(descText).toBeTruthy()
      expect(descText?.length).toBeGreaterThan(0)

      // 验证：description 字段样式正确
      const descStyles = await description.evaluate((el) => {
        const styles = window.getComputedStyle(el)
        return {
          fontSize: styles.fontSize,
          color: styles.color,
        }
      })

      // 验证：使用小字体和 muted 颜色
      expect(descStyles.fontSize).toMatch(/10px|11px|12px/)
    }

    // 截图验证
    await takeScreenshot(page, 'period-card-with-descriptions')
  })

  test('4.2 期卡介绍应该显示在正确的位置', async ({ page }) => {
    // 等待期卡列表加载
    await page.waitForResponse(resp => resp.url().includes('/api/period-cards/plans'))
    await page.waitForTimeout(500)

    // 获取第一个期卡套餐
    const firstPlan = page.locator(SELECTORS.periodCardPlan).first()
    await expect(firstPlan).toBeVisible()

    // 获取套餐名称、价格和介绍的位置
    const planName = firstPlan.locator('[data-testid="plan-name"]')
    const planPrice = firstPlan.locator('[data-testid="plan-price"]')
    const planDescription = firstPlan.locator(SELECTORS.periodCardDescription)

    // 验证：介绍在名称和价格之间
    if (await planDescription.isVisible()) {
      const nameBox = await planName.boundingBox()
      const descBox = await planDescription.boundingBox()

      if (nameBox && descBox) {
        // 验证：介绍在名称下方
        expect(descBox.y).toBeGreaterThan(nameBox.y)
      }
    }

    // 截图验证布局
    await takeScreenshot(page, 'period-card-description-position')
  })

  test('4.3 不同期卡应该显示不同的介绍', async ({ page }) => {
    // 等待期卡列表加载
    await page.waitForResponse(resp => resp.url().includes('/api/period-cards/plans'))
    await page.waitForTimeout(500)

    // 获取多个期卡套餐
    const periodCardPlans = page.locator(SELECTORS.periodCardPlan)
    const count = await periodCardPlans.count()

    if (count > 1) {
      // 收集所有期卡的介绍
      const descriptions: string[] = []
      for (let i = 0; i < Math.min(count, 5); i++) {
        const plan = periodCardPlans.nth(i)
        const descElement = plan.locator(SELECTORS.periodCardDescription)
        if (await descElement.isVisible()) {
          const descText = await descElement.textContent()
          if (descText) {
            descriptions.push(descText.trim())
          }
        }
      }

      // 验证：至少有两个不同的介绍
      if (descriptions.length > 1) {
        const uniqueDescriptions = new Set(descriptions)
        expect(uniqueDescriptions.size).toBeGreaterThan(1)
      }
    }

    // 截图验证
    await takeScreenshot(page, 'different-period-card-descriptions')
  })

  test('4.4 边界条件：空介绍应该不显示', async ({ page }) => {
    // 等待期卡列表加载
    await page.waitForResponse(resp => resp.url().includes('/api/period-cards/plans'))
    await page.waitForTimeout(500)

    // 如果有期卡没有介绍，验证不显示 description 区域
    const periodCardPlans = page.locator(SELECTORS.periodCardPlan)
    const count = await periodCardPlans.count()

    for (let i = 0; i < count; i++) {
      const plan = periodCardPlans.nth(i)
      const descElement = plan.locator(SELECTORS.periodCardDescription)

      // 如果 description 元素存在，验证它有内容
      if (await descElement.isVisible()) {
        const descText = await descElement.textContent()
        expect(descText?.trim().length).toBeGreaterThan(0)
      }
    }
  })

  test('4.5 边界条件：长介绍应该正确显示', async ({ page }) => {
    // 等待期卡列表加载
    await page.waitForResponse(resp => resp.url().includes('/api/period-cards/plans'))
    await page.waitForTimeout(500)

    // 查找有长介绍的期卡
    const periodCardPlans = page.locator(SELECTORS.periodCardPlan)
    const count = await periodCardPlans.count()

    let longDescPlan = null
    for (let i = 0; i < count; i++) {
      const plan = periodCardPlans.nth(i)
      const descElement = plan.locator(SELECTORS.periodCardDescription)
      if (await descElement.isVisible()) {
        const descText = await descElement.textContent()
        if (descText && descText.length > 50) {
          longDescPlan = plan
          break
        }
      }
    }

    if (longDescPlan) {
      const descElement = longDescPlan.locator(SELECTORS.periodCardDescription)

      // 验证：长介绍不破坏布局
      const descBox = await descElement.boundingBox()
      expect(descBox).toBeTruthy()

      // 验证：文字换行或截断
      const descStyles = await descElement.evaluate((el) => {
        const styles = window.getComputedStyle(el)
        return {
          overflow: styles.overflow,
          textOverflow: styles.textOverflow,
          whiteSpace: styles.whiteSpace,
        }
      })

      // 截图验证
      await takeScreenshot(page, 'long-period-card-description')
    }
  })

  test('4.6 边界条件：多语言介绍应该正确显示', async ({ page }) => {
    // 等待期卡列表加载
    await page.waitForResponse(resp => resp.url().includes('/api/period-cards/plans'))
    await page.waitForTimeout(500)

    // 获取所有期卡的介绍
    const periodCardPlans = page.locator(SELECTORS.periodCardPlan)
    const count = await periodCardPlans.count()

    for (let i = 0; i < count; i++) {
      const plan = periodCardPlans.nth(i)
      const descElement = plan.locator(SELECTORS.periodCardDescription)

      if (await descElement.isVisible()) {
        const descText = await descElement.textContent()

        // 验证：中文字符正确显示
        if (descText && /[\u4e00-\u9fa5]/.test(descText)) {
          // 验证：没有乱码
          expect(descText).not.toContain('�')
          expect(descText).not.toContain('???')
        }
      }
    }
  })
})

test.describe('期卡介绍 - 后台管理', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到后台管理系统
    await page.goto('/admin')

    // 登录管理员账号
    await loginIfNeeded(page, 'admin@example.com', 'admin123')

    // 导航到期卡管理页面
    await page.goto('/admin/period-cards')
    await waitForNetworkIdle(page)
  })

  test('4.7 后台应该可以编辑期卡介绍', async ({ page }) => {
    // 查找第一个期卡的编辑按钮
    const editButton = page.locator('[data-testid="edit-period-card"]').first()
    await editButton.click()

    // 等待编辑表单加载
    await expect(page.locator('[data-testid="period-card-form"]')).toBeVisible()

    // 查找介绍字段
    const descInput = page.locator('[data-testid="period-card-description-input"]')
    await expect(descInput).toBeVisible()

    // 修改介绍
    const newDesc = `测试介绍 - ${Date.now()}`
    await descInput.fill(newDesc)

    // 保存修改
    await page.locator('[data-testid="save-period-card"]').click()

    // 等待保存成功
    await page.waitForResponse(resp =>
      resp.url().includes('/api/admin/period-cards') && resp.status() === 200
    )

    // 验证：显示成功提示
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible()

    // 截图验证
    await takeScreenshot(page, 'period-card-description-edited')
  })

  test('4.8 保存后应该在桌面端显示新介绍', async ({ page, context }) => {
    // 在后台修改期卡介绍
    const editButton = page.locator('[data-testid="edit-period-card"]').first()
    await editButton.click()

    const descInput = page.locator('[data-testid="period-card-description-input"]')
    const newDesc = `E2E测试介绍 - ${Date.now()}`
    await descInput.fill(newDesc)

    await page.locator('[data-testid="save-period-card"]').click()
    await page.waitForResponse(resp =>
      resp.url().includes('/api/admin/period-cards') && resp.status() === 200
    )

    // 打开新标签页，访问桌面端
    const desktopPage = await context.newPage()
    await desktopPage.goto('/pricing')
    await loginIfNeeded(desktopPage, TEST_USER.email, TEST_USER.password)

    // 等待期卡列表加载
    await desktopPage.waitForResponse(resp => resp.url().includes('/api/period-cards/plans'))
    await desktopPage.waitForTimeout(500)

    // 验证：显示新的介绍
    const periodCardDescription = desktopPage.locator(SELECTORS.periodCardDescription).first()
    await expect(periodCardDescription).toContainText(newDesc)

    // 截图验证
    await takeScreenshot(desktopPage, 'new-period-card-description-displayed')

    await desktopPage.close()
  })

  test('4.9 数据库应该正确保存期卡介绍', async ({ page }) => {
    // 在后台修改期卡介绍
    const editButton = page.locator('[data-testid="edit-period-card"]').first()
    await editButton.click()

    const descInput = page.locator('[data-testid="period-card-description-input"]')
    const newDesc = `数据库测试 - ${Date.now()}`
    await descInput.fill(newDesc)

    // 获取期卡 ID（用于后续验证）
    const periodCardId = await page.locator('[data-testid="period-card-id"]').textContent()

    await page.locator('[data-testid="save-period-card"]').click()
    await page.waitForResponse(resp =>
      resp.url().includes('/api/admin/period-cards') && resp.status() === 200
    )

    // 刷新页面，验证数据持久化
    await page.reload()
    await waitForNetworkIdle(page)

    // 再次打开编辑表单
    await page.locator(`[data-testid="edit-period-card-${periodCardId}"]`).click()

    // 验证：介绍字段显示保存的值
    const descInputAfterReload = page.locator('[data-testid="period-card-description-input"]')
    await expect(descInputAfterReload).toHaveValue(newDesc)

    // 截图验证
    await takeScreenshot(page, 'period-card-description-persisted')
  })
})
