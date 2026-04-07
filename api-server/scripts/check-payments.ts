import { db } from '../src/db';
import { payments, balanceTransactions } from '../src/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

const userId = '882b1b36-bccc-4722-9bab-fdda2201ee4e';

async function checkPayments() {
  console.log('检查支付记录...\n');

  // 1. 查询所有支付记录
  const allPayments = await db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt))
    .limit(20);

  console.log(`用户 ${userId} 的所有支付记录（共 ${allPayments.length} 条）：`);
  console.log('='.repeat(100));

  allPayments.forEach((payment, index) => {
    console.log(`\n[${index + 1}] ID: ${payment.id}`);
    console.log(`    支付方式: ${payment.paymentMethod}`);
    console.log(`    金额: ${payment.amount}`);
    console.log(`    状态: ${payment.status}`);
    console.log(`    描述: ${payment.description}`);
    console.log(`    创建时间: ${payment.createdAt}`);
    if (payment.metadata) {
      console.log(`    元数据: ${JSON.stringify(payment.metadata)}`);
    }
  });

  // 2. 查询成功的支付记录
  const succeededPayments = allPayments.filter(p => p.status === 'succeeded');
  console.log('\n\n' + '='.repeat(100));
  console.log(`\n成功的支付记录（共 ${succeededPayments.length} 条）：`);
  console.log('='.repeat(100));

  for (const payment of succeededPayments) {
    console.log(`\n支付 ID: ${payment.id}`);
    console.log(`  支付方式: ${payment.paymentMethod}`);
    console.log(`  金额: ${payment.amount}`);
    console.log(`  描述: ${payment.description}`);
    console.log(`  创建时间: ${payment.createdAt}`);

    // 检查是否有对应的 balance_transactions 记录
    const relatedTransactions = await db
      .select()
      .from(balanceTransactions)
      .where(
        and(
          eq(balanceTransactions.userId, userId),
          eq(balanceTransactions.referenceType, 'payment'),
          eq(balanceTransactions.referenceId, payment.id)
        )
      );

    if (relatedTransactions.length === 0) {
      console.log(`  ❌ 没有对应的 balance_transactions 记录！`);
    } else {
      console.log(`  ✅ 有 ${relatedTransactions.length} 条对应的 balance_transactions 记录`);
      relatedTransactions.forEach((tx, i) => {
        console.log(`     [${i + 1}] 类型: ${tx.type}, 金额: ${tx.amount}, 描述: ${tx.description}`);
      });
    }
  }

  // 3. 统计支付状态
  const statusStats = allPayments.reduce((acc, payment) => {
    acc[payment.status] = (acc[payment.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\n\n' + '='.repeat(100));
  console.log('\n支付状态统计：');
  console.log('='.repeat(100));
  Object.entries(statusStats).forEach(([status, count]) => {
    console.log(`  ${status}: ${count} 条`);
  });

  process.exit(0);
}

checkPayments().catch((error) => {
  console.error('查询失败:', error);
  process.exit(1);
});
