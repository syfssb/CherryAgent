import { test, expect } from '@playwright/test';

// ─── Helper ───────────────────────────────────────────────
const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文', heroTitle: '你的 AI 协作，', featuresTitle: '为什么选择 Cherry Agent', faqTitle: '常见问题' },
  { code: 'en', label: 'English', heroTitle: 'Your AI collaboration,', featuresTitle: 'Why Cherry Agent', faqTitle: 'FAQ' },
  { code: 'zh-TW', label: '繁體中文', heroTitle: '你的 AI 協作，', featuresTitle: '為什麼選擇 Cherry Agent', faqTitle: '常見問題' },
  { code: 'ja', label: '日本語', heroTitle: 'AIコラボレーション、', featuresTitle: 'Cherry Agent を選ぶ理由', faqTitle: 'よくある質問' },
] as const;

// ─── 1. 页面加载 & 基础结构 ──────────────────────────────
test.describe('页面加载 & 基础结构', () => {
  test('页面加载正常，标题包含 Cherry Agent', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Cherry Agent/);
  });

  test('语义化 HTML 结构：header / main / footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('html lang 属性与当前语言一致', async ({ page }) => {
    await page.goto('/');
    const lang = await page.locator('html').getAttribute('lang');
    expect(LANGUAGES.map(l => l.code) as readonly string[]).toContain(lang);
  });
});

// ─── 2. Header / 导航 ───────────────────────────────────
test.describe('Header 导航', () => {
  test('品牌名称 Cherry Agent 可见', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header a:has-text("Cherry Agent")')).toBeVisible();
  });

  test('桌面端导航链接可见（features / steps / faq）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    for (const hash of ['#features', '#steps', '#faq']) {
      await expect(page.locator(`header a[href="${hash}"]`)).toBeVisible();
    }
  });

  test('下载按钮链接到 GitHub releases', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const downloadLink = page.locator('header a[href*="releases"]');
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute('target', '_blank');
  });

  test('GitHub 图标链接存在', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const ghLink = page.locator('header a[aria-label="GitHub"]');
    await expect(ghLink).toBeVisible();
    await expect(ghLink).toHaveAttribute('href', /github\.com/);
  });

  test('滚动后 Header 背景变化', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const header = page.locator('header');
    // 初始透明
    await expect(header).not.toHaveClass(/backdrop-blur/);
    // 滚动后
    await page.evaluate(() => window.scrollTo(0, 100));
    await page.waitForTimeout(400);
    await expect(header).toHaveClass(/backdrop-blur/);
  });
});

// ─── 3. Hero 区域 ────────────────────────────────────────
test.describe('Hero 区域', () => {
  test('标题和描述可见', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    // 标题应包含任一语言的 hero title
    const h1Text = await page.locator('h1').textContent();
    const matchesAny = LANGUAGES.some(l => h1Text?.includes(l.heroTitle));
    expect(matchesAny).toBe(true);
  });

  test('打字机效果：文字逐步出现', async ({ page }) => {
    await page.goto('/');
    const typewriter = page.locator('.font-mono.text-sm, .font-mono.md\\:text-base').first();
    await expect(typewriter).toBeVisible();

    // 等待一段时间让打字机开始
    await page.waitForTimeout(500);
    const text1 = await typewriter.locator('span').first().textContent();

    await page.waitForTimeout(1000);
    const text2 = await typewriter.locator('span').first().textContent();

    // 文字应该在变化（打字中）
    expect(text2!.length).toBeGreaterThanOrEqual(text1!.length);
  });

  test('光标闪烁元素存在', async ({ page }) => {
    await page.goto('/');
    const cursor = page.locator('.animate-blink');
    await expect(cursor).toBeVisible();
    await expect(cursor).toHaveText('|');
  });

  test('CTA 按钮：下载 + GitHub', async ({ page }) => {
    await page.goto('/');
    const downloadBtn = page.locator('section a[href*="releases"]').first();
    const githubBtn = page.locator('section a[href="https://github.com/CherryHQ/cherry-studio"]').first();
    await expect(downloadBtn).toBeVisible();
    await expect(githubBtn).toBeVisible();
    await expect(downloadBtn).toHaveAttribute('target', '_blank');
    await expect(githubBtn).toHaveAttribute('target', '_blank');
  });
});

// ─── 4. Marquee 跑马灯 ──────────────────────────────────
test.describe('Marquee 跑马灯', () => {
  test('模型名称可见', async ({ page }) => {
    await page.goto('/');
    for (const model of ['Claude', 'GPT-4', 'Gemini', 'DeepSeek']) {
      await expect(page.locator(`text=${model}`).first()).toBeVisible();
    }
  });

  test('跑马灯动画类存在', async ({ page }) => {
    await page.goto('/');
    const marquee = page.locator('.animate-marquee').first();
    await expect(marquee).toBeAttached();
    const marqueeReverse = page.locator('.animate-marquee-reverse').first();
    await expect(marqueeReverse).toBeAttached();
  });
});

// ─── 5. ProductShowcase 3D 视差 ─────────────────────────
test.describe('ProductShowcase', () => {
  test('标题和描述可见', async ({ page }) => {
    await page.goto('/');
    // 用窗口 chrome 中的 "Cherry Agent" 文本定位 showcase 区域
    const showcaseLabel = page.locator('.font-mono:has-text("Cherry Agent")').first();
    await showcaseLabel.scrollIntoViewIfNeeded();
    await expect(showcaseLabel).toBeVisible();
  });

  test('模拟窗口 chrome 存在（红黄绿圆点）', async ({ page }) => {
    await page.goto('/');
    const showcaseLabel = page.locator('.font-mono:has-text("Cherry Agent")').first();
    await showcaseLabel.scrollIntoViewIfNeeded();
    const dots = page.locator('.rounded-full.bg-red-500\\/60, .rounded-full.bg-yellow-500\\/60, .rounded-full.bg-green-500\\/60');
    expect(await dots.count()).toBeGreaterThanOrEqual(3);
  });
});

// ─── 6. Features 特性卡片 ────────────────────────────────
test.describe('Features 特性', () => {
  test('标题可见', async ({ page }) => {
    await page.goto('/');
    const title = page.locator('#features h2, section#features h2').first();
    await title.scrollIntoViewIfNeeded();
    await expect(title).toBeVisible();
  });

  test('4 个特性卡片渲染', async ({ page }) => {
    await page.goto('/');
    await page.locator('#features').scrollIntoViewIfNeeded();
    // 4 个卡片
    const cards = page.locator('#features .bg-carbon-850');
    expect(await cards.count()).toBe(4);
  });
});

// ─── 7. Steps 使用步骤 ──────────────────────────────────
test.describe('Steps 使用步骤', () => {
  test('标题可见', async ({ page }) => {
    await page.goto('/');
    const title = page.locator('#steps h2').first();
    await title.scrollIntoViewIfNeeded();
    await expect(title).toBeVisible();
  });

  test('3 个步骤渲染', async ({ page }) => {
    await page.goto('/');
    await page.locator('#steps').scrollIntoViewIfNeeded();
    const steps = page.locator('#steps .bg-carbon-850');
    expect(await steps.count()).toBe(3);
  });

  test('步骤编号 01/02/03 可见', async ({ page }) => {
    await page.goto('/');
    await page.locator('#steps').scrollIntoViewIfNeeded();
    for (const num of ['01', '02', '03']) {
      await expect(page.locator(`#steps >> text=${num}`)).toBeVisible();
    }
  });
});

// ─── 8. FAQ 手风琴 ──────────────────────────────────────
test.describe('FAQ 手风琴', () => {
  test('标题可见', async ({ page }) => {
    await page.goto('/');
    const title = page.locator('#faq h2').first();
    await title.scrollIntoViewIfNeeded();
    await expect(title).toBeVisible();
  });

  test('4 个问题按钮渲染', async ({ page }) => {
    await page.goto('/');
    await page.locator('#faq').scrollIntoViewIfNeeded();
    const buttons = page.locator('#faq button[aria-expanded]');
    expect(await buttons.count()).toBe(4);
  });

  test('点击展开/收起', async ({ page }) => {
    await page.goto('/');
    await page.locator('#faq').scrollIntoViewIfNeeded();

    const firstBtn = page.locator('#faq button[aria-expanded]').first();
    // 初始收起
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'false');

    // 点击展开
    await firstBtn.click();
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'true');

    // 展开的面板可见
    const panel = page.locator('#faq [role="region"]').first();
    await expect(panel).toBeVisible();

    // 再次点击收起
    await firstBtn.click();
    await expect(firstBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('ARIA 属性正确：aria-controls / aria-labelledby', async ({ page }) => {
    await page.goto('/');
    await page.locator('#faq').scrollIntoViewIfNeeded();

    const firstBtn = page.locator('#faq button[aria-expanded]').first();
    const controls = await firstBtn.getAttribute('aria-controls');
    expect(controls).toBeTruthy();

    // 展开后检查 panel
    await firstBtn.click();
    const panel = page.locator(`#${controls}`);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'region');
    const labelledBy = await panel.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
  });
});

// ─── 9. BottomCTA ───────────────────────────────────────
test.describe('BottomCTA', () => {
  test('底部行动号召区域可见', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 800));
    await page.waitForTimeout(300);

    const downloadBtn = page.locator('section a[href*="releases"]').last();
    await downloadBtn.scrollIntoViewIfNeeded();
    await expect(downloadBtn).toBeVisible();
  });
});

// ─── 10. Footer ─────────────────────────────────────────
test.describe('Footer', () => {
  test('Footer 可见', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await expect(page.locator('footer')).toBeVisible();
  });

  test('版权信息包含当前年份', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const year = new Date().getFullYear().toString();
    await expect(page.locator('footer')).toContainText(year);
    await expect(page.locator('footer')).toContainText('Cherry Agent');
  });

  test('Footer 链接：GitHub / Issues / Releases', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const ghLink = page.locator('footer a[href*="cherry-studio"]').first();
    await expect(ghLink).toBeVisible();

    const issuesLink = page.locator('footer a[href*="issues"]');
    await expect(issuesLink).toBeVisible();

    const releasesLink = page.locator('footer a[href*="releases"]').first();
    await expect(releasesLink).toBeVisible();
  });
});

// ─── 11. 语言切换 ───────────────────────────────────────
test.describe('语言切换', () => {
  test('LanguageSwitcher 下拉可见', async ({ page }) => {
    await page.goto('/');
    const switcher = page.locator('button[aria-label="Select language"]');
    await expect(switcher).toBeVisible();
  });

  test('点击打开下拉，显示 4 种语言', async ({ page }) => {
    await page.goto('/');
    const switcher = page.locator('button[aria-label="Select language"]');
    await switcher.click();

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible();

    const options = page.locator('[role="option"]');
    expect(await options.count()).toBe(4);

    for (const lang of LANGUAGES) {
      await expect(page.locator(`[role="option"]:has-text("${lang.label}")`)).toBeVisible();
    }
  });

  test('切换到英文', async ({ page }) => {
    await page.goto('/');
    const switcher = page.locator('button[aria-label="Select language"]');
    await switcher.click();
    await page.locator('[role="option"]:has-text("English")').click();

    // 验证 Hero 标题变为英文
    await expect(page.locator('h1')).toContainText('Your AI collaboration,');
    // html lang 更新
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('切换到繁体中文', async ({ page }) => {
    await page.goto('/');
    const switcher = page.locator('button[aria-label="Select language"]');
    await switcher.click();
    await page.locator('[role="option"]:has-text("繁體中文")').click();

    await expect(page.locator('h1')).toContainText('你的 AI 協作，');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  });

  test('切换到日语', async ({ page }) => {
    await page.goto('/');
    const switcher = page.locator('button[aria-label="Select language"]');
    await switcher.click();
    await page.locator('[role="option"]:has-text("日本語")').click();

    await expect(page.locator('h1')).toContainText('AIコラボレーション、');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  });

  test('localStorage 持久化', async ({ page }) => {
    await page.goto('/');
    // 切换到英文
    await page.locator('button[aria-label="Select language"]').click();
    await page.locator('[role="option"]:has-text("English")').click();

    // 检查 localStorage
    const stored = await page.evaluate(() => localStorage.getItem('i18nextLng'));
    expect(stored).toBe('en');

    // 刷新页面后仍为英文
    await page.reload();
    await expect(page.locator('h1')).toContainText('Your AI collaboration,');
  });

  test('Escape 关闭下拉', async ({ page, browserName }) => {
    // WebKit 对 Escape 键盘事件处理不同，跳过
    test.skip(browserName === 'webkit', 'WebKit Escape key handling differs');
    await page.goto('/');
    const switcher = page.locator('button[aria-label="Select language"]');
    await switcher.click();
    await expect(page.locator('[role="listbox"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[role="listbox"]')).not.toBeVisible();
  });

  test('点击外部关闭下拉', async ({ page }) => {
    await page.goto('/');
    const switcher = page.locator('button[aria-label="Select language"]');
    await switcher.click();
    await expect(page.locator('[role="listbox"]')).toBeVisible();

    // 点击页面其他区域（用 footer 避免 header 遮挡）
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('main').click({ position: { x: 10, y: 300 }, force: true });
    await expect(page.locator('[role="listbox"]')).not.toBeVisible();
  });

  test('键盘导航：ArrowDown / ArrowUp / Enter', async ({ page }) => {
    await page.goto('/');
    const switcher = page.locator('button[aria-label="Select language"]');
    await switcher.focus();

    // ArrowDown 打开
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[role="listbox"]')).toBeVisible();

    // ArrowDown 移动焦点
    await page.keyboard.press('ArrowDown');
    // Enter 选择
    await page.keyboard.press('Enter');

    // 下拉应关闭
    await expect(page.locator('[role="listbox"]')).not.toBeVisible();
  });

  test('所有语言翻译完整性：Features 标题', async ({ page }) => {
    for (const lang of LANGUAGES) {
      await page.goto('/');
      // 清除 localStorage 避免干扰
      await page.evaluate(() => localStorage.removeItem('i18nextLng'));
      await page.reload();

      const switcher = page.locator('button[aria-label="Select language"]');
      await switcher.click();
      await page.locator(`[role="option"]:has-text("${lang.label}")`).click();

      await page.locator('#features').scrollIntoViewIfNeeded();
      await expect(page.locator('#features h2')).toContainText(lang.featuresTitle);
    }
  });
});

// ─── 12. 响应式布局 ─────────────────────────────────────
test.describe('响应式布局', () => {
  test('桌面端 (1920x1080)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
    // 桌面端导航链接可见
    await expect(page.locator('header .hidden.md\\:flex')).toBeVisible();
  });

  test('平板端 (768x1024)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('footer')).toBeAttached();
  });

  test('手机端 (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
    // 手机端导航链接隐藏
    await expect(page.locator('header .hidden.md\\:flex')).not.toBeVisible();
  });

  test('手机端 CTA 按钮垂直排列', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const ctaContainer = page.locator('.flex.flex-col.sm\\:flex-row').first();
    await expect(ctaContainer).toBeVisible();
  });

  test('ProductShowcase 侧边栏在手机端隐藏', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    const showcaseLabel = page.locator('.font-mono:has-text("Cherry Agent")').first();
    await showcaseLabel.scrollIntoViewIfNeeded();

    const sidebar = page.locator('.hidden.md\\:block').first();
    await expect(sidebar).not.toBeVisible();
  });
});

// ─── 13. 可访问性 ───────────────────────────────────────
test.describe('可访问性', () => {
  test('键盘 Tab 导航到可交互元素', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    const tag1 = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON']).toContain(tag1);

    await page.keyboard.press('Tab');
    const tag2 = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON']).toContain(tag2);
  });

  test('所有外部链接有 rel="noopener noreferrer"', async ({ page }) => {
    await page.goto('/');
    const externalLinks = page.locator('a[target="_blank"]');
    const count = await externalLinks.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const rel = await externalLinks.nth(i).getAttribute('rel');
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    }
  });

  test('LanguageSwitcher ARIA 属性', async ({ page }) => {
    await page.goto('/');
    const switcher = page.locator('button[aria-label="Select language"]');
    await expect(switcher).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(switcher).toHaveAttribute('aria-expanded', 'false');

    await switcher.click();
    await expect(switcher).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[role="listbox"]')).toHaveAttribute('aria-label', 'Languages');
  });

  test('图片无缺失 alt 属性', async ({ page }) => {
    await page.goto('/');
    const imagesWithoutAlt = await page.locator('img:not([alt])').count();
    expect(imagesWithoutAlt).toBe(0);
  });
});

// ─── 14. 锚点导航 ──────────────────────────────────────
test.describe('锚点导航', () => {
  test('点击 Features 链接滚动到对应区域', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await page.locator('header a[href="#features"]').click();
    await page.waitForTimeout(1500);

    const featuresSection = page.locator('#features');
    await expect(featuresSection).toBeInViewport();
  });

  test('点击 Steps 链接滚动到对应区域', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await page.locator('header a[href="#steps"]').click();
    await page.waitForTimeout(1500);

    const stepsSection = page.locator('#steps');
    await expect(stepsSection).toBeInViewport();
  });

  test('点击 FAQ 链接滚动到对应区域', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await page.locator('header a[href="#faq"]').click();
    await page.waitForTimeout(1500);

    const faqSection = page.locator('#faq');
    await expect(faqSection).toBeInViewport();
  });
});

// ─── 15. 性能 ───────────────────────────────────────────
test.describe('性能', () => {
  test('页面在 3 秒内加载完成', async ({ page }) => {
    const start = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(3000);
  });

  test('smooth scroll 已启用', async ({ page }) => {
    await page.goto('/');
    const scrollBehavior = await page.evaluate(() =>
      getComputedStyle(document.documentElement).scrollBehavior
    );
    expect(scrollBehavior).toBe('smooth');
  });
});

// ─── 16. 滚动行为 ──────────────────────────────────────
test.describe('滚动行为', () => {
  test('滚动到底部后 Footer 可见', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await expect(page.locator('footer')).toBeVisible();
  });

  test('页面无水平溢出', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);
  });
});
