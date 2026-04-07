import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: 'hnd1.clusters.zeabur.com',
  port: 25801,
  user: 'root',
  password: '6yZj8QDgHGA0w23X57EavOVs9tr14uRq',
  database: 'zeabur'
});

async function fixModelsPricing() {
  const client = await pool.connect();

  try {
    console.log('开始修正模型价格为官方定价...\n');

    // ==========================================
    // 1. 修正 Sonnet 4.6 价格
    // ==========================================
    console.log('1. 修正 Claude Sonnet 4.6 价格...');

    await client.query(`
      UPDATE models
      SET
        input_price_per_mtok = 2073,
        output_price_per_mtok = 10364,
        cache_read_price_per_mtok = 207,
        cache_write_price_per_mtok = 2591,
        input_credits_per_mtok = 20.73,
        output_credits_per_mtok = 103.64,
        cache_read_credits_per_mtok = 2.07,
        cache_write_credits_per_mtok = 25.91,
        long_context_input_price = 4145,
        long_context_output_price = 15545,
        updated_at = NOW()
      WHERE id = 'claude-sonnet-4-6'
    `);

    console.log('✅ Sonnet 4.6 价格已修正\n');

    // ==========================================
    // 2. 修正 Opus 4.6 价格
    // ==========================================
    console.log('2. 修正 Claude Opus 4.6 价格...');

    await client.query(`
      UPDATE models
      SET
        input_price_per_mtok = 3455,
        output_price_per_mtok = 17273,
        cache_read_price_per_mtok = 345,
        cache_write_price_per_mtok = 4318,
        input_credits_per_mtok = 34.55,
        output_credits_per_mtok = 172.73,
        cache_read_credits_per_mtok = 3.45,
        cache_write_credits_per_mtok = 43.18,
        long_context_input_price = 6909,
        long_context_output_price = 25909,
        updated_at = NOW()
      WHERE id = 'claude-opus-4-6'
    `);

    console.log('✅ Opus 4.6 价格已修正\n');

    // ==========================================
    // 3. 修正 Haiku 4.5 价格
    // ==========================================
    console.log('3. 修正 Claude Haiku 4.5 价格...');

    await client.query(`
      UPDATE models
      SET
        input_price_per_mtok = 691,
        output_price_per_mtok = 3455,
        cache_read_price_per_mtok = 69,
        cache_write_price_per_mtok = 864,
        input_credits_per_mtok = 6.91,
        output_credits_per_mtok = 34.55,
        cache_read_credits_per_mtok = 0.69,
        cache_write_credits_per_mtok = 8.64,
        updated_at = NOW()
      WHERE id = 'claude-haiku-4-5-20251001'
    `);

    console.log('✅ Haiku 4.5 价格已修正\n');

    console.log('==========================================');
    console.log('✅ 所有价格已修正为官方定价！');
    console.log('==========================================');
    console.log('\n价格总览（官方定价，1 积分 = 1 人民币）：');
    console.log('\n【Opus 4.6】- 最强大的旗舰模型');
    console.log('  Input:  34.55 积分/MTok');
    console.log('  Output: 172.73 积分/MTok');
    console.log('\n【Sonnet 4.6】- 智能、成本和速度的最佳平衡');
    console.log('  Input:  20.73 积分/MTok');
    console.log('  Output: 103.64 积分/MTok');
    console.log('\n【Haiku 4.5】- 最快速、最经济');
    console.log('  Input:  6.91 积分/MTok');
    console.log('  Output: 34.55 积分/MTok');

  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixModelsPricing().catch(console.error);
