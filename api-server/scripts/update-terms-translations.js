/**
 * 更新服务条款的多语言翻译
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

// 英文内容
const contentEn = `Terms of Service

Welcome to our service! Please read the following Terms of Service carefully before using this service.

1. Service Usage
   - Users must comply with local laws and regulations
   - Prohibited for illegal purposes
   - Maintain account security

2. Compliance
   - Comply with relevant laws and regulations
   - Must not violate public order and morals
   - Bear legal responsibility

3. Sensitive Content
   - Prohibited to publish illegal content
   - Prohibited to infringe on others' rights
   - Platform reserves the right to remove violating content

4. Privacy Protection
   - Protect user privacy
   - Reasonable use of data
   - Comply with privacy policy

5. AI-Generated Content
   - AI-generated content is for reference only
   - Accuracy is not guaranteed
   - Users must exercise their own judgment

6. Information Sources
   - Content comes from multiple channels
   - Completeness is not guaranteed
   - Information is updated in a timely manner

7. Force Majeure
   - Force majeure exemption
   - Best efforts to restore service
   - Timely notification to users`;

// 中文内容
const contentZh = `服务条款

欢迎使用我们的服务！在使用本服务之前，请仔细阅读以下服务条款。

1. 服务使用
   - 用户需遵守当地法律法规
   - 禁止用于非法用途
   - 保持账户安全

2. 合规性
   - 遵守相关法律法规
   - 不得违反公序良俗
   - 承担法律责任

3. 敏感内容
   - 禁止发布违法内容
   - 禁止侵犯他人权益
   - 平台有权删除违规内容

4. 隐私保护
   - 保护用户隐私
   - 合理使用数据
   - 遵守隐私政策

5. AI生成内容
   - AI生成内容仅供参考
   - 不保证准确性
   - 用户需自行判断

6. 信息来源
   - 内容来自多个渠道
   - 不保证完整性
   - 及时更新信息

7. 不可抗力
   - 不可抗力免责
   - 尽力恢复服务
   - 及时通知用户`;

// 繁体中文内容
const contentZhTW = `服務條款

歡迎使用我們的服務！在使用本服務之前，請仔細閱讀以下服務條款。

1. 服務使用
   - 用戶需遵守當地法律法規
   - 禁止用於非法用途
   - 保持帳戶安全

2. 合規性
   - 遵守相關法律法規
   - 不得違反公序良俗
   - 承擔法律責任

3. 敏感內容
   - 禁止發布違法內容
   - 禁止侵犯他人權益
   - 平台有權刪除違規內容

4. 隱私保護
   - 保護用戶隱私
   - 合理使用數據
   - 遵守隱私政策

5. AI生成內容
   - AI生成內容僅供參考
   - 不保證準確性
   - 用戶需自行判斷

6. 信息來源
   - 內容來自多個渠道
   - 不保證完整性
   - 及時更新信息

7. 不可抗力
   - 不可抗力免責
   - 盡力恢復服務
   - 及時通知用戶`;

// 日文内容
const contentJa = `利用規約

当サービスへようこそ！本サービスをご利用になる前に、以下の利用規約をよくお読みください。

1. サービスの利用
   - ユーザーは現地の法律および規制を遵守する必要があります
   - 違法な目的での使用は禁止されています
   - アカウントのセキュリティを維持してください

2. コンプライアンス
   - 関連する法律および規制を遵守してください
   - 公序良俗に違反してはなりません
   - 法的責任を負います

3. センシティブなコンテンツ
   - 違法なコンテンツの公開は禁止されています
   - 他者の権利を侵害することは禁止されています
   - プラットフォームは違反コンテンツを削除する権利を有します

4. プライバシー保護
   - ユーザーのプライバシーを保護します
   - データの合理的な使用
   - プライバシーポリシーを遵守します

5. AI生成コンテンツ
   - AI生成コンテンツは参考用です
   - 正確性は保証されません
   - ユーザーは自己判断が必要です

6. 情報源
   - コンテンツは複数のチャネルから提供されます
   - 完全性は保証されません
   - 情報は適時更新されます

7. 不可抗力
   - 不可抗力による免責
   - サービスの復旧に最善を尽くします
   - ユーザーへの適時通知`;

// i18n 对象
const i18n = {
  zh: { content: contentZh },
  'zh-TW': { content: contentZhTW },
  ja: { content: contentJa }
};

async function updateTermsTranslations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('连接数据库...');

    // 更新服务条款
    const result = await pool.query(
      `UPDATE legal_contents
       SET content = $1, i18n = $2
       WHERE type = 'terms_of_service'
       RETURNING *`,
      [contentEn, JSON.stringify(i18n)]
    );

    if (result.rows.length > 0) {
      console.log('✅ 服务条款翻译更新成功！');
      console.log('更新的记录:', {
        id: result.rows[0].id,
        type: result.rows[0].type,
        version: result.rows[0].version,
        updated_at: result.rows[0].updated_at,
      });

      // 验证 i18n 字段
      const i18nData = result.rows[0].i18n;
      console.log('\n验证 i18n 字段:');
      console.log('- zh (中文):', i18nData.zh?.content ? '✅ 已设置' : '❌ 未设置');
      console.log('- zh-TW (繁体中文):', i18nData['zh-TW']?.content ? '✅ 已设置' : '❌ 未设置');
      console.log('- ja (日文):', i18nData.ja?.content ? '✅ 已设置' : '❌ 未设置');
    } else {
      console.log('❌ 未找到 terms_of_service 记录');
    }
  } catch (error) {
    console.error('❌ 更新失败:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('\n数据库连接已关闭');
  }
}

// 执行更新
updateTermsTranslations()
  .then(() => {
    console.log('\n✅ 脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 脚本执行失败:', error);
    process.exit(1);
  });
