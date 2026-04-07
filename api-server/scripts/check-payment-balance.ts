import { db } from '../src/db';
import { users, payments, balanceTransactions } from '../src/db/schema';
import { eq, desc, and } from 'drizzle-orm';

const userEmail = 'jinininx@gmail.com';

async function checkPaymentAndBalance() {
  console.log(`查询用户 ${userEmail} 的支付记录和余额变动记录...\n`);

  // 1. 查询用户信息
  const userList = await db
    .select()
    .from(users)
    .where(eq(users.email, userEmail))
    .limit(1);

  if (userList.length === 0) {
    console.log(`❌ 未找到用户 ${userEmail}`);
    process.exit(1);
  }

  const user = userList[0];
  console.log(`用户信息：`);
  console.log(`  ID: ${user.id}`);
  console.log(`  邮箱: ${user.email}`);
  console.log(`  积分: ${user.credits}`);
  console.log('='.repeat(100));

  // 2. 查询支付记录
  const paymentRecords = await db
    .select()
    .from(payments)
    .where(eq(payments.userId, user.id))
    .orderBy(desc(payments.createdAt))
    .limit(20);

  console.log(`\n支付记录（共 ${paymentRecords.length} 条）：`);
  console.log('='.repeat(100));

  const succeededPayments = paymentRecords.filter(p => p.status === 'succeeded');
  console.log(`\n成功的支付记录（共 ${succeededPayments.length} 条）：`);

  for (const payment of succeededPayments) {
    console.log(`\n支付 ID: ${payment.id}`);
    console.log(`  支付方式: ${payment.paymentMethod}`);
    console.log(`  金额: ${payment.amount}`);
    console.log(`  状态: ${payment.status}`);
    console.log(`  描述: ${payment.description}`);
    console.log(`  创建时间: ${payment.createdAt}`);

    // 检查是否有对应的 balance_transactions 记录
    const relatedTransactions = await db
      .select()
      .from(balanceTransactions)
      .where(
        and(
          eq(balanceTransactions.userId, user.id),
          eq(balanceTransactions.referenceType, 'payment'),
          eq(balanceTransactions.referenceId, payment.id)
        )
      );

    if (relatedTransactions.length === 0) {
      console.log(`  ❌ 没有对应的 balance_transactions 记录！`);
      console.log(`  ⚠️  这说明支付成功后，rechargeCredits() 没有被调用`);
    } else {
      console.log(`  ✅ 有 ${relatedTransactions.length} 条对应的 balance_transactions 记录`);
      relatedTransactions.forEach((tx, i) => {
        console.log(`     [${i + 1}] 类型: ${tx.type}, 金额: ${tx.amount}, 描述: ${tx.description}`);
      });
    }
  }

  // 3. 查询余额变动记录
  const transactionRecords = await db
    .select()
    .from(balanceTransactions)
    .where(eq(balanceTransactions.userId, user.id))
    .orderBy(desc(balanceTransactions.createdAt))
    .limit(20);

  console.log('\n\n' + '='.repeat(100));
  console.log(`\n余额变动记录（共 ${transactionRecords.length} 条）：`);
  console.log('='.repeat(100));

  transactionRecords.forEach((record, index) => {
    console.log(`\n[${index + 1}] ID: ${record.id}`);
    console.log(`    类型: ${record.type}`);
    console.log(`    金额: ${record.amount}`);
    console.log(`    积分变动: ${record.creditsAmount}`);
    console.log(`    描述: ${record.description}`);
    console.log(`    创建时间: ${record.createdAt}`);
    if (record.referenceType && record.referenceId) {
      console.log(`    关联: ${record.referenceType} - ${record.referenceId}`);
    }
  });

  // 4. 统计
  console.log('\n\n' + '='.repeat(100));
  console.log('\n统计：');
  console.log('='.repeat(100));
  console.log(`  支付记录总数: ${paymentRecords.length}`);
  console.log(`  成功的支付记录: ${succeededPayments.length}`);
  console.log(`  余额变动记录: ${transactionRecords.length}`);
  console.log(`  缺少 balance_transactions 的支付记录: ${succeededPayments.filter(p => {
    const relatedTx = transactionRecords.find(tx =>
      tx.referenceType === 'payment' && tx.referenceId === p.id
    );
    return !relatedTx;
  }).length}`);

  process.exit(0);
}

checkPaymentAndBalance().catch((error) => {
  console.error('查询失败:', error);
  process.exit(1);
});
