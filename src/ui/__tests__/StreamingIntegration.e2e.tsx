/**
 * 流式体验集成测试 (E2E)
 * 在实际运行环境中验证流式组件的完整功能
 *
 * 运行方式:
 * 1. 启动开发服务器: npm run dev
 * 2. 运行测试: npm run test:e2e
 */

import { test, expect, type Page } from '@playwright/test';

test.describe('流式对话界面集成测试', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到应用首页
    await page.goto('http://localhost:5173');

    // 等待应用加载完成
    await page.waitForSelector('[data-testid="app-root"]', { timeout: 10000 });
  });

  test.describe('1. 打字机流式效果验证', () => {
    test('应该正确显示流式文本', async ({ page }) => {
      // 发送消息触发流式响应
      await page.fill('[data-testid="prompt-input"]', '你好');
      await page.click('[data-testid="send-button"]');

      // 等待流式响应开始
      await page.waitForSelector('[data-testid="streaming-text"]', { timeout: 5000 });

      // 验证光标闪烁
      const cursor = page.locator('[data-testid="cursor"]');
      await expect(cursor).toBeVisible();

      // 等待一个闪烁周期
      await page.waitForTimeout(500);
      await expect(cursor).toBeHidden();

      // 验证文本逐渐增长
      const initialText = await page.locator('[data-testid="streaming-text"]').textContent();
      await page.waitForTimeout(200);
      const updatedText = await page.locator('[data-testid="streaming-text"]').textContent();

      expect(updatedText?.length).toBeGreaterThan(initialText?.length || 0);
    });

    test('应该支持立即显示全部文本', async ({ page }) => {
      // 发送消息触发流式响应
      await page.fill('[data-testid="prompt-input"]', '写一个长文本');
      await page.click('[data-testid="send-button"]');

      // 等待流式开始
      await page.waitForSelector('[data-testid="streaming-text"]');
      await page.waitForTimeout(100);

      // 点击"显示全部"按钮
      await page.click('[data-testid="show-all-button"]');

      // 验证流式状态结束
      await expect(page.locator('[data-testid="cursor"]')).toBeHidden();
      await expect(page.locator('[data-testid="is-streaming"]')).toHaveText('false');
    });
  });

  test.describe('2. 思考块交互验证', () => {
    test('应该正确展开和折叠思考内容', async ({ page }) => {
      // 触发带思考块的响应
      await page.fill('[data-testid="prompt-input"]', '复杂任务');
      await page.click('[data-testid="send-button"]');

      // 等待思考块出现
      const thinkingBlock = page.locator('[data-testid="thinking-block"]').first();
      await expect(thinkingBlock).toBeVisible();

      // 验证初始折叠状态
      const content = page.locator('[data-testid="thinking-content"]');
      const isExpanded = await content.isVisible();
      expect(isExpanded).toBe(false);

      // 点击展开
      await thinkingBlock.click();
      await expect(content).toBeVisible();

      // 再次点击折叠
      await thinkingBlock.click();
      await expect(content).toBeHidden();
    });

    test('应该显示思考时长', async ({ page }) => {
      await page.fill('[data-testid="prompt-input"]', '任务');
      await page.click('[data-testid="send-button"]');

      const thinkingBlock = page.locator('[data-testid="thinking-block"]').first();
      await expect(thinkingBlock).toBeVisible();

      // 验证时长显示格式
      const duration = thinkingBlock.locator('[data-testid="duration"]');
      await expect(duration).toHaveText(/\d+\.\d+s/);
    });

    test('思考中状态应该显示动画', async ({ page }) => {
      await page.fill('[data-testid="prompt-input"]', '任务');
      await page.click('[data-testid="send-button"]');

      // 在流式过程中
      const thinkingBlock = page.locator('[data-testid="thinking-block"]').first();
      await expect(thinkingBlock).toBeVisible();

      // 验证动画点存在
      const dots = thinkingBlock.locator('.animate-bounce');
      expect(await dots.count()).toBe(3);
    });
  });

  test.describe('3. 工具调用卡片状态变化', () => {
    test('应该正确显示工具调用状态变化', async ({ page }) => {
      await page.fill('[data-testid="prompt-input"]', '读取文件');
      await page.click('[data-testid="send-button"]');

      // 等待工具调用卡片
      const toolCard = page.locator('[data-testid="tool-call-card"]').first();
      await expect(toolCard).toBeVisible();

      // 1. pending 状态
      await expect(toolCard.locator('[data-testid="status"]')).toHaveText('等待中');

      // 2. running 状态 (应该有动画)
      await page.waitForSelector('[data-testid="status-dot-animated"]');
      await expect(toolCard.locator('[data-testid="status"]')).toHaveText('执行中');

      // 3. success 状态
      await expect(toolCard.locator('[data-testid="status"]')).toHaveText('成功', {
        timeout: 10000,
      });

      // 验证没有动画
      await expect(page.locator('[data-testid="status-dot-animated"]')).toBeHidden();
    });

    test('应该支持展开输入参数', async ({ page }) => {
      await page.fill('[data-testid="prompt-input"]', '运行命令 ls -la');
      await page.click('[data-testid="send-button"]');

      const toolCard = page.locator('[data-testid="tool-call-card"]').first();
      await expect(toolCard).toBeVisible();

      // 初始状态 - 参数折叠
      const inputDetails = toolCard.locator('[data-testid="input-details"]');
      await expect(inputDetails).toBeHidden();

      // 点击展开
      await toolCard.locator('[data-testid="expand-input"]').click();
      await expect(inputDetails).toBeVisible();
      await expect(inputDetails).toContainText('ls -la');
    });

    test('应该支持展开输出结果', async ({ page }) => {
      await page.fill('[data-testid="prompt-input"]', '读取文件');
      await page.click('[data-testid="send-button"]');

      const toolCard = page.locator('[data-testid="tool-call-card"]').first();

      // 等待工具执行完成
      await expect(toolCard.locator('[data-testid="status"]')).toHaveText('成功', {
        timeout: 10000,
      });

      // 展开输出
      await toolCard.locator('[data-testid="expand-output"]').click();

      const outputDetails = toolCard.locator('[data-testid="output-details"]');
      await expect(outputDetails).toBeVisible();
    });

    test('错误状态应该使用错误样式', async ({ page }) => {
      await page.fill('[data-testid="prompt-input"]', '执行无效命令');
      await page.click('[data-testid="send-button"]');

      const toolCard = page.locator('[data-testid="tool-call-card"]').first();

      // 等待错误状态
      await expect(toolCard.locator('[data-testid="status"]')).toHaveText('失败', {
        timeout: 10000,
      });

      // 验证错误样式
      const statusBadge = toolCard.locator('[data-testid="status-badge"]');
      await expect(statusBadge).toHaveClass(/bg-destructive/);
    });
  });

  test.describe('4. Markdown 渲染验证', () => {
    test('应该正确渲染各种 Markdown 元素', async ({ page }) => {
      const markdown = `
# 标题 1
## 标题 2

这是一段**粗体**和*斜体*文本。

- 列表项 1
- 列表项 2

\`\`\`javascript
const x = 1;
\`\`\`

[链接](https://example.com)
      `;

      await page.fill('[data-testid="prompt-input"]', markdown);
      await page.click('[data-testid="send-button"]');

      // 等待 Markdown 渲染
      const messageContent = page.locator('[data-testid="message-content"]').first();

      // 验证标题
      await expect(messageContent.locator('h1')).toHaveText('标题 1');
      await expect(messageContent.locator('h2')).toHaveText('标题 2');

      // 验证格式
      await expect(messageContent.locator('strong')).toHaveText('粗体');
      await expect(messageContent.locator('em')).toHaveText('斜体');

      // 验证列表
      const listItems = messageContent.locator('li');
      expect(await listItems.count()).toBe(2);

      // 验证代码块
      await expect(messageContent.locator('code')).toContainText('const x = 1');

      // 验证链接
      const link = messageContent.locator('a');
      await expect(link).toHaveAttribute('href', 'https://example.com');
      await expect(link).toHaveAttribute('target', '_blank');
    });

    test('应该正确渲染表格', async ({ page }) => {
      const tableMarkdown = `
| 名称 | 年龄 |
|------|------|
| Alice | 30 |
| Bob | 25 |
      `;

      await page.fill('[data-testid="prompt-input"]', tableMarkdown);
      await page.click('[data-testid="send-button"]');

      const messageContent = page.locator('[data-testid="message-content"]').first();

      // 验证表格存在
      await expect(messageContent.locator('table')).toBeVisible();

      // 验证表头
      const headers = messageContent.locator('th');
      expect(await headers.count()).toBe(2);

      // 验证表格内容
      const cells = messageContent.locator('td');
      expect(await cells.count()).toBe(4);
    });
  });

  test.describe('5. 代码块功能验证', () => {
    test('应该正确高亮代码', async ({ page }) => {
      const code = `
\`\`\`typescript
function hello(name: string): void {
  console.log(\`Hello, \${name}!\`);
}
\`\`\`
      `;

      await page.fill('[data-testid="prompt-input"]', code);
      await page.click('[data-testid="send-button"]');

      const codeBlock = page.locator('[data-testid="code-block"]').first();
      await expect(codeBlock).toBeVisible();

      // 验证语言标签
      await expect(codeBlock.locator('[data-testid="language-badge"]')).toHaveText('TypeScript');

      // 验证语法高亮应用
      const highlightedCode = codeBlock.locator('code');
      await expect(highlightedCode).toHaveClass(/language-typescript/);
    });

    test('应该显示行号', async ({ page }) => {
      const code = '```javascript\nline 1\nline 2\nline 3\n```';

      await page.fill('[data-testid="prompt-input"]', code);
      await page.click('[data-testid="send-button"]');

      const codeBlock = page.locator('[data-testid="code-block"]').first();

      // 验证行号列存在
      const lineNumbers = codeBlock.locator('[aria-hidden="true"] > div');
      expect(await lineNumbers.count()).toBe(3);

      // 验证行号内容
      await expect(lineNumbers.nth(0)).toHaveText('1');
      await expect(lineNumbers.nth(1)).toHaveText('2');
      await expect(lineNumbers.nth(2)).toHaveText('3');
    });

    test('应该支持复制代码', async ({ page }) => {
      const code = '```javascript\nconst test = "value";\n```';

      await page.fill('[data-testid="prompt-input"]', code);
      await page.click('[data-testid="send-button"]');

      const codeBlock = page.locator('[data-testid="code-block"]').first();

      // 点击复制按钮
      const copyButton = codeBlock.locator('[data-testid="copy-button"]');
      await copyButton.click();

      // 验证按钮文本变化
      await expect(copyButton).toContainText('已复制');

      // 验证剪贴板内容
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('const test = "value"');

      // 等待状态重置
      await page.waitForTimeout(2000);
      await expect(copyButton).toContainText('复制');
    });

    test('代码块应该支持滚动', async ({ page }) => {
      const longCode = '```plaintext\n' + Array(100).fill('long line').join('\n') + '\n```';

      await page.fill('[data-testid="prompt-input"]', longCode);
      await page.click('[data-testid="send-button"]');

      const codeBlock = page.locator('[data-testid="code-block"]').first();

      // 验证滚动容器存在
      const scrollContainer = codeBlock.locator('.overflow-auto');
      await expect(scrollContainer).toBeVisible();

      // 验证最大高度限制
      const maxHeight = await scrollContainer.evaluate(el =>
        window.getComputedStyle(el).maxHeight
      );
      expect(maxHeight).toBe('400px');
    });
  });

  test.describe('6. 完整流式对话场景', () => {
    test('应该正确处理完整的对话流', async ({ page }) => {
      // 1. 用户发送消息
      await page.fill('[data-testid="prompt-input"]', '创建一个 React 组件');
      await page.click('[data-testid="send-button"]');

      // 2. 等待思考块出现
      await expect(page.locator('[data-testid="thinking-block"]').first()).toBeVisible();

      // 3. 等待工具调用出现
      await expect(page.locator('[data-testid="tool-call-card"]').first()).toBeVisible();

      // 4. 验证工具执行状态变化
      const toolCard = page.locator('[data-testid="tool-call-card"]').first();
      await expect(toolCard.locator('[data-testid="status"]')).toHaveText('执行中');
      await expect(toolCard.locator('[data-testid="status"]')).toHaveText('成功', {
        timeout: 10000,
      });

      // 5. 等待 AI 回答流式输出
      const aiResponse = page.locator('[data-testid="streaming-text"]').last();
      await expect(aiResponse).toBeVisible();

      // 验证流式效果
      const initialLength = (await aiResponse.textContent())?.length || 0;
      await page.waitForTimeout(200);
      const updatedLength = (await aiResponse.textContent())?.length || 0;
      expect(updatedLength).toBeGreaterThan(initialLength);

      // 6. 等待对话完成
      await expect(page.locator('[data-testid="is-streaming"]')).toHaveText('false', {
        timeout: 15000,
      });

      // 7. 验证完整消息历史
      const messages = page.locator('[data-testid="message-card"]');
      expect(await messages.count()).toBeGreaterThan(0);
    });

    test('应该支持滚动到底部查看新消息', async ({ page }) => {
      // 发送多条消息填充对话区
      for (let i = 0; i < 5; i++) {
        await page.fill('[data-testid="prompt-input"]', `消息 ${i + 1}`);
        await page.click('[data-testid="send-button"]');
        await page.waitForTimeout(1000);
      }

      // 滚动到顶部
      await page.locator('[data-testid="chat-container"]').evaluate(el => {
        el.scrollTop = 0;
      });

      // 发送新消息
      await page.fill('[data-testid="prompt-input"]', '新消息');
      await page.click('[data-testid="send-button"]');

      // 验证"新消息"提示按钮出现
      await expect(page.locator('[data-testid="new-messages-button"]')).toBeVisible();

      // 点击滚动到底部
      await page.click('[data-testid="new-messages-button"]');

      // 验证滚动到底部
      const isAtBottom = await page.locator('[data-testid="chat-container"]').evaluate(el => {
        return el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
      });
      expect(isAtBottom).toBe(true);

      // 验证提示按钮消失
      await expect(page.locator('[data-testid="new-messages-button"]')).toBeHidden();
    });

    test('应该支持停止流式输出', async ({ page }) => {
      await page.fill('[data-testid="prompt-input"]', '写一个很长的回答');
      await page.click('[data-testid="send-button"]');

      // 等待流式开始
      await page.waitForSelector('[data-testid="streaming-text"]');
      await page.waitForTimeout(500);

      // 点击停止按钮
      await page.click('[data-testid="stop-button"]');

      // 验证流式停止
      await expect(page.locator('[data-testid="is-streaming"]')).toHaveText('false');
      await expect(page.locator('[data-testid="cursor"]')).toBeHidden();
    });
  });

  test.describe('7. 性能和响应性验证', () => {
    test('大量消息应该保持流畅', async ({ page }) => {
      const startTime = Date.now();

      // 快速发送多条消息
      for (let i = 0; i < 20; i++) {
        await page.fill('[data-testid="prompt-input"]', `测试消息 ${i}`);
        await page.click('[data-testid="send-button"]');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 验证性能 (20条消息应该在合理时间内完成)
      expect(duration).toBeLessThan(5000);

      // 验证UI仍然响应
      const messages = page.locator('[data-testid="message-card"]');
      expect(await messages.count()).toBeGreaterThan(0);
    });

    test('长文本流式应该保持帧率', async ({ page }) => {
      // 请求生成长文本
      await page.fill('[data-testid="prompt-input"]', '生成一篇长文章');
      await page.click('[data-testid="send-button"]');

      // 监控帧率
      const fps = await page.evaluate(() => {
        return new Promise<number>(resolve => {
          let lastTime = performance.now();
          let frames = 0;
          const duration = 1000; // 监控1秒

          function measureFrame() {
            frames++;
            const currentTime = performance.now();
            if (currentTime - lastTime >= duration) {
              resolve(frames);
            } else {
              requestAnimationFrame(measureFrame);
            }
          }

          requestAnimationFrame(measureFrame);
        });
      });

      // 验证帧率不低于30fps
      expect(fps).toBeGreaterThan(30);
    });
  });

  test.describe('8. 可访问性验证', () => {
    test('应该支持键盘导航', async ({ page }) => {
      // 使用 Tab 键导航
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // 验证焦点在输入框
      const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      expect(focusedElement).toBe('prompt-input');

      // 输入文本并按 Enter 发送
      await page.keyboard.type('测试消息');
      await page.keyboard.press('Enter');

      // 验证消息发送成功
      await expect(page.locator('[data-testid="message-card"]').last()).toContainText('测试消息');
    });

    test('应该提供正确的 ARIA 属性', async ({ page }) => {
      await page.fill('[data-testid="prompt-input"]', '测试');
      await page.click('[data-testid="send-button"]');

      // 验证思考块的 ARIA 属性
      const thinkingBlock = page.locator('[data-testid="thinking-block"]').first();
      await expect(thinkingBlock.locator('button')).toHaveAttribute('aria-expanded');

      // 验证工具调用卡片的 ARIA 属性
      const toolCard = page.locator('[data-testid="tool-call-card"]').first();
      await expect(toolCard).toHaveAttribute('role', 'region');
    });
  });
});
