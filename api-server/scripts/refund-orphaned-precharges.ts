/**
 * 一次性退款脚本：清理孤儿预扣记录
 *
 * 用法：
 *   npx tsx scripts/refund-orphaned-precharges.ts          # dry-run（只查看）
 *   npx tsx scripts/refund-orphaned-precharges.ts --apply   # 执行退款
 *   npx tsx scripts/refund-orphaned-precharges.ts --apply --before 2026-03-06T12:00:00Z
 *
 * 默认截止时间：2026-03-06T00:00:00Z（修复部署前）
 */

import { db } from '../src/db';
import { balanceTransactions } from '../src/db/schema';
import { billingService } from '../src/services/billing';
import { sql } from 'drizzle-orm';

const DEFAULT_CUTOFF = '2026-03-06T00:00:00Z';

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const beforeIdx = args.indexOf('--before');
  const cutoff = beforeIdx >= 0 && args[beforeIdx + 1]
    ? args[beforeIdx + 1]!
    : DEFAULT_CUTOFF;

  console.log(`模式: ${applyMode ? '🔴 APPLY（真正退款）' : '🟢 DRY-RUN（只查看）'}`);
  console.log(`截止时间: ${cutoff}`);
  console.log('');

  // 查询孤儿预扣记录
  const orphaned = await db.execute(
    sql`SELECT id, user_id, credits_amount, metadata, created_at
        FROM balance_transactions
        WHERE type = 'precharge'
          AND (metadata->>'status') = 'pending'
          AND created_at < ${cutoff}::timestamptz
        ORDER BY created_at ASC`
  );

  const rows = orphaned.rows as Array<{
    id: string;
    user_id: string;
    credits_amount: string;
    metadata: {
      preChargeId?: string;
      quotaUsed?: number;
      creditsUsed?: number;
      cardDeductions?: Array<{ cardId: string; quotaUsed: number }>;
      periodCardId?: string | null;
    };
    created_at: string;
  }>;

  if (rows.length === 0) {
    console.log('未找到孤儿预扣记录，无需处理。');
    process.exit(0);
  }

  console.log(`找到 ${rows.length} 条孤儿预扣记录：`);
  console.log('='.repeat(100));

  let successCount = 0;
  let failCount = 0;

  for (const row of rows) {
    const meta = row.metadata;
    const preChargeId = meta?.preChargeId ?? '(unknown)';
    const quotaUsed = meta?.quotaUsed ?? 0;
    const creditsUsed = meta?.creditsUsed ?? 0;
    const hasCardDeductions = (meta?.cardDeductions && meta.cardDeductions.length > 0)
      || (meta?.periodCardId && quotaUsed > 0);

    console.log(`  userId: ${row.user_id}`);
    console.log(`  preChargeId: ${preChargeId}`);
    console.log(`  createdAt: ${row.created_at}`);
    console.log(`  creditsUsed: ${creditsUsed}`);
    console.log(`  quotaUsed: ${quotaUsed}`);
    console.log(`  涉及期卡: ${hasCardDeductions ? '是' : '否'}`);

    if (applyMode) {
      try {
        await billingService.refundPreCharge(row.user_id, preChargeId);
        console.log(`  ✅ 退款成功`);
        successCount++;
      } catch (error) {
        console.log(`  ❌ 退款失败: ${(error as Error).message}`);
        failCount++;
      }
    }

    console.log('');
  }

  console.log('='.repeat(100));
  if (applyMode) {
    console.log(`退款完成：成功 ${successCount}，失败 ${failCount}，共 ${rows.length} 条`);
  } else {
    console.log(`DRY-RUN 完成。共 ${rows.length} 条待处理。`);
    console.log('添加 --apply 参数执行真正退款。');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
