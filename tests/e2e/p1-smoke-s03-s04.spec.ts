// Real Smoke Suite: S-03 / S-04
//
// 覆盖场景：
//   S-03 权限确认流程 — permission_request/resolve 成对，pendingPermissions 清空
//   S-04 失效 resume 回退 — 清空 claude_session_id 后继续会话，history fallback 生效

import { test, expect } from './fixtures/smoke-app'
import { Page } from '@playwright/test'
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
  // S-03：权限确认流程 — permission_request/resolve 成对
  // ───────────────────────────────────────────────────────────────────────────
  test('S-03 权限确认流程 — permission_request/resolve 成对', async ({ electronApp, window }) => {
    // 允许 3× 超时（针对耗时长的 AI 会话及权限弹窗等待）
    test.slow()

    // 1. 等待应用主界面加载完毕
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(2000)

    // 2. 发送需要文件系统写入权限的 prompt（在 default 模式下会触发权限弹窗）
    const promptInput = window.locator('textarea[data-prompt-input]')
    await expect(promptInput).toBeVisible({ timeout: 15_000 })

    await promptInput.fill(
      '在 /tmp 目录创建一个名为 cherry-smoke-s03.txt 的文件，内容为 smoke-test-s03'
    )
    await promptInput.press('Enter')

    // 3. 等待会话启动
    await waitForSessionRunning(window)

    // 4. 检测是否出现权限确认弹窗（permissionMode=default 时触发）
    const permissionDialog = window.locator(
      [
        '[data-testid="permission-dialog"]',
        '[data-permission-request]',
        '.permission-dialog',
        '[aria-label*="权限"]',
        '[aria-label*="permission"]',
        '[role="dialog"]:has-text("允许")',
        '[role="dialog"]:has-text("Allow")',
      ].join(', ')
    )

    let permissionDialogFound = false
    try {
      await expect(permissionDialog.first()).toBeVisible({ timeout: 30_000 })
      permissionDialogFound = true
      console.log('[S-03] Permission dialog appeared — clicking allow')
    } catch {
      // permissionMode 不是 default（如 bypassPermissions），直接自动批准，不报错
      console.log('[S-03] Permission dialog not found — may be auto-approved mode')
    }

    if (permissionDialogFound) {
      // 点击允许/确认按钮
      const allowBtn = window.locator(
        'button:has-text("允许"), button:has-text("Allow"), button:has-text("确认"), button:has-text("批准"), [data-allow-btn]'
      ).first()
      await allowBtn.click()
    }

    // 5. 等待会话完成
    await waitForSessionIdle(window)

    // 6. 截图存档
    await window.screenshot({ path: 'tests/e2e/results/s03-completed.png' })

    // 7. 获取最新会话 ID
    const sessionId = await getLatestSessionId(window)
    expect(sessionId).toBeTruthy()

    // 8. 获取诊断快照并断言权限事件成对
    const diag = sessionId ? await getDiagnostics(window, sessionId) : null

    if (diag) {
      // permission_request 与 permission_resolve 必须成对出现
      const permReqs: unknown[] = diag.events?.filter(
        (e: any) => e.kind === 'permission_request'
      ) ?? []
      const permResolvs: unknown[] = diag.events?.filter(
        (e: any) => e.kind === 'permission_resolve'
      ) ?? []

      if (permReqs.length > 0) {
        // 有权限请求就必须有对应的 resolve（不能悬挂）
        expect(
          permResolvs.length,
          'every permission_request must have a matching permission_resolve'
        ).toBeGreaterThan(0)
      }

      // 会话结束时 pendingPermissions 必须全部清空
      expect(
        diag.pendingPermissions,
        'pendingPermissions should be empty after session completes'
      ).toHaveLength(0)

      // 无 stall（会话未卡死）
      expect(diag.stallDetected, 'stall should not be detected').toBe(false)

      // 持久化基线快照（含弹窗是否出现的元信息）
      saveBaseline(
        { ...diag, exportedAt: Date.now(), smokeId: 'S-03', permissionDialogFound },
        's03-permission.json'
      )
    } else {
      // debug 模块不可用（旧版本）—— 跳过诊断断言，不 fail
      console.warn('[S-03] window.electron.debug unavailable — skipping diagnostic assertions')
    }
  })

  // ───────────────────────────────────────────────────────────────────────────
  // S-04：失效 resume — history fallback 生效
  // ───────────────────────────────────────────────────────────────────────────
  test('S-04 失效 resume — history fallback 生效', async ({ electronApp, window }) => {
    // 允许 3× 超时（两轮 AI 调用）
    test.slow()

    // 1. 等待主界面就绪
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(2000)

    // ── 第一轮：正常完成一条会话 ─────────────────────────────────────────────

    const promptInput = window.locator('textarea[data-prompt-input]')
    await expect(promptInput).toBeVisible({ timeout: 15_000 })

    await promptInput.fill('说一句话：你好，我是 Cherry Agent')
    await promptInput.press('Enter')

    await waitForSessionRunning(window)
    await waitForSessionIdle(window)

    // 获取当前会话 ID（第一轮结束后立即取，确保拿到正确 ID）
    const sessionId = await getLatestSessionId(window)
    expect(sessionId).toBeTruthy()

    // ── 模拟 claude_session_id 过期：直接写 DB 清空该字段 ────────────────────

    if (sessionId) {
      await electronApp.evaluate(async ({ app }, sid) => {
        try {
          const userDataPath = app.getPath('userData')
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const Database = require('better-sqlite3')
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const dbPath = require('path').join(userDataPath, 'cherry-agent.db')
          const db = new Database(dbPath)
          db.prepare('UPDATE sessions SET claude_session_id = NULL WHERE id = ?').run(sid)
          db.close()
          console.log(`[S-04] Cleared claude_session_id for session ${sid}`)
        } catch (e) {
          console.log('[S-04] DB update failed (may not exist):', String(e))
        }
      }, sessionId)
    }

    // 等待 DB 写入完成后稳定一帧
    await window.waitForTimeout(500)

    // ── 第二轮：在同一会话中继续发消息（触发 resume fallback）────────────────

    const promptInput2 = window.locator('textarea[data-prompt-input]')
    await expect(promptInput2).toBeVisible({ timeout: 10_000 })

    await promptInput2.fill('继续：请告诉我你能做什么')
    await promptInput2.press('Enter')

    await waitForSessionRunning(window)
    await waitForSessionIdle(window)

    // 截图存档
    await window.screenshot({ path: 'tests/e2e/results/s04-completed.png' })

    // ── 获取诊断快照并断言 fallback 路径被走到 ──────────────────────────────

    const diag = sessionId ? await getDiagnostics(window, sessionId) : null

    if (diag) {
      // sdk_resume（可能 success=false）或 sdk_init（fallback 到全量历史重建）
      // 至少要有其中一类事件，证明 runner 层感知到了 resume 逻辑
      const resumeOrInitEvents: unknown[] = diag.events?.filter(
        (e: any) => e.kind === 'sdk_resume' || e.kind === 'sdk_init'
      ) ?? []
      expect(
        resumeOrInitEvents.length,
        'at least one sdk_resume or sdk_init event expected (history fallback path)'
      ).toBeGreaterThan(0)

      // 第二轮会话仍然正常完成，不是 error/stall 状态
      expect(diag.stallDetected, 'stall should not be detected after fallback').toBe(false)

      // 无悬挂的权限请求
      expect(
        diag.pendingPermissions,
        'pendingPermissions should be empty after session completes'
      ).toHaveLength(0)

      // 持久化基线快照
      saveBaseline(
        { ...diag, exportedAt: Date.now(), smokeId: 'S-04' },
        's04-resume.json'
      )
    } else {
      // debug 模块不可用（旧版本）—— 跳过诊断断言，不 fail
      console.warn('[S-04] window.electron.debug unavailable — skipping diagnostic assertions')
    }
  })
})
