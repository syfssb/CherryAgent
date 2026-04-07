// Real Smoke Suite: S-01 / S-02
//
// 覆盖场景：
//   S-01 长时会话 — 多轮工具调用（Bash + Read + 总结），验证诊断包无 stall
//   S-02 工具调用完整链路 — Bash/Read/Bash 写读删，验证 tool_validation_ok 事件 ≥ 3

import { test, expect } from './fixtures/smoke-app'
import { ElectronApplication, Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// 共用辅助函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 通过 preload IPC bridge 获取最新会话 ID。
 * 会话列表按创建时间倒序，取第一条。
 */
async function getLatestSessionId(window: Page): Promise<string | null> {
  try {
    const result = await window.evaluate(async () => {
      const e = (window as any).electron
      if (!e?.session?.listWithOptions) return null
      const res = await e.session.listWithOptions({ limit: 1 })
      const sessions = res?.data ?? res
      return Array.isArray(sessions) && sessions.length > 0 ? sessions[0].id : null
    })
    return result
  } catch {
    return null
  }
}

/**
 * 通过 IPC 获取指定会话的诊断快照。
 * 若 `window.electron.debug` 不存在（旧版本）则返回 null，
 * 调用方应跳过诊断断言而非让测试失败。
 */
async function getDiagnostics(window: Page, sessionId: string): Promise<any | null> {
  try {
    const result = await window.evaluate(async (sid) => {
      const e = (window as any).electron
      if (!e?.debug?.getSessionDiagnostics) return null
      return e.debug.getSessionDiagnostics(sid)
    }, sessionId)
    return result ?? null
  } catch {
    return null
  }
}

/**
 * 将诊断数据序列化为 JSON 并写入 baselines 目录，用于后续回归比对。
 * 目录不存在时自动创建。
 */
function saveBaseline(data: unknown, filename: string): void {
  const dir = path.join(process.cwd(), '.claude/evals/baselines')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * 等待当前会话进入空闲状态（AI 回复完成）。
 * 判据：发送按钮重新可见（运行中该按钮被停止按钮替换）。
 * 最长等待 120 秒，超时即判定测试失败。
 */
async function waitForSessionIdle(window: Page): Promise<void> {
  // 发送按钮出现 = 会话已完成，AI 不再输出
  await expect(
    window.locator('button[aria-label*="发送"], button[data-send-button]')
  ).toBeVisible({ timeout: 120_000 })
}

/**
 * 等待会话开始运行（停止按钮出现）。
 * 最长等待 20 秒，超时说明消息未被接受或 AI 未响应。
 */
async function waitForSessionRunning(window: Page): Promise<void> {
  await expect(
    window.locator('button[aria-label*="停止"], [data-stop-button]')
  ).toBeVisible({ timeout: 20_000 })
}

// ─────────────────────────────────────────────────────────────────────────────
// 测试套件
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Real Smoke Suite', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // S-01：长时会话 — 3+ 轮工具调用
  // ───────────────────────────────────────────────────────────────────────────
  test('S-01 长时会话 — 3+ 轮工具调用', async ({ electronApp, window }) => {
    // 允许 3× 超时（针对耗时长的 AI 会话）
    test.slow()

    // 1. 等待应用主界面加载完毕
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(2000)

    // 2. 定位输入框并发送多步 prompt
    const promptInput = window.locator('textarea[data-prompt-input]')
    await expect(promptInput).toBeVisible({ timeout: 15_000 })

    await promptInput.fill(
      '请依次执行：\n' +
      '1. 列出当前目录的所有文件（使用 Bash: ls -la）\n' +
      '2. 读取 package.json 文件\n' +
      '3. 用一段话总结 package.json 的主要内容'
    )
    await promptInput.press('Enter')

    // 3. 确认会话已进入运行状态（停止按钮出现）
    await waitForSessionRunning(window)

    // 4. 等待会话完成（发送按钮重新出现）
    await waitForSessionIdle(window)

    // 5. 截图存档
    await window.screenshot({ path: 'tests/e2e/results/s01-completed.png' })

    // 6. 获取最新会话 ID
    const sessionId = await getLatestSessionId(window)
    expect(sessionId).toBeTruthy()

    // 7. 获取诊断快照并断言核心指标
    const diag = sessionId ? await getDiagnostics(window, sessionId) : null

    if (diag) {
      // 无 stall（会话未卡死）
      expect(diag.stallDetected, 'stall should not be detected').toBe(false)

      // 事件列表非空
      expect(
        diag.events?.length ?? 0,
        'diagnostic events should be non-empty'
      ).toBeGreaterThan(0)

      // 至少有一个 tool_result 事件（证明工具被实际调用并返回结果）
      const toolResults: unknown[] = diag.events?.filter(
        (e: any) => e.kind === 'tool_result'
      ) ?? []
      expect(
        toolResults.length,
        'at least one tool_result event expected'
      ).toBeGreaterThan(0)

      // metrics 存在且队列已清空（无积压）
      expect(diag.metrics, 'metrics object should exist').toBeTruthy()
      expect(
        diag.metrics?.queueDepth ?? 0,
        'queue should be empty after session completes'
      ).toBe(0)

      // 持久化基线快照
      saveBaseline(
        { ...diag, exportedAt: Date.now(), smokeId: 'S-01' },
        's01-long-session.json'
      )
    } else {
      // debug 模块不可用（旧版本）—— 跳过诊断断言，不 fail
      console.warn('[S-01] window.electron.debug unavailable — skipping diagnostic assertions')
    }
  })

  // ───────────────────────────────────────────────────────────────────────────
  // S-02：工具调用完整链路 — Bash/Read/Write
  // ───────────────────────────────────────────────────────────────────────────
  test('S-02 工具调用完整链路 — Bash/Read/Write', async ({ electronApp, window }) => {
    test.slow()

    // 1. 等待主界面就绪
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(2000)

    // 2. 发送包含 Bash 写入、Read 读取、Bash 删除的三步 prompt
    const promptInput = window.locator('textarea[data-prompt-input]')
    await expect(promptInput).toBeVisible({ timeout: 15_000 })

    await promptInput.fill(
      '请执行：\n' +
      '1. bash: echo "cherry-smoke-test" > /tmp/cherry-smoke.txt\n' +
      '2. 读取 /tmp/cherry-smoke.txt\n' +
      '3. bash: rm /tmp/cherry-smoke.txt'
    )
    await promptInput.press('Enter')

    // 3. 等待会话启动
    await waitForSessionRunning(window)

    // 4. 等待会话完成
    await waitForSessionIdle(window)

    // 5. 截图存档
    await window.screenshot({ path: 'tests/e2e/results/s02-completed.png' })

    // 6. 获取最新会话 ID
    const sessionId = await getLatestSessionId(window)
    expect(sessionId).toBeTruthy()

    // 7. 获取诊断快照并断言工具链路完整性
    const diag = sessionId ? await getDiagnostics(window, sessionId) : null

    if (diag) {
      // 每个工具调用都应有对应的 tool_validation_ok 事件（3 步工具 = 至少 3 个）
      const validationOkEvents: unknown[] = diag.events?.filter(
        (e: any) => e.kind === 'tool_validation_ok'
      ) ?? []
      expect(
        validationOkEvents.length,
        'at least 3 tool_validation_ok events expected (write / read / delete)'
      ).toBeGreaterThanOrEqual(3)

      // 无 stall
      expect(diag.stallDetected, 'stall should not be detected').toBe(false)

      // 无待处理的权限请求（所有权限已在会话结束前处理完毕）
      expect(
        diag.pendingPermissions,
        'pendingPermissions should be empty after session completes'
      ).toHaveLength(0)

      // 持久化基线快照
      saveBaseline(
        { ...diag, exportedAt: Date.now(), smokeId: 'S-02' },
        's02-tool-chain.json'
      )
    } else {
      // debug 模块不可用（旧版本）—— 跳过诊断断言，不 fail
      console.warn('[S-02] window.electron.debug unavailable — skipping diagnostic assertions')
    }
  })
})
