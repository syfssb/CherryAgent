import { db } from '../src/db';
import { payments, users } from '../src/db/schema';
import { desc, eq } from 'drizzle-orm';

async function checkAllPayments() {
  console.log('查询所有支付记录...\n');

  // 查询所有支付记录
  const allPayments = await db
    .select()
    .from(payments)
    .orderBy(desc(payments.createdAt))
    .limit(50);

  console.log(`数据库中所有支付记录（共 ${allPayments.length} 条）：`);
  console.log('='.repeat(100));

  if (allPayments.length === 0) {
    console.log('\n❌ 数据库中没有任何支付记录！');
  } else {
    // 按用户分组统计
    const userPayments = new Map<string, any[]>();

    for (const payment of allPayments) {
      if (!userPayments.has(payment.userId)) {
        userPayments.set(payment.userId, []);
      }
      userPayments.get(payment.userId)!.push(payment);
    }

    console.log(`\n共有 ${userPayments.size} 个用户有支付记录\n`);

    // 查询每个用户的信息
    for (const [userId, payments] of userPayments) {
      const userList = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = userList[0];
      console.log(`\n用户: ${user?.email || '未知'} (ID: ${userId})`);
      console.log(`  积分: ${user?.credits || 0}`);
      console.log(`  支付记录数: ${payments.length}`);

      const succeededPayments = payments.filter(p => p.status === 'succeeded');
      console.log(`  成功支付: ${succeededPayments.length} 条`);

      if (succeededPayments.length > 0) {
        console.log(`  成功支付详情:`);
        succeededPayments.forEach((p, i) => {
          console.log(`    [${i + 1}] ${p.paymentMethod} - ¥${p.amount} - ${p.status} - ${p.createdAt}`);
        });
      }
    }

    // 统计支付状态
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
  }

  process.exit(0);
}

checkAllPayments().catch((error) => {
  console.error('查询失败:', error);
  process.exit(1);
});
