-- ============================================================
-- 0019_i18n_support.sql - 多语言国际化支持
-- ============================================================
-- 为 preset_skills、announcements、app_versions 添加 i18n JSONB 字段
-- 填充 14 个预装 skill 的 zh/zh-TW/ja 翻译种子数据
-- ============================================================

-- ============================================================
-- 1. preset_skills 表：添加 i18n 列
-- ============================================================
-- i18n 结构: { "zh": { "name": "...", "description": "..." }, "zh-TW": {...}, "ja": {...} }
ALTER TABLE preset_skills
  ADD COLUMN IF NOT EXISTS i18n JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN preset_skills.i18n IS '多语言翻译 { "zh": { "name", "description" }, "zh-TW": {...}, "ja": {...} }';

-- GIN 索引用于 JSONB 查询
CREATE INDEX IF NOT EXISTS idx_preset_skills_i18n ON preset_skills USING GIN (i18n);

-- ============================================================
-- 2. announcements 表：添加 i18n 列
-- ============================================================
-- i18n 结构: { "zh": { "title": "...", "content": "..." }, "zh-TW": {...}, "ja": {...}, "en": {...} }
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS i18n JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN announcements.i18n IS '多语言翻译 { "zh": { "title", "content" }, "en": {...}, "zh-TW": {...}, "ja": {...} }';

CREATE INDEX IF NOT EXISTS idx_announcements_i18n ON announcements USING GIN (i18n);

-- ============================================================
-- 3. app_versions 表：添加 i18n 列
-- ============================================================
-- i18n 结构: { "zh": { "release_notes": "..." }, "zh-TW": {...}, "ja": {...}, "en": {...} }
ALTER TABLE app_versions
  ADD COLUMN IF NOT EXISTS i18n JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN app_versions.i18n IS '多语言翻译 { "zh": { "release_notes" }, "en": {...}, "zh-TW": {...}, "ja": {...} }';

CREATE INDEX IF NOT EXISTS idx_app_versions_i18n ON app_versions USING GIN (i18n);

-- ============================================================
-- 4. 填充 preset_skills 多语言种子数据
-- ============================================================
-- 基于桌面端 i18n 文件 (zh.json, zh-TW.json, ja.json) 中的
-- skills.presets.{slug} 翻译

-- 4.1 frontend-design
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', '前端设计',
    'description', '帮你设计和生成高质量的网页界面，包括布局、样式和交互效果'
  ),
  'zh-TW', jsonb_build_object(
    'name', '前端設計',
    'description', '幫你設計和生成高品質的網頁介面，包括版面、樣式和互動效果'
  ),
  'ja', jsonb_build_object(
    'name', 'フロントエンドデザイン',
    'description', '高品質なWebインターフェースをデザイン・生成します。レイアウト、スタイル、インタラクションに対応'
  )
) WHERE slug = 'frontend-design';

-- 4.2 humanizer-zh
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', '中文润色',
    'description', '把生硬的 AI 文字改写成自然流畅的中文，像真人写的一样'
  ),
  'zh-TW', jsonb_build_object(
    'name', '中文潤色',
    'description', '把生硬的 AI 文字改寫成自然流暢的中文，像真人寫的一樣'
  ),
  'ja', jsonb_build_object(
    'name', '中国語リライト',
    'description', 'AIが生成した中国語を、自然で人間らしい文章に書き換えます'
  )
) WHERE slug = 'humanizer-zh';

-- 4.3 canvas-design
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', '画布设计',
    'description', '帮你用代码画出精美的图形、图表和视觉作品'
  ),
  'zh-TW', jsonb_build_object(
    'name', '畫布設計',
    'description', '幫你用程式碼畫出精美的圖形、圖表和視覺作品'
  ),
  'ja', jsonb_build_object(
    'name', 'キャンバスデザイン',
    'description', 'コードで美しいグラフィック、チャート、ビジュアル作品を作成します'
  )
) WHERE slug = 'canvas-design';

-- 4.4 docx
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', 'Word 文档',
    'description', '帮你创建、编辑 Word 文档，支持排版、表格、图片等'
  ),
  'zh-TW', jsonb_build_object(
    'name', 'Word 文件',
    'description', '幫你建立、編輯 Word 文件，支援排版、表格、圖片等'
  ),
  'ja', jsonb_build_object(
    'name', 'Word文書',
    'description', 'Word文書の作成・編集をサポート。書式設定、表、画像に対応'
  )
) WHERE slug = 'docx';

-- 4.5 pdf
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', 'PDF 助手',
    'description', '帮你阅读、提取和处理 PDF 文件中的文字和数据'
  ),
  'zh-TW', jsonb_build_object(
    'name', 'PDF 助手',
    'description', '幫你閱讀、擷取和處理 PDF 檔案中的文字和資料'
  ),
  'ja', jsonb_build_object(
    'name', 'PDFヘルパー',
    'description', 'PDFファイルからテキストやデータを読み取り、抽出、処理します'
  )
) WHERE slug = 'pdf';

-- 4.6 pptx
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', 'PPT 演示',
    'description', '帮你制作精美的 PowerPoint 演示文稿，支持模板和动画'
  ),
  'zh-TW', jsonb_build_object(
    'name', 'PPT 簡報',
    'description', '幫你製作精美的 PowerPoint 簡報，支援範本和動畫'
  ),
  'ja', jsonb_build_object(
    'name', 'PPTプレゼン',
    'description', 'テンプレートやアニメーション付きのPowerPointプレゼンテーションを作成します'
  )
) WHERE slug = 'pptx';

-- 4.7 xlsx
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', 'Excel 表格',
    'description', '帮你分析和编辑 Excel 电子表格，支持公式、图表和数据处理'
  ),
  'zh-TW', jsonb_build_object(
    'name', 'Excel 表格',
    'description', '幫你分析和編輯 Excel 電子表格，支援公式、圖表和資料處理'
  ),
  'ja', jsonb_build_object(
    'name', 'Excelシート',
    'description', 'Excelスプレッドシートの分析・編集をサポート。数式、グラフ、データ処理に対応'
  )
) WHERE slug = 'xlsx';

-- 4.8 file-organizer
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', '文件整理',
    'description', '自动帮你整理文件夹，按类型、日期或名称归类文件'
  ),
  'zh-TW', jsonb_build_object(
    'name', '檔案整理',
    'description', '自動幫你整理資料夾，按類型、日期或名稱歸類檔案'
  ),
  'ja', jsonb_build_object(
    'name', 'ファイル整理',
    'description', 'ファイルを種類、日付、名前で自動的に整理・分類します'
  )
) WHERE slug = 'file-organizer';

-- 4.9 video-downloader
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', '视频下载',
    'description', '帮你从网上下载视频，支持多种视频网站'
  ),
  'zh-TW', jsonb_build_object(
    'name', '影片下載',
    'description', '幫你從網路上下載影片，支援多種影片網站'
  ),
  'ja', jsonb_build_object(
    'name', '動画ダウンロード',
    'description', '複数の動画サイトからオンライン動画をダウンロードします'
  )
) WHERE slug = 'video-downloader';

-- 4.10 artifacts-builder
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', '组件构建',
    'description', '帮你快速搭建可交互的网页组件和小应用'
  ),
  'zh-TW', jsonb_build_object(
    'name', '元件建構',
    'description', '幫你快速搭建可互動的網頁元件和小應用'
  ),
  'ja', jsonb_build_object(
    'name', 'コンポーネント構築',
    'description', 'インタラクティブなWebコンポーネントやミニアプリを素早く構築します'
  )
) WHERE slug = 'artifacts-builder';

-- 4.11 brand-guidelines
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', '品牌规范',
    'description', '根据你的品牌规范生成符合风格的内容和设计建议'
  ),
  'zh-TW', jsonb_build_object(
    'name', '品牌規範',
    'description', '根據你的品牌規範生成符合風格的內容和設計建議'
  ),
  'ja', jsonb_build_object(
    'name', 'ブランドガイドライン',
    'description', 'ブランドスタイルに合ったコンテンツやデザイン提案を生成します'
  )
) WHERE slug = 'brand-guidelines';

-- 4.12 competitive-ads-extractor
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', '竞品广告分析',
    'description', '帮你收集和分析竞争对手的广告素材和投放策略'
  ),
  'zh-TW', jsonb_build_object(
    'name', '競品廣告分析',
    'description', '幫你收集和分析競爭對手的廣告素材和投放策略'
  ),
  'ja', jsonb_build_object(
    'name', '競合広告分析',
    'description', '競合他社の広告クリエイティブや出稿戦略を収集・分析します'
  )
) WHERE slug = 'competitive-ads-extractor';

-- 4.13 agent-browser
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', '网页浏览器',
    'description', '自动化操控浏览器，帮你打开网页、填写表单、点击按钮、截图和抓取数据'
  ),
  'zh-TW', jsonb_build_object(
    'name', '網頁瀏覽器',
    'description', '自動化操控瀏覽器，幫你開啟網頁、填寫表單、點擊按鈕、截圖和擷取資料'
  ),
  'ja', jsonb_build_object(
    'name', 'Webブラウザ',
    'description', 'ブラウザを自動操作 - ページ閲覧、フォーム入力、ボタンクリック、スクリーンショット、データ抽出'
  )
) WHERE slug = 'agent-browser';

-- 4.14 skill-creator
UPDATE preset_skills SET i18n = jsonb_build_object(
  'zh', jsonb_build_object(
    'name', '技能创建器',
    'description', '引导你一步步创建自定义技能，扩展 AI 的能力'
  ),
  'zh-TW', jsonb_build_object(
    'name', '技能建立器',
    'description', '引導你一步步建立自訂技能，擴展 AI 的能力'
  ),
  'ja', jsonb_build_object(
    'name', 'スキル作成',
    'description', 'カスタムスキルの作成をステップバイステップでガイドし、AIの機能を拡張します'
  )
) WHERE slug = 'skill-creator';

-- ============================================================
-- 5. 辅助函数：获取本地化 preset_skill 字段
-- ============================================================
CREATE OR REPLACE FUNCTION get_localized_skill(
  p_skill preset_skills,
  p_locale VARCHAR DEFAULT 'en'
)
RETURNS TABLE (
  name VARCHAR,
  description TEXT
) AS $$
BEGIN
  -- 优先返回请求语言，回退到 en（即原始列）
  IF p_locale != 'en' AND p_skill.i18n ? p_locale THEN
    RETURN QUERY SELECT
      COALESCE((p_skill.i18n -> p_locale ->> 'name')::VARCHAR, p_skill.name),
      COALESCE(p_skill.i18n -> p_locale ->> 'description', p_skill.description);
  ELSE
    RETURN QUERY SELECT p_skill.name, p_skill.description;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 6. 辅助函数：获取本地化公告字段
-- ============================================================
CREATE OR REPLACE FUNCTION get_localized_announcement(
  p_announcement announcements,
  p_locale VARCHAR DEFAULT 'en'
)
RETURNS TABLE (
  title VARCHAR,
  content TEXT
) AS $$
BEGIN
  IF p_locale != 'en' AND p_announcement.i18n ? p_locale THEN
    RETURN QUERY SELECT
      COALESCE((p_announcement.i18n -> p_locale ->> 'title')::VARCHAR, p_announcement.title),
      COALESCE(p_announcement.i18n -> p_locale ->> 'content', p_announcement.content);
  ELSE
    RETURN QUERY SELECT p_announcement.title, p_announcement.content;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 完成
-- ============================================================
SELECT 'Migration 0019_i18n_support completed' AS status;
