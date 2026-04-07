/**
 * Playwright globalTeardown — 停止 api-server，可选清理数据库
 */
export default async function globalTeardown() {
  const { stopApiServer } = await import('./api-server-setup.js')
  await stopApiServer()
  console.log('[E2E globalTeardown] API server stopped')

  // 保留测试数据库用于调试（如需清理，取消注释）
  // const { teardownTestDatabase } = await import('./test-db.js')
  // await teardownTestDatabase()
}
