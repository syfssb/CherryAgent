/**
 * 更新隐私政策的多语言内容
 *
 * 将中文隐私政策翻译成 en, zh-TW, ja 三种语言并更新数据库
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

// 创建数据库连接池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 英文翻译
const contentEn = `Privacy Policy

We value your privacy. This policy explains how we collect, use, and protect your personal information.

1. Information Collection
   - Account information
   - Usage data
   - Device information

2. Information Disclosure
   - Legal requirements
   - Service provision
   - User consent

3. Information Security
   - Encrypted storage
   - Access control
   - Regular audits

4. Privacy Statement
   - Protect privacy rights
   - Reasonable use
   - Timely updates`;

// 中文原文
const contentZh = `隐私政策

我们重视您的隐私，本政策说明我们如何收集、使用和保护您的个人信息。

1. 信息收集
   - 账户信息
   - 使用数据
   - 设备信息

2. 信息披露
   - 法律要求
   - 服务提供
   - 用户同意

3. 信息安全
   - 加密存储
   - 访问控制
   - 定期审计

4. 隐私声明
   - 保护隐私权
   - 合理使用
   - 及时更新`;

// 繁体中文翻译
const contentZhTW = `隱私政策

我們重視您的隱私，本政策說明我們如何收集、使用和保護您的個人資訊。

1. 資訊收集
   - 帳戶資訊
   - 使用數據
   - 設備資訊

2. 資訊披露
   - 法律要求
   - 服務提供
   - 用戶同意

3. 資訊安全
   - 加密存儲
   - 訪問控制
   - 定期審計

4. 隱私聲明
   - 保護隱私權
   - 合理使用
   - 及時更新`;

// 日文翻译
const contentJa = `プライバシーポリシー

私たちはあなたのプライバシーを重視しています。本ポリシーは、個人情報の収集、使用、保護方法について説明します。

1. 情報収集
   - アカウント情報
   - 使用データ
   - デバイス情報

2. 情報開示
   - 法的要件
   - サービス提供
   - ユーザーの同意

3. 情報セキュリティ
   - 暗号化ストレージ
   - アクセス制御
   - 定期監査

4. プライバシー声明
   - プライバシー権の保護
   - 合理的な使用
   - タイムリーな更新`;

// i18n 数据结构
const i18n = {
  zh: {
    content: contentZh
  },
  'zh-TW': {
    content: contentZhTW
  },
  ja: {
    content: contentJa
  }
};

async function updatePrivacyPolicy() {
  const client = await pool.connect();

  try {
    console.log('开始更新隐私政策...');

    // 查询当前数据
    const selectResult = await client.query(
      'SELECT * FROM legal_contents WHERE type = $1',
      ['privacy_policy']
    );

    if (selectResult.rows.length === 0) {
      console.error('错误：未找到 privacy_policy 记录');
      return;
    }

    console.log('当前版本:', selectResult.rows[0].version);

    // 更新数据
    const updateResult = await client.query(
      `UPDATE legal_contents
       SET content = $1, i18n = $2
       WHERE type = $3
       RETURNING *`,
      [contentEn, JSON.stringify(i18n), 'privacy_policy']
    );

    console.log('✅ 更新成功！');
    console.log('新版本:', updateResult.rows[0].version);
    console.log('更新时间:', updateResult.rows[0].updated_at);
    console.log('\n多语言内容已更新：');
    console.log('- en (英文): content 字段');
    console.log('- zh (简体中文): i18n.zh.content');
    console.log('- zh-TW (繁体中文): i18n["zh-TW"].content');
    console.log('- ja (日文): i18n.ja.content');

  } catch (error) {
    console.error('更新失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// 执行更新
updatePrivacyPolicy().catch(console.error);
