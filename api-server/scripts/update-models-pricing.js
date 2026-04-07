import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: 'hnd1.clusters.zeabur.com',
  port: 25801,
  user: 'root',
  password: '6yZj8QDgHGA0w23X57EavOVs9tr14uRq',
  database: 'zeabur'
});

async function updateModels() {
  const client = await pool.connect();

  try {
    console.log('开始更新模型价格和创建新模型...\n');

    // ==========================================
    // 1. 更新 Sonnet 4.6 价格和介绍（乘以 2）
    // ==========================================
    console.log('1. 更新 Claude Sonnet 4.6 价格和介绍（恢复到官方原价）...');

    await client.query(`
      UPDATE models
      SET
        input_price_per_mtok = input_price_per_mtok * 2,
        output_price_per_mtok = output_price_per_mtok * 2,
        cache_read_price_per_mtok = cache_read_price_per_mtok * 2,
        cache_write_price_per_mtok = cache_write_price_per_mtok * 2,
        input_credits_per_mtok = input_credits_per_mtok * 2,
        output_credits_per_mtok = output_credits_per_mtok * 2,
        cache_read_credits_per_mtok = cache_read_credits_per_mtok * 2,
        cache_write_credits_per_mtok = cache_write_credits_per_mtok * 2,
        long_context_input_price = long_context_input_price * 2,
        long_context_output_price = long_context_output_price * 2,
        description = 'Claude Sonnet 4.6 是 Anthropic 最新推出的中等规模模型，在智能、成本和速度之间实现了最佳平衡。它适合大多数日常任务，提供出色的性能和经济性。支持 200K+ tokens 上下文窗口，并提供提示词缓存功能以降低成本。',
        features = $1::jsonb,
        use_cases = $2::jsonb,
        updated_at = NOW()
      WHERE id = 'claude-sonnet-4-6'
    `, [
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

    console.log('✅ Sonnet 4.6 价格和介绍已更新\n');

    // ==========================================
    // 2. 更新 Opus 4.6 价格和介绍
    // ==========================================
    console.log('2. 更新 Claude Opus 4.6 价格和介绍...');

    await client.query(`
      UPDATE models
      SET
        input_price_per_mtok = input_price_per_mtok * 2,
        output_price_per_mtok = output_price_per_mtok * 2,
        cache_read_price_per_mtok = cache_read_price_per_mtok * 2,
        cache_write_price_per_mtok = cache_write_price_per_mtok * 2,
        input_credits_per_mtok = input_credits_per_mtok * 2,
        output_credits_per_mtok = output_credits_per_mtok * 2,
        cache_read_credits_per_mtok = cache_read_credits_per_mtok * 2,
        cache_write_credits_per_mtok = cache_write_credits_per_mtok * 2,
        long_context_input_price = long_context_input_price * 2,
        long_context_output_price = long_context_output_price * 2,
        description = 'Claude Opus 4.6 是 Anthropic 最强大的旗舰模型，专为构建 AI 代理和复杂编程任务而设计。它提供最高水平的智能和推理能力，能够处理最具挑战性的任务。支持 200K+ tokens 上下文窗口，是需要最高性能和准确性的应用的理想选择。',
        features = $1::jsonb,
        use_cases = $2::jsonb,
        updated_at = NOW()
      WHERE id = 'claude-opus-4-6'
    `, [
      JSON.stringify([
        "最高水平的智能和推理能力",
        "专为 AI 代理和复杂编程设计",
        "支持 200K+ tokens 上下文",
        "支持提示词缓存（Prompt Caching）",
        "最佳的代码生成和理解能力",
        "复杂问题解决专家"
      ]),
      JSON.stringify([
        "AI 代理开发",
        "复杂代码生成和重构",
        "高级数据分析和建模",
        "复杂问题解决和推理",
        "技术文档撰写",
        "架构设计和系统规划"
      ])
    ]);

    console.log('✅ Opus 4.6 价格和介绍已更新\n');

    // ==========================================
    // 3. 更新 Haiku 4.5 价格和介绍
    // ==========================================
    console.log('3. 更新 Claude Haiku 4.5 价格和介绍...');

    await client.query(`
      UPDATE models
      SET
        input_price_per_mtok = input_price_per_mtok * 2,
        output_price_per_mtok = output_price_per_mtok * 2,
        cache_read_price_per_mtok = cache_read_price_per_mtok * 2,
        cache_write_price_per_mtok = cache_write_price_per_mtok * 2,
        input_credits_per_mtok = input_credits_per_mtok * 2,
        output_credits_per_mtok = output_credits_per_mtok * 2,
        cache_read_credits_per_mtok = cache_read_credits_per_mtok * 2,
        cache_write_credits_per_mtok = cache_write_credits_per_mtok * 2,
        description = 'Claude Haiku 4.5 是 Anthropic 最快速、最经济的模型，专为高吞吐量和低延迟场景设计。它在保持出色性能的同时，提供了极具竞争力的价格。非常适合需要快速响应和大规模部署的应用场景。',
        features = $1::jsonb,
        use_cases = $2::jsonb,
        updated_at = NOW()
      WHERE id = 'claude-haiku-4-5-20251001'
    `, [
      JSON.stringify([
        "最快的响应速度",
        "最具成本效益",
        "支持 200K tokens 上下文",
        "支持提示词缓存（Prompt Caching）",
        "适合高吞吐量场景",
        "低延迟保证"
      ]),
      JSON.stringify([
        "实时聊天和客服",
        "内容审核和分类",
        "简单的代码补全",
        "文本摘要和提取",
        "快速问答系统",
        "大规模批处理任务"
      ])
    ]);

    console.log('✅ Haiku 4.5 价格和介绍已更新\n');

    console.log('==========================================');
    console.log('✅ 所有操作完成！');
    console.log('==========================================');
    console.log('\n价格总览（官方原价，1 积分 = 1 人民币）：');
    console.log('\n【Opus 4.6】- 最强大的旗舰模型');
    console.log('  Input:  34.55 积分/MTok');
    console.log('  Output: 172.73 积分/MTok');
    console.log('\n【Sonnet 4.6】- 智能、成本和速度的最佳平衡');
    console.log('  Input:  41.46 积分/MTok');
    console.log('  Output: 207.28 积分/MTok');
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

updateModels().catch(console.error);
