/**
 * 检查 Stripe 期卡订单
 */

import 'dotenv/config';
import { pool } from '../src/db/index.js';

async function checkStripeOrders() {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM payments
       WHERE status = 'succeeded'
         AND payment_method = 'stripe'
         AND metadata->>'type' = 'period_card_purchase'`
    );

    const count = parseInt(result.rows[0]?.count || '0');
    console.log(`Stripe 期卡订单数量: ${count}`);

    if (count > 0) {
      const detailResult = await pool.query(
        `SELECT
          p.id,
          p.user_id,
          u.email,
          p.amount,
          p.currency,
          p.paid_at
        FROM payments p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.status = 'succeeded'
          AND p.payment_method = 'stripe'
          AND p.metadata->>'type' = 'period_card_purchase'
        ORDER BY p.paid_at ASC`
      );

      console.log('\nStripe 期卡订单详情:');
      detailResult.rows.forEach((row: any, index: number) => {
        console.log(`[${index + 1}] ${row.email} - ${row.amount} ${row.currency} - ${row.paid_at}`);
      });
    }

  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await pool.end();
  }
}

checkStripeOrders();
