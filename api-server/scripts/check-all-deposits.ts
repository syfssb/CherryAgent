import { db } from '../src/db';
import { balanceTransactions } from '../src/db/schema';
import { eq, desc } from 'drizzle-orm';

async function checkAllDeposits() {
  console.log('查询所有充值记录...\n');

  // 查询所有 deposit 类型的记录
  const deposits = await db
    .select()
    .from(balanceTransactions)
    .where(eq(balanceTransactions.type, 'deposit'))
    .orderBy(desc(balanceTransactions.createdAt))
    .limit(50);

  console.log(`数据库中所有充值记录（共 ${deposits.length} 条）：`);
  console.log('='.repeat(100));

  if (deposits.length === 0) {
    console.log('\n❌ 数据库中没有任何充值记录！');
    console.log('\n这说明：');
    console.log('1. 支付成功后，rechargeCredits() 没有被调用');
    console.log('2. 或者调用失败了，但支付记录标记为成功');
    console.log('3. 或者充值记录使用了其他类型（不是 deposit）');
  } else {
    deposits.forEach((record, index) => {
      console.log(`\n[${index + 1}] ID: ${record.id}`);
      console.log(`    用户 ID: ${record.userId}`);
      console.log(`    类型: ${record.type}`);
      console.log(`    金额: ${record.amount}`);
      console.log(`    积分变动: ${record.creditsAmount}`);
      console.log(`    变动前: ${record.creditsBefore} → 变动后: ${record.creditsAfter}`);
      console.log(`    描述: ${record.description}`);
      console.log(`    创建时间: ${record.createdAt}`);
      if (record.metadata) {
        console.log(`    元数据: ${JSON.stringify(record.metadata)}`);
      }
      if (record.referenceType && record.referenceId) {
        console.log(`    关联: ${record.referenceType} - ${record.referenceId}`);
      }
    });

    // 统计每个用户的充值次数
    const userStats = deposits.reduce((acc, record) => {
      acc[record.userId] = (acc[record.userId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n\n' + '='.repeat(100));
    console.log('\n用户充值统计：');
    console.log('='.repeat(100));
    Object.entries(userStats).forEach(([userId, count]) => {
      console.log(`  ${userId}: ${count} 次充值`);
    });
  }

  process.exit(0);
}

checkAllDeposits().catch((error) => {
  console.error('查询失败:', error);
  process.exit(1);
});
