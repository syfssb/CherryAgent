import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: 'hnd1.clusters.zeabur.com',
  port: 25801,
  user: 'root',
  password: '6yZj8QDgHGA0w23X57EavOVs9tr14uRq',
  database: 'zeabur'
});

async function createModel() {
  const client = await pool.connect();

  try {
    console.log('开始创建 Claude Sonnet 4.6 模型...');

    const result = await client.query(`
      INSERT INTO models (
        id,
        display_name,
        provider,
        input_price_per_mtok,
        output_price_per_mtok,
        cache_read_price_per_mtok,
        cache_write_price_per_mtok,
        input_credits_per_mtok,
        output_credits_per_mtok,
        cache_read_credits_per_mtok,
        cache_write_credits_per_mtok,
        long_context_input_price,
        long_context_output_price,
        long_context_threshold,
        max_tokens,
        max_context_length,
        is_enabled,
        sort_order,
        description,
        features,
        use_cases
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21::jsonb
      )
      RETURNING id, display_name
    `, [
      'claude-sonnet-4-6',
      'Claude Sonnet 4.6',
      'anthropic',
      2073,   // $3 × 6.909 × 100 = 2072.7 ≈ 2073 分/MTok
      10364,  // $15 × 6.909 × 100 = 10363.5 ≈ 10364 分/MTok
      207,    // $0.30 × 6.909 × 100 = 207.27 ≈ 207 分/MTok
      2591,   // $3.75 × 6.909 × 100 = 2590.875 ≈ 2591 分/MTok
      20.73,  // 积分价格
      103.64,
      2.07,
      25.91,
      4145,   // $6 × 6.909 × 100 = 4145.4 ≈ 4145 分/MTok (> 200K tokens)
      15545,  // $22.50 × 6.909 × 100 = 15545.25 ≈ 15545 分/MTok
      200000, // 200K tokens 阈值
      8192,   // 最大输出 tokens
      200000, // 最大上下文长度
      true,
      0,
      'Claude Sonnet 4.6 是 Anthropic 最新推出的中等规模模型，在智能、成本和速度之间实现了最佳平衡。它适合大多数日常任务，提供出色的性能和经济性。支持 200K+ tokens 上下文窗口，并提供提示词缓存功能以降低成本。',
      JSON.stringify([
        "智能、成本和速度的最佳平衡",
        "支持 200K+ tokens 上下文",
        "支持提示词缓存（Prompt Caching）",
        "适合生产环境部署",
        "高性价比",
        "快速响应速度"
      ]),
      JSON.stringify([
        "日常对话和问答",
        "代码生成和调试",
        "文档撰写和编辑",
        "数据分析和处理",
        "内容创作",
        "API 集成开发"
      ])
    ]);

    console.log('✅ 模型创建成功！');
    console.log('模型 ID:', result.rows[0].id);
    console.log('显示名称:', result.rows[0].display_name);
    console.log('\n价格信息（基于官方定价 + 汇率 1 USD = 6.909 CNY）：');
    console.log('- Input ≤ 200K: 2073 分/MTok (20.73 积分/MTok)');
    console.log('- Output ≤ 200K: 10364 分/MTok (103.64 积分/MTok)');
    console.log('- Cache Read: 207 分/MTok (2.07 积分/MTok)');
    console.log('- Cache Write: 2591 分/MTok (25.91 积分/MTok)');
    console.log('- Long Context Input (> 200K): 4145 分/MTok (41.45 积分/MTok)');
    console.log('- Long Context Output (> 200K): 15545 分/MTok (155.45 积分/MTok)');

  } catch (error) {
    if (error.code === '23505') {
      console.error('❌ 错误：模型 ID "claude-sonnet-4-6" 已存在');
    } else {
      console.error('❌ 创建模型失败:', error.message);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

createModel().catch(console.error);
