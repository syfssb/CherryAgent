import { db } from '../src/db';
import { balanceTransactions } from '../src/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

const userId = '882b1b36-bccc-4722-9bab-fdda2201ee4e';

async function checkTransactions() {
  console.log('查询用户充值记录...\n');

  // 查询所有交易记录
  const allRecords = await db
    .select()
    .from(balanceTransactions)
    .where(eq(balanceTransactions.userId, userId))
    .orderBy(desc(balanceTransactions.createdAt))
    .limit(20);

  console.log(`用户 ${userId} 的所有交易记录（共 ${allRecords.length} 条）：`);
  console.log('='.repeat(100));

  allRecords.forEach((record, index) => {
    console.log(`\n[${index + 1}] ID: ${record.id}`);
    console.log(`    类型: ${record.type}`);
    console.log(`    金额: ${record.amount}`);
    console.log(`    积分变动: ${record.creditsAmount}`);
    console.log(`    变动前: ${record.creditsBefore} → 变动后: ${record.creditsAfter}`);
    console.log(`    描述: ${record.description}`);
    console.log(`    创建时间: ${record.createdAt}`);
    if (record.metadata) {
      console.log(`    元数据: ${JSON.stringify(record.metadata)}`);
    }
  });

  // 查询过滤后的记录（排除 precharge）
  const filteredRecords = await db
    .select()
    .from(balanceTransactions)
    .where(
      and(
        eq(balanceTransactions.userId, userId),
        sql`${balanceTransactions.type} != 'precharge'`
      )
    )
    .orderBy(desc(balanceTransactions.createdAt))
    .limit(20);

  console.log('\n\n' + '='.repeat(100));
  console.log(`\n过滤后的交易记录（排除 precharge，共 ${filteredRecords.length} 条）：`);
  console.log('='.repeat(100));

  filteredRecords.forEach((record, index) => {
    console.log(`\n[${index + 1}] ID: ${record.id}`);
    console.log(`    类型: ${record.type}`);
    console.log(`    金额: ${record.amount}`);
    console.log(`    描述: ${record.description}`);
    console.log(`    创建时间: ${record.createdAt}`);
  });

  // 统计各类型记录数量
  const typeStats = allRecords.reduce((acc, record) => {
    acc[record.type] = (acc[record.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\n\n' + '='.repeat(100));
  console.log('\n交易类型统计：');
  console.log('='.repeat(100));
  Object.entries(typeStats).forEach(([type, count]) => {
    console.log(`  ${type}: ${count} 条`);
  });

  process.exit(0);
}

checkTransactions().catch((error) => {
  console.error('查询失败:', error);
  process.exit(1);
});
