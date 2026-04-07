/**
 * 佣金诊断脚本
 * 用于诊断为什么邀请用户购买后没有生成佣金
 */

import 'dotenv/config';
import { pool } from '../src/db/index.js';

async function diagnoseCommission(email: string) {
  console.log('='.repeat(60));
  console.log('佣金诊断工具');
  console.log('='.repeat(60));
  console.log(`\n检查用户: ${email}\n`);

  try {
    // 1. 查询用户信息
    console.log('1️⃣  查询用户信息...');
    const userResult = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ 用户不存在');
      return;
    }

    const user = userResult.rows[0] as { id: string; email: string; name: string; created_at: Date };
    console.log(`✅ 用户ID: ${user.id}`);
    console.log(`   姓名: ${user.name || '未设置'}`);
    console.log(`   注册时间: ${user.created_at}`);

    // 2. 查询推荐关系
    console.log('\n2️⃣  查询推荐关系...');
    const relationResult = await pool.query(
      `SELECT
        rr.id,
        rr.referrer_id,
        rr.referred_id,
        rr.level,
        rr.created_at,
        u.email as referrer_email,
        u.name as referrer_name,
        rc.code as referral_code
      FROM referral_relations rr
      LEFT JOIN users u ON rr.referrer_id = u.id
      LEFT JOIN referral_codes rc ON rr.referral_code_id = rc.id
      WHERE rr.referred_id = $1`,
      [user.id]
    );

    if (relationResult.rows.length === 0) {
      console.log('❌ 没有找到推荐关系');
      return;
    }

    const relation = relationResult.rows[0] as {
      id: string;
      referrer_id: string;
      referred_id: string;
      level: number;
      created_at: Date;
      referrer_email: string;
      referrer_name: string;
      referral_code: string;
    };
    console.log(`✅ 推荐人: ${relation.referrer_email} (${relation.referrer_name || '未设置'})`);
    console.log(`   推荐人ID: ${relation.referrer_id}`);
    console.log(`   邀请码: ${relation.referral_code}`);
    console.log(`   层级: ${relation.level}`);
    console.log(`   建立时间: ${relation.created_at}`);

    // 3. 查询购买记录（payments 表）
    console.log('\n3️⃣  查询购买记录（payments）...');
    const paymentsResult = await pool.query(
      `SELECT
        id,
        amount,
        currency,
        status,
        payment_method,
        description,
        paid_at,
        created_at
      FROM payments
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [user.id]
    );

    if (paymentsResult.rows.length === 0) {
      console.log('❌ 没有找到支付记录');
    } else {
      console.log(`✅ 找到 ${paymentsResult.rows.length} 条支付记录:`);
      paymentsResult.rows.forEach((payment: any, index: number) => {
        console.log(`\n   [${index + 1}] 支付ID: ${payment.id}`);
        console.log(`       金额: ${payment.amount} ${payment.currency}`);
        console.log(`       状态: ${payment.status}`);
        console.log(`       支付方式: ${payment.payment_method}`);
        console.log(`       描述: ${payment.description || '无'}`);
        console.log(`       支付时间: ${payment.paid_at || '未支付'}`);
        console.log(`       创建时间: ${payment.created_at}`);
      });
    }

    // 4. 查询期卡记录
    console.log('\n4️⃣  查询期卡记录（user_period_cards）...');
    const periodCardsResult = await pool.query(
      `SELECT
        upc.id,
        upc.payment_id,
        upc.status,
        upc.daily_credits,
        upc.starts_at,
        upc.expires_at,
        upc.created_at,
        pcp.name as plan_name,
        pcp.price_cents,
        pcp.currency
      FROM user_period_cards upc
      LEFT JOIN period_card_plans pcp ON upc.plan_id = pcp.id
      WHERE upc.user_id = $1
      ORDER BY upc.created_at DESC`,
      [user.id]
    );

    if (periodCardsResult.rows.length === 0) {
      console.log('❌ 没有找到期卡记录');
    } else {
      console.log(`✅ 找到 ${periodCardsResult.rows.length} 条期卡记录:`);
      periodCardsResult.rows.forEach((card: any, index: number) => {
        console.log(`\n   [${index + 1}] 期卡ID: ${card.id}`);
        console.log(`       套餐: ${card.plan_name}`);
        console.log(`       价格: ${card.price_cents / 100} ${card.currency}`);
        console.log(`       状态: ${card.status}`);
        console.log(`       每日积分: ${card.daily_credits}`);
        console.log(`       关联支付ID: ${card.payment_id || '无'}`);
        console.log(`       开始时间: ${card.starts_at}`);
        console.log(`       过期时间: ${card.expires_at}`);
        console.log(`       创建时间: ${card.created_at}`);
      });
    }

    // 5. 查询佣金记录
    console.log('\n5️⃣  查询佣金记录（referral_commissions）...');
    const commissionsResult = await pool.query(
      `SELECT
        id,
        referrer_id,
        referred_id,
        order_id,
        order_amount,
        commission_rate,
        commission_amount,
        level,
        status,
        created_at,
        settled_at
      FROM referral_commissions
      WHERE referred_id = $1 OR referrer_id = $2
      ORDER BY created_at DESC`,
      [user.id, relation.referrer_id]
    );

    if (commissionsResult.rows.length === 0) {
      console.log('❌ 没有找到佣金记录');
      console.log('\n⚠️  问题分析：');
      console.log('   - 用户已注册并建立推荐关系');
      console.log('   - 用户有购买记录');
      console.log('   - 但没有生成佣金记录');
      console.log('\n💡 可能原因：');
      console.log('   1. 购买完成后没有触发佣金计算逻辑');
      console.log('   2. 佣金计算逻辑有bug');
      console.log('   3. 支付webhook处理中没有调用佣金计算');
    } else {
      console.log(`✅ 找到 ${commissionsResult.rows.length} 条佣金记录:`);
      commissionsResult.rows.forEach((commission: any, index: number) => {
        console.log(`\n   [${index + 1}] 佣金ID: ${commission.id}`);
        console.log(`       推荐人ID: ${commission.referrer_id}`);
        console.log(`       被推荐人ID: ${commission.referred_id}`);
        console.log(`       订单ID: ${commission.order_id || '无'}`);
        console.log(`       订单金额: ${commission.order_amount}`);
        console.log(`       佣金比例: ${commission.commission_rate}%`);
        console.log(`       佣金金额: ${commission.commission_amount}`);
        console.log(`       层级: ${commission.level}`);
        console.log(`       状态: ${commission.status}`);
        console.log(`       创建时间: ${commission.created_at}`);
        console.log(`       结算时间: ${commission.settled_at || '未结算'}`);
      });
    }

    // 6. 查询分销配置
    console.log('\n6️⃣  查询分销配置...');
    const configResult = await pool.query(
      'SELECT * FROM referral_config ORDER BY updated_at DESC LIMIT 1'
    );

    if (configResult.rows.length > 0) {
      const config = configResult.rows[0] as any;
      console.log(`✅ 分销配置:`);
      console.log(`   佣金比例: ${config.commission_rate}%`);
      console.log(`   佣金类型: ${config.commission_type}`);
      console.log(`   固定金额: ${config.fixed_amount}`);
      console.log(`   最小提现: ${config.min_withdrawal}`);
      console.log(`   最大层级: ${config.max_levels}`);
      console.log(`   二级比例: ${config.level2_rate}%`);
      console.log(`   是否启用: ${config.is_enabled ? '是' : '否'}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('诊断完成');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ 诊断过程中出错:', error);
  } finally {
    await pool.end();
  }
}

// 从命令行参数获取邮箱
const email = process.argv[2];

if (!email) {
  console.error('用法: npx tsx scripts/diagnose-commission.ts <email>');
  console.error('示例: npx tsx scripts/diagnose-commission.ts 1073634403@qq.com');
  process.exit(1);
}

diagnoseCommission(email);
