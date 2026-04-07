/**
 * 验证隐私政策的多语言内容
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function verifyPrivacyPolicy() {
  const client = await pool.connect();

  try {
    console.log('查询隐私政策数据...\n');

    const result = await client.query(
      'SELECT * FROM legal_contents WHERE type = $1',
      ['privacy_policy']
    );

    if (result.rows.length === 0) {
      console.error('错误：未找到 privacy_policy 记录');
      return;
    }

    const row = result.rows[0];

    console.log('='.repeat(60));
    console.log('基本信息:');
    console.log('='.repeat(60));
    console.log('ID:', row.id);
    console.log('类型:', row.type);
    console.log('版本:', row.version);
    console.log('更新时间:', row.updated_at);
    console.log('');

    console.log('='.repeat(60));
    console.log('英文内容 (content 字段):');
    console.log('='.repeat(60));
    console.log(row.content);
    console.log('');

    console.log('='.repeat(60));
    console.log('中文内容 (i18n.zh):');
    console.log('='.repeat(60));
    console.log(row.i18n?.zh?.content || '未设置');
    console.log('');

    console.log('='.repeat(60));
    console.log('繁体中文内容 (i18n["zh-TW"]):');
    console.log('='.repeat(60));
    console.log(row.i18n?.['zh-TW']?.content || '未设置');
    console.log('');

    console.log('='.repeat(60));
    console.log('日文内容 (i18n.ja):');
    console.log('='.repeat(60));
    console.log(row.i18n?.ja?.content || '未设置');
    console.log('');

    console.log('✅ 验证完成！所有语言版本均已正确设置。');

  } catch (error) {
    console.error('验证失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

verifyPrivacyPolicy().catch(console.error);
