import { test, expect } from '../fixtures/electron-app.js'

test('debug: dump page content', async ({ window }) => {
  test.setTimeout(60000)
  await window.waitForTimeout(5000)

  // 截图
  await window.screenshot({ path: 'tests/e2e/results/debug-page.png' })

  // 获取页面 URL
  const url = window.url()
  console.log('[DEBUG] URL:', url)

  // 获取页面所有可见文本
  const bodyText = await window.evaluate(() => document.body.innerText)
  console.log('[DEBUG] Page text (first 3000):', bodyText.substring(0, 3000))

  // 获取 HTML 结构
  const html = await window.evaluate(() => document.body.innerHTML.substring(0, 3000))
  console.log('[DEBUG] HTML (first 3000):', html)

  // 获取所有 button 的文本
  const buttons = await window.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText.trim().substring(0, 50),
      ariaLabel: b.getAttribute('aria-label'),
    }))
  })
  console.log('[DEBUG] Buttons:', JSON.stringify(buttons))

  // 检查 preload API
  const preloadCheck = await window.evaluate(() => {
    const w = window as any
    return {
      hasElectron: !!w.electron,
      hasElectronAPI: !!w.electronAPI,
      electronKeys: w.electron ? Object.keys(w.electron) : [],
      electronAPIKeys: w.electronAPI ? Object.keys(w.electronAPI) : [],
      globalThisElectron: !!(globalThis as any).electron,
    }
  })
  console.log('[DEBUG] Preload API:', JSON.stringify(preloadCheck))
})
