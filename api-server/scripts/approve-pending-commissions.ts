/**
 * 批量审核通过待审核的佣金记录
 *
 * 背景：
 * - 之前佣金生成后状态为 pending，需要管理员审核
 * - 现在改为自动审核通过（approved）
 * - 需要将历史的 pending 佣金批量改为 approved
 *
 * 使用方法：
 * npx tsx scripts/approve-pending-commissions.ts [--dry-run]
 */

import 'dotenv/config';
import { pool } from '../src/db/index.js';

async function approvePendingCommissions(dryRun: boolean = false) {
  console.log('='.repeat(60));
  console.log('批量审核通过待审核佣金');
  console.log('='.repeat(60));
  console.log(`\n模式: ${dryRun ? '试运行（不实际更新）' : '正式运行'}\n`);

  try {
    // 1. 查询所有待审核的佣金
    console.log('1️⃣  查询待审核的佣金记录...');
    const pendingResult = await pool.query(
      `SELECT
        rc.id,
        rc.referrer_id,
        u_referrer.email as referrer_email,
        u_referrer.name as referrer_name,
        rc.referred_id,
        u_referred.email as referred_email,
        rc.order_amount,
        rc.commission_amount,
        rc.level,
        rc.created_at
      FROM referral_commissions rc
      JOIN users u_referrer ON rc.referrer_id = u_referrer.id
      JOIN users u_referred ON rc.referred_id = u_referred.id
      WHERE rc.status = 'pending'
      ORDER BY rc.created_at ASC`
    );

    const pendingCommissions = pendingResult.rows as Array<{
      id: string;
      referrer_id: string;
      referrer_email: string;
      referrer_name: string | null;
      referred_id: string;
      referred_email: string;
      order_amount: string;
      commission_amount: string;
      level: number;
      created_at: Date;
    }>;

    console.log(`✅ 找到 ${pendingCommissions.length} 条待审核佣金\n`);

    if (pendingCommissions.length === 0) {
      console.log('没有需要处理的佣金记录');
      return;
    }

    // 2. 显示详情
    console.log('2️⃣  待审核佣金详情:\n');
    pendingCommissions.forEach((commission, index) => {
      console.log(`[${index + 1}] 佣金ID: ${commission.id}`);
      console.log(`    推荐人: ${commission.referrer_email} (${commission.referrer_name || '未设置'})`);
      console.log(`    被推荐人: ${commission.referred_email}`);
      console.log(`    订单金额: ¥${commission.order_amount}`);
      console.log(`    佣金金额: ¥${commission.commission_amount}`);
      console.log(`    佣金级别: ${commission.level} 级`);
      console.log(`    创建时间: ${commission.created_at.toLocaleString('zh-CN')}`);
      console.log();
    });

    // 3. 统计
    const totalAmount = pendingCommissions.reduce(
      (sum, c) => sum + parseFloat(c.commission_amount),
      0
    );
    console.log('='.repeat(60));
    console.log('统计信息');
    console.log('='.repeat(60));
    console.log(`总计佣金记录: ${pendingCommissions.length} 条`);
    console.log(`总计佣金金额: ¥${totalAmount.toFixed(2)}`);
    console.log();

    // 按推荐人分组统计
    const byReferrer = new Map<string, { email: string; name: string | null; count: number; amount: number }>();
    pendingCommissions.forEach((c) => {
      const existing = byReferrer.get(c.referrer_id);
      if (existing) {
        existing.count++;
        existing.amount += parseFloat(c.commission_amount);
      } else {
        byReferrer.set(c.referrer_id, {
          email: c.referrer_email,
          name: c.referrer_name,
          count: 1,
          amount: parseFloat(c.commission_amount),
        });
      }
    });

    console.log('按推荐人统计:');
    byReferrer.forEach((stats, referrerId) => {
      console.log(`  ${stats.email} (${stats.name || '未设置'})`);
      console.log(`    佣金记录: ${stats.count} 条`);
      console.log(`    佣金金额: ¥${stats.amount.toFixed(2)}`);
    });
    console.log();

    // 4. 批量审核通过
    if (dryRun) {
      console.log('⚠️  试运行模式，不实际更新\n');
      console.log('如需正式审核通过，请运行: npx tsx scripts/approve-pending-commissions.ts');
    } else {
      console.log('3️⃣  开始批量审核通过...\n');

      const updateResult = await pool.query(
        `UPDATE referral_commissions
         SET status = 'approved', settled_at = NOW()
         WHERE status = 'pending'
         RETURNING id`
      );

      const updatedCount = updateResult.rows.length;

      console.log('='.repeat(60));
      console.log('审核完成');
      console.log('='.repeat(60));
      console.log(`成功审核通过: ${updatedCount} 条佣金记录`);
      console.log(`总计金额: ¥${totalAmount.toFixed(2)}`);
      console.log('\n✅ 用户现在可以提现这些佣金了');
    }

  } catch (error) {
    console.error('❌ 处理过程中出错:', error);
  } finally {
    await pool.end();
  }
}

// 从命令行参数判断是否为试运行
const dryRun = process.argv.includes('--dry-run');

approvePendingCommissions(dryRun);
