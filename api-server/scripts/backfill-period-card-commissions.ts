/**
 * 补发期卡购买佣金脚本
 *
 * 背景：
 * - 之前期卡购买没有触发佣金计算
 * - 现在已修复，需要为历史订单补发佣金
 *
 * 使用方法：
 * npx tsx scripts/backfill-period-card-commissions.ts [--dry-run]
 */

import 'dotenv/config';
import { pool } from '../src/db/index.js';
import { generateReferralCommission } from '../src/services/referral.js';

interface PeriodCardPayment {
  id: string;
  user_id: string;
  amount: string;
  payment_method: string;
  paid_at: Date;
  created_at: Date;
  user_email: string;
  user_name: string;
}

async function backfillCommissions(dryRun: boolean = false) {
  console.log('='.repeat(60));
  console.log('期卡购买佣金补发工具');
  console.log('='.repeat(60));
  console.log(`\n模式: ${dryRun ? '试运行（不实际生成佣金）' : '正式运行'}\n`);

  try {
    // 1. 查询所有已支付的期卡购买订单（迅虎支付 + Stripe）
    console.log('1️⃣  查询已支付的期卡购买订单...');
    const paymentsResult = await pool.query(
      `SELECT
        p.id,
        p.user_id,
        p.amount,
        p.payment_method,
        p.paid_at,
        p.created_at,
        u.email as user_email,
        u.name as user_name
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.status = 'succeeded'
        AND p.payment_method IN ('xunhupay', 'stripe')
        AND p.metadata->>'type' = 'period_card_purchase'
      ORDER BY p.paid_at ASC`
    );

    const payments = paymentsResult.rows as PeriodCardPayment[];
    console.log(`✅ 找到 ${payments.length} 条期卡购买记录\n`);

    if (payments.length === 0) {
      console.log('没有需要处理的订单');
      return;
    }

    // 2. 检查每个订单是否已有佣金记录
    console.log('2️⃣  检查佣金记录...');
    let needBackfillCount = 0;
    const needBackfillPayments: PeriodCardPayment[] = [];

    for (const payment of payments) {
      const commissionResult = await pool.query(
        `SELECT id FROM referral_commissions WHERE order_id = $1`,
        [payment.id]
      );

      if (commissionResult.rows.length === 0) {
        needBackfillCount++;
        needBackfillPayments.push(payment);
        console.log(`   ❌ 订单 ${payment.id} (${payment.payment_method}, ${payment.user_email}, ¥${payment.amount}) - 缺少佣金记录`);
      } else {
        console.log(`   ✅ 订单 ${payment.id} (${payment.payment_method}, ${payment.user_email}, ¥${payment.amount}) - 已有佣金记录`);
      }
    }

    console.log(`\n需要补发佣金的订单: ${needBackfillCount} 条\n`);

    if (needBackfillCount === 0) {
      console.log('所有订单都已有佣金记录，无需补发');
      return;
    }

    // 3. 补发佣金
    if (dryRun) {
      console.log('⚠️  试运行模式，不实际生成佣金\n');
      console.log('如需正式补发，请运行: npx tsx scripts/backfill-period-card-commissions.ts');
    } else {
      console.log('3️⃣  开始补发佣金...\n');

      let successCount = 0;
      let failCount = 0;

      for (const payment of needBackfillPayments) {
        try {
          console.log(`   处理订单 ${payment.id} (${payment.payment_method}, ${payment.user_email}, ¥${payment.amount})...`);

          const amount = parseFloat(payment.amount);
          await generateReferralCommission(payment.user_id, payment.id, amount);

          successCount++;
          console.log(`   ✅ 成功生成佣金`);
        } catch (error) {
          failCount++;
          console.error(`   ❌ 生成佣金失败:`, error instanceof Error ? error.message : error);
        }
      }

      console.log('\n' + '='.repeat(60));
      console.log('补发完成');
      console.log('='.repeat(60));
      console.log(`总计: ${needBackfillCount} 条`);
      console.log(`成功: ${successCount} 条`);
      console.log(`失败: ${failCount} 条`);
    }

  } catch (error) {
    console.error('❌ 补发过程中出错:', error);
  } finally {
    await pool.end();
  }
}

// 从命令行参数判断是否为试运行
const dryRun = process.argv.includes('--dry-run');

backfillCommissions(dryRun);
