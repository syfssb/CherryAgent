/**
 * 查询期卡购买订单详情
 */

import 'dotenv/config';
import { pool } from '../src/db/index.js';

async function queryOrders() {
  console.log('='.repeat(60));
  console.log('期卡购买订单详情');
  console.log('='.repeat(60));
  console.log();

  try {
    const result = await pool.query(
      `SELECT
        p.id,
        p.user_id,
        u.email,
        u.name,
        p.amount,
        p.currency,
        p.status,
        p.description,
        p.paid_at,
        p.created_at,
        p.metadata->>'type' as order_type,
        p.metadata->>'periodCardPlanId' as plan_id
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.status = 'succeeded'
        AND p.payment_method = 'xunhupay'
        AND p.metadata->>'type' = 'period_card_purchase'
      ORDER BY p.paid_at ASC`
    );

    console.log(`找到 ${result.rows.length} 条期卡购买订单:\n`);

    result.rows.forEach((row: any, index: number) => {
      console.log(`[${index + 1}] 订单ID: ${row.id}`);
      console.log(`    用户: ${row.email} (${row.name || '未设置'})`);
      console.log(`    金额: ¥${row.amount} ${row.currency}`);
      console.log(`    描述: ${row.description}`);
      console.log(`    支付时间: ${row.paid_at}`);
      console.log(`    创建时间: ${row.created_at}`);
      console.log();
    });

    // 统计每个用户的购买次数
    console.log('='.repeat(60));
    console.log('用户购买统计');
    console.log('='.repeat(60));
    console.log();

    const stats = await pool.query(
      `SELECT
        u.email,
        u.name,
        COUNT(*) as order_count,
        SUM(CAST(p.amount AS DECIMAL)) as total_amount
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.status = 'succeeded'
        AND p.payment_method = 'xunhupay'
        AND p.metadata->>'type' = 'period_card_purchase'
      GROUP BY u.email, u.name
      ORDER BY order_count DESC`
    );

    stats.rows.forEach((row: any) => {
      console.log(`${row.email} (${row.name || '未设置'})`);
      console.log(`  购买次数: ${row.order_count} 次`);
      console.log(`  总金额: ¥${row.total_amount}`);
      console.log();
    });

  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await pool.end();
  }
}

queryOrders();
