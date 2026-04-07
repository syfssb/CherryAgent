/**
 * 邀请系统诊断脚本
 * 用于诊断为什么邀请统计为 0 的问题
 *
 * 使用方法：
 * cd api-server
 * npx tsx scripts/diagnose-referral.ts <邀请码>
 *
 * 例如：
 * npx tsx scripts/diagnose-referral.ts XDWTC4
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

interface ReferralConfig {
  is_enabled: boolean;
  max_levels: number;
  commission_rate: number;
  level2_rate: number;
}

interface ReferralCode {
  id: string;
  code: string;
  user_id: string;
  usage_count: number;
  max_usage: number | null;
  is_active: boolean;
  created_at: Date;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface ReferralRelation {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code_id: string;
  level: number;
  created_at: Date;
}

async function diagnose(code: string) {
  console.log('='.repeat(80));
  console.log('邀请系统诊断报告');
  console.log('='.repeat(80));
  console.log(`邀请码: ${code}`);
  console.log(`时间: ${new Date().toISOString()}`);
  console.log('='.repeat(80));
  console.log();

  try {
    // 1. 检查分销功能是否启用
    console.log('1. 检查分销功能配置');
    console.log('-'.repeat(80));
    const configResult = await pool.query<ReferralConfig>(
      'SELECT is_enabled, max_levels, commission_rate, level2_rate FROM referral_config LIMIT 1'
    );

    if (configResult.rows.length === 0) {
      console.log('❌ 错误: referral_config 表中没有配置记录');
      console.log('   解决方案: 运行数据库迁移或手动插入配置记录');
      return;
    }

    const config = configResult.rows[0];
    console.log(`   is_enabled: ${config.is_enabled ? '✅ 已启用' : '❌ 未启用'}`);
    console.log(`   max_levels: ${config.max_levels}`);
    console.log(`   commission_rate: ${config.commission_rate}`);
    console.log(`   level2_rate: ${config.level2_rate}`);

    if (!config.is_enabled) {
      console.log();
      console.log('❌ 问题: 分销功能未启用');
      console.log('   解决方案: 执行以下 SQL 启用分销功能:');
      console.log('   UPDATE referral_config SET is_enabled = true;');
      return;
    }
    console.log();

    // 2. 检查邀请码是否存在
    console.log('2. 检查邀请码状态');
    console.log('-'.repeat(80));
    const normalizedCode = code.toUpperCase();
    const codeResult = await pool.query<ReferralCode>(
      'SELECT id, code, user_id, usage_count, max_usage, is_active, created_at FROM referral_codes WHERE code = $1',
      [normalizedCode]
    );

    if (codeResult.rows.length === 0) {
      console.log(`❌ 错误: 邀请码 ${normalizedCode} 不存在`);
      console.log('   可能原因:');
      console.log('   1. 邀请码输入错误');
      console.log('   2. 邀请码未生成');
      console.log('   3. 数据库中没有该记录');
      return;
    }

    const referralCode = codeResult.rows[0];
    console.log(`   邀请码 ID: ${referralCode.id}`);
    console.log(`   邀请码: ${referralCode.code}`);
    console.log(`   所属用户 ID: ${referralCode.user_id}`);
    console.log(`   使用次数: ${referralCode.usage_count}`);
    console.log(`   最大使用次数: ${referralCode.max_usage ?? '无限制'}`);
    console.log(`   是否激活: ${referralCode.is_active ? '✅ 是' : '❌ 否'}`);
    console.log(`   创建时间: ${referralCode.created_at}`);

    if (!referralCode.is_active) {
      console.log();
      console.log('❌ 问题: 邀请码未激活');
      console.log('   解决方案: 执行以下 SQL 激活邀请码:');
      console.log(`   UPDATE referral_codes SET is_active = true WHERE id = '${referralCode.id}';`);
      return;
    }

    if (referralCode.max_usage !== null && referralCode.usage_count >= referralCode.max_usage) {
      console.log();
      console.log('❌ 问题: 邀请码已达到使用上限');
      console.log('   解决方案: 增加使用上限或创建新的邀请码');
      return;
    }
    console.log();

    // 3. 检查邀请码所属用户信息
    console.log('3. 检查邀请码所属用户信息');
    console.log('-'.repeat(80));
    const userResult = await pool.query<User>(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [referralCode.user_id]
    );

    if (userResult.rows.length === 0) {
      console.log(`❌ 错误: 用户 ${referralCode.user_id} 不存在`);
      console.log('   这是一个严重的数据一致性问题');
      return;
    }

    const user = userResult.rows[0];
    console.log(`   用户 ID: ${user.id}`);
    console.log(`   邮箱: ${user.email}`);
    console.log(`   昵称: ${user.name}`);
    console.log(`   角色: ${user.role}`);
    console.log();

    // 4. 检查推荐关系
    console.log('4. 检查推荐关系');
    console.log('-'.repeat(80));
    const relationsResult = await pool.query<ReferralRelation>(
      `SELECT rr.id, rr.referrer_id, rr.referred_id, rr.referral_code_id, rr.level, rr.created_at,
              u.email as referred_email, u.name as referred_name
       FROM referral_relations rr
       LEFT JOIN users u ON u.id = rr.referred_id
       WHERE rr.referral_code_id = $1
       ORDER BY rr.created_at DESC`,
      [referralCode.id]
    );

    console.log(`   推荐关系数量: ${relationsResult.rows.length}`);

    if (relationsResult.rows.length === 0) {
      console.log();
      console.log('⚠️  警告: 没有找到任何推荐关系');
      console.log('   可能原因:');
      console.log('   1. 还没有用户使用这个邀请码注册');
      console.log('   2. 用户注册时邀请码绑定失败（前端没有错误处理）');
      console.log('   3. 用户注册时没有传递邀请码');
      console.log();
      console.log('   建议:');
      console.log('   1. 检查前端注册页面的浏览器控制台，看是否有错误日志');
      console.log('   2. 让用户重新使用邀请链接注册一个测试账号');
      console.log('   3. 检查 api-server 的日志，看是否有 /api/referrals/apply 的错误');
    } else {
      console.log();
      relationsResult.rows.forEach((relation, index) => {
        console.log(`   推荐关系 ${index + 1}:`);
        console.log(`     ID: ${relation.id}`);
        console.log(`     推荐人 ID: ${relation.referrer_id}`);
        console.log(`     被推荐人 ID: ${relation.referred_id}`);
        console.log(`     被推荐人邮箱: ${(relation as any).referred_email}`);
        console.log(`     被推荐人昵称: ${(relation as any).referred_name}`);
        console.log(`     推荐级别: ${relation.level}`);
        console.log(`     创建时间: ${relation.created_at}`);
        console.log();
      });
    }

    // 5. 检查推荐统计
    console.log('5. 检查推荐统计（桌面端显示的数据）');
    console.log('-'.repeat(80));
    const statsResult = await pool.query(
      `SELECT
         COUNT(DISTINCT rr.referred_id) as total_referrals,
         COUNT(DISTINCT CASE WHEN EXISTS (
           SELECT 1 FROM billing_records br
           WHERE br.user_id = rr.referred_id
           AND br.type = 'recharge'
         ) THEN rr.referred_id END) as paid_referrals
       FROM referral_relations rr
       WHERE rr.referrer_id = $1`,
      [referralCode.user_id]
    );

    const stats = statsResult.rows[0] as { total_referrals: string; paid_referrals: string };
    console.log(`   总推荐人数: ${stats.total_referrals}`);
    console.log(`   已付费推荐人数: ${stats.paid_referrals}`);
    console.log();

    // 6. 总结
    console.log('='.repeat(80));
    console.log('诊断总结');
    console.log('='.repeat(80));

    if (config.is_enabled && referralCode.is_active && relationsResult.rows.length > 0) {
      console.log('✅ 邀请系统配置正常，已有推荐关系');
      console.log('   如果桌面端显示推荐人数为 0，可能是前端缓存问题');
      console.log('   建议: 重启桌面应用或清除缓存');
    } else if (config.is_enabled && referralCode.is_active && relationsResult.rows.length === 0) {
      console.log('⚠️  邀请系统配置正常，但没有推荐关系');
      console.log('   建议:');
      console.log('   1. 检查前端注册页面的浏览器控制台日志');
      console.log('   2. 让用户使用邀请链接注册测试账号，观察是否有错误');
      console.log('   3. 检查 api-server 日志中的 /api/referrals/apply 请求');
    } else {
      console.log('❌ 邀请系统配置异常，请根据上述诊断结果修复');
    }
    console.log('='.repeat(80));

  } catch (error) {
    console.error('诊断过程中发生错误:', error);
  } finally {
    await pool.end();
  }
}

// 主函数
const code = process.argv[2];
if (!code) {
  console.error('错误: 请提供邀请码');
  console.error('使用方法: npx tsx scripts/diagnose-referral.ts <邀请码>');
  console.error('例如: npx tsx scripts/diagnose-referral.ts XDWTC4');
  process.exit(1);
}

diagnose(code).catch(console.error);
