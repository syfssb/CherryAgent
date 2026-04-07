import { Client } from "pg";

const DB_URL =
  "postgresql://root:6yZj8QDgHGA0w23X57EavOVs9tr14uRq@hnd1.clusters.zeabur.com:25801/zeabur";

const ZH_CONTENT = `## 用自然语言，驱动你的电脑帮你干活

不用学命令行，不用写脚本。
告诉 Cherry Agent 你想做什么，它来想怎么做。

---

### 三步开始你的第一个任务

**1. 选一个工作目录**
点击左上角文件夹图标，选中你想处理的文件所在的文件夹。

**2. 描述你的需求**
用正常说话的方式写就行，比如：
> "帮我把下载文件夹里的图片按月份整理好"
> "把这 30 份 Excel 合并成一张，去掉重复行"
> "处理这些发票照片，给我一个汇总表"

**3. 等它做完，确认结果**
Cherry Agent 会一步一步告诉你它在做什么，遇到不确定的会问你。

---

### 这些事它都能帮你做

- 整理、重命名、清理重复文件
- 清洗 Excel 数据、合并 CSV、生成报表
- 批量处理发票、提取关键信息
- 抓取网页数据、整理成表格
- 处理会议录音、生成纪要和待办

---

### 两个常用快捷键

\`⌘ Enter\` 发送 · \`⌘ V\` 粘贴图片（Mac）
\`Ctrl Enter\` 发送 · \`Ctrl V\` 粘贴图片（Windows）

---

**不知道从哪开始？** 直接点主界面的任意任务卡片，它会帮你填好提示词。`;

const I18N = {
  zh: {
    title: "你的电脑，从今天起多一个会干活的助手",
    content: ZH_CONTENT,
  },
  "zh-TW": {
    title: "你的電腦，從今天起多一個會做事的助手",
    content: `## 用自然語言，驅動你的電腦幫你做事

不用學命令列，不用寫腳本。
告訴 Cherry Agent 你想做什麼，它來想怎麼做。

---

### 三步開始你的第一個任務

**1. 選一個工作目錄**
點擊左上角資料夾圖示，選取你想處理的檔案所在的資料夾。

**2. 描述你的需求**
用平常說話的方式寫就行，例如：
> "幫我把下載資料夾裡的圖片按月份整理好"
> "把這 30 份 Excel 合併成一張，去掉重複列"
> "處理這些發票照片，給我一個彙總表"

**3. 等它做完，確認結果**
Cherry Agent 會一步一步告訴你它在做什麼，遇到不確定的會問你。

---

### 這些事它都能幫你做

- 整理、重新命名、清理重複檔案
- 清洗 Excel 資料、合併 CSV、產生報表
- 批次處理發票、擷取關鍵資訊
- 爬取網頁資料、整理成表格
- 處理會議錄音、產生會議記錄和待辦事項

---

### 兩個常用快捷鍵

\`⌘ Enter\` 傳送 · \`⌘ V\` 貼上圖片（Mac）
\`Ctrl Enter\` 傳送 · \`Ctrl V\` 貼上圖片（Windows）

---

**不知道從哪開始？** 直接點主介面的任意任務卡片，它會幫你填好提示詞。`,
  },
  en: {
    title: "Meet the assistant that actually gets things done on your computer",
    content: `## Just tell it what you want — your computer does the rest

No command line. No scripting. No technical know-how required.
Describe what you need in plain English, and Cherry Agent figures out how to make it happen.

---

### Get started in three steps

**1. Pick a working folder**
Click the folder icon in the top-left corner and select the folder containing the files you want to work with.

**2. Describe what you need**
Write it the way you'd say it out loud, for example:
> "Sort the photos in my Downloads folder by month"
> "Merge these 30 Excel files into one and remove duplicate rows"
> "Go through these invoice photos and give me a summary spreadsheet"

**3. Review the results**
Cherry Agent walks you through each step as it works, and asks when it's unsure.

---

### What it can do for you

- Organize, rename, and deduplicate files
- Clean up Excel data, merge CSVs, generate reports
- Process invoices in bulk and extract key information
- Scrape web data and structure it into tables
- Transcribe meeting recordings and produce summaries and action items

---

### Two shortcuts worth knowing

\`⌘ Enter\` Send · \`⌘ V\` Paste image (Mac)
\`Ctrl Enter\` Send · \`Ctrl V\` Paste image (Windows)

---

**Not sure where to start?** Click any task card on the home screen — Cherry Agent will pre-fill a prompt for you.`,
  },
  ja: {
    title:
      "今日から、あなたのパソコンに「本当に動ける」アシスタントが加わります",
    content: `## 話しかけるだけで、パソコンが代わりに動く

コマンドラインもスクリプトも不要。
やりたいことを Cherry Agent に伝えれば、やり方はそちらが考えます。

---

### 最初のタスクを始める 3 ステップ

**1. 作業フォルダを選ぶ**
左上のフォルダアイコンをクリックして、処理したいファイルが入っているフォルダを選択します。

**2. やりたいことを伝える**
普段の言葉で書くだけで OK。たとえば：
> 「ダウンロードフォルダの画像を月ごとに整理して」
> 「この 30 個の Excel ファイルを 1 枚にまとめて、重複行を削除して」
> 「これらの請求書の写真を処理して、集計表を作って」

**3. 完了を待って、結果を確認する**
Cherry Agent は作業の各ステップを逐一報告し、判断が難しい場面ではあなたに確認を取ります。

---

### こんなことが頼めます

- ファイルの整理・リネーム・重複削除
- Excel データのクリーニング、CSV の統合、レポート生成
- 請求書の一括処理・重要情報の抽出
- ウェブデータの収集・表形式への整理
- 会議録音の処理・議事録やアクションアイテムの生成

---

### よく使うショートカット

\`⌘ Enter\` 送信 · \`⌘ V\` 画像を貼り付け（Mac）
\`Ctrl Enter\` 送信 · \`Ctrl V\` 画像を貼り付け（Windows）

---

**どこから始めればいいかわからない？** ホーム画面の任意のタスクカードをクリックすると、プロンプトが自動で入力されます。`,
  },
};

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // Step 1: 查询 announcements 表的所有列名
    console.log("=== Step 1: 查询 announcements 表列名 ===");
    const colResult = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'announcements' ORDER BY ordinal_position`
    );
    console.log("列名：");
    for (const row of colResult.rows) {
      console.log(`  ${row.column_name} (${row.data_type})`);
    }
    const columnNames = colResult.rows.map((r: { column_name: string }) => r.column_name);

    // Step 2: DELETE 所有旧公告
    console.log("\n=== Step 2: 清空旧公告 ===");
    const deleteResult = await client.query(`DELETE FROM announcements`);
    console.log(`已删除 ${deleteResult.rowCount} 条旧公告`);

    // Step 3: INSERT 新公告（动态构建，仅插入表中存在的列）
    console.log("\n=== Step 3: 插入新公告 ===");

    const fieldsToInsert: Record<string, unknown> = {
      title: "你的电脑，从今天起多一个会干活的助手",
      content: ZH_CONTENT,
      type: "info",
      is_published: true,
      is_pinned: true,
      sort_order: 0,
      i18n: JSON.stringify(I18N),
    };

    // 过滤出表中实际存在的列
    const insertFields = Object.keys(fieldsToInsert).filter((k) =>
      columnNames.includes(k)
    );
    const skippedFields = Object.keys(fieldsToInsert).filter(
      (k) => !columnNames.includes(k)
    );
    if (skippedFields.length > 0) {
      console.log(`注意：以下字段在表中不存在，已跳过：${skippedFields.join(", ")}`);
    }

    const values = insertFields.map((k) => fieldsToInsert[k]);
    const placeholders = insertFields.map((_, i) => `$${i + 1}`).join(", ");
    const columns = insertFields.join(", ");

    const insertSQL = `INSERT INTO announcements (${columns}) VALUES (${placeholders}) RETURNING id, title, is_published, is_pinned`;
    const insertResult = await client.query(insertSQL, values);

    const row = insertResult.rows[0];
    console.log("\n=== 插入结果 ===");
    console.log(`id:           ${row.id}`);
    console.log(`title:        ${row.title}`);
    console.log(`is_published: ${row.is_published}`);
    console.log(`is_pinned:    ${row.is_pinned}`);
    console.log("\n操作完成。");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("执行失败：", err);
  process.exit(1);
});
