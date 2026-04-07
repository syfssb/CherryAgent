/**
 * 测试用例 1: 对话框禁用输入功能
 *
 * 测试目标：验证任务执行期间输入框的禁用/恢复机制
 */

import { test, expect } from '@playwright/test'
import { TEST_USER, TIMEOUTS, SELECTORS } from './fixtures/test-data'
import {
  loginIfNeeded,
  setWorkingDirectory,
  sendMessage,
  stopTask,
  waitForTaskStart,
  waitForTaskComplete,
  takeScreenshot,
} from './fixtures/helpers'

test.describe('对话框禁用输入功能', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到聊天页面
    await page.goto('/')

    // 登录（如果需要）
    await loginIfNeeded(page, TEST_USER.email, TEST_USER.password)

    // 设置工作目录
    await setWorkingDirectory(page, '/tmp/test-workspace')
  })

  test('1.1 任务开始时输入框应该被禁用', async ({ page }) => {
    // 获取输入框和按钮
    const input = page.locator(SELECTORS.promptInput)
    const sendButton = page.locator(SELECTORS.sendButton)

    // 验证初始状态：输入框可用
    await expect(input).toBeEnabled()
    await expect(sendButton).toBeVisible()

    // 发送消息启动任务
    await sendMessage(page, '列出当前目录的文件')

    // 验证：输入框被禁用
    await expect(input).toBeDisabled()

    // 验证：发送按钮变为停止按钮
    const stopButton = page.locator(SELECTORS.stopButton)
    await expect(stopButton).toBeVisible()

    // 验证：输入框显示禁用占位符
    await expect(input).toHaveAttribute('placeholder', /创建\/选择任务后开始/)

    // 截图验证
    await takeScreenshot(page, 'input-disabled-during-task')

    // 停止任务
    await stopTask(page)
  })

  test('1.2 任务结束时输入框应该恢复可用', async ({ page }) => {
    const input = page.locator(SELECTORS.promptInput)
    const sendButton = page.locator(SELECTORS.sendButton)

    // 发送消息启动任务
    await sendMessage(page, '输出 "Hello World"')

    // 等待任务完成
    await waitForTaskComplete(page)

    // 验证：输入框恢复可用
    await expect(input).toBeEnabled()

    // 验证：发送按钮恢复显示
    await expect(sendButton).toBeVisible()

    // 验证：可以输入文字
    await input.fill('测试输入')
    await expect(input).toHaveValue('测试输入')

    // 截图验证
    await takeScreenshot(page, 'input-enabled-after-task')
  })

  test('1.3 边界条件：任务中断后输入框应该恢复', async ({ page }) => {
    const input = page.locator(SELECTORS.promptInput)

    // 发送消息启动任务
    await sendMessage(page, '列出当前目录的所有文件，包括子目录')

    // 验证任务开始
    await expect(input).toBeDisabled()

    // 中断任务
    await stopTask(page)

    // 验证：输入框恢复可用
    await expect(input).toBeEnabled()

    // 验证：可以发送新消息
    await input.fill('新消息')
    await expect(input).toHaveValue('新消息')
  })

  test('1.4 边界条件：任务失败后输入框应该恢复', async ({ page }) => {
    const input = page.locator(SELECTORS.promptInput)

    // 发送会失败的任务
    await sendMessage(page, '读取 /nonexistent/file.txt')

    // 等待任务完成（失败）
    await waitForTaskComplete(page)

    // 验证：输入框恢复可用
    await expect(input).toBeEnabled()

    // 验证：可以发送新消息
    await input.fill('新消息')
    await expect(input).toHaveValue('新消息')
  })

  test('1.5 边界条件：快速连续发送应该被阻止', async ({ page }) => {
    const input = page.locator(SELECTORS.promptInput)

    // 发送第一条消息
    await sendMessage(page, '第一条消息')

    // 验证输入框被禁用
    await expect(input).toBeDisabled()

    // 尝试输入第二条消息（应该被阻止）
    await input.fill('第二条消息')

    // 验证：输入框仍然为空（因为被禁用）
    await expect(input).toHaveValue('')

    // 停止任务
    await stopTask(page)
  })
})
