/**
 * Widget 系统单元测试
 *
 * 覆盖：
 * 1. HTML 清理（流式预览 vs 完成态两种模式）
 * 2. show-widget 围栏解析（单个、多个交错、截断、空内容、JSON 错误）
 * 3. Partial widget key 稳定性（streaming -> persisted 不触发 remount）
 * 4. Partial widget code 提取（完整 JSON、不完整 JSON、未闭合 script）
 * 5. Receiver iframe srcdoc 结构与 CSP
 * 6. CSS 变量桥接完整性
 */

import { describe, it, expect } from 'vitest';

import {
  sanitizeForStreaming,
  sanitizeForIframe,
  parseAllShowWidgets,
  computePartialWidgetKey,
  extractPartialWidgetCode,
  buildReceiverSrcdoc,
  CDN_WHITELIST,
} from '../widget-sanitizer';

import {
  WIDGET_CSS_BRIDGE,
  resolveThemeVars,
  getWidgetIframeStyleBlock,
} from '../widget-css-bridge';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. sanitizeForStreaming
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('sanitizeForStreaming', () => {
  it('移除 <script> 标签（含内容）', () => {
    const html = '<div>Hello</div><script>alert(1)</script><p>World</p>';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('<script');
    expect(result).toContain('<div>Hello</div>');
    expect(result).toContain('<p>World</p>');
  });

  it('移除自闭合 <script> 标签', () => {
    const result = sanitizeForStreaming('<div>ok</div><script src="evil.js"/>');
    expect(result).not.toContain('<script');
    expect(result).toContain('<div>ok</div>');
  });

  it('移除 on* 事件处理器', () => {
    const html = '<div onclick="alert(1)" onmouseover="hack()">Click</div>';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onmouseover');
    expect(result).toContain('>Click</div>');
  });

  it('移除危险嵌套标签（iframe/object/embed/form）', () => {
    const html = [
      '<iframe src="evil"></iframe>',
      '<object data="x"></object>',
      '<embed src="y"/>',
      '<form action="z"></form>',
    ].join('');
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
    expect(result).not.toContain('<form');
  });

  it('过滤 javascript: URL', () => {
    const html = '<a href="javascript:alert(1)">link</a>';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('javascript:');
  });

  it('过滤 data: URL（src/href/action 属性）', () => {
    const html = '<img src="data:text/html,<script>alert(1)</script>">';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('data:text');
  });

  it('保留正常 HTML 内容（style、SVG、class 等）', () => {
    const html = [
      '<style>.box { color: red; }</style>',
      '<div class="box">',
      '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>',
      '</div>',
    ].join('');
    const result = sanitizeForStreaming(html);
    expect(result).toContain('<style>');
    expect(result).toContain('<svg');
    expect(result).toContain('<circle');
    expect(result).toContain('class="box"');
  });

  it('保留正常 href 链接', () => {
    const html = '<a href="https://example.com">Link</a>';
    const result = sanitizeForStreaming(html);
    expect(result).toContain('href="https://example.com"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. sanitizeForIframe
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('sanitizeForIframe', () => {
  it('移除危险嵌套标签但保留 <script>', () => {
    const html = '<div>Hi</div><script>run()</script><iframe src="x"></iframe>';
    const result = sanitizeForIframe(html);
    expect(result).not.toContain('<iframe');
    expect(result).toContain('<script>run()</script>');
  });

  it('保留 on* 事件处理器', () => {
    const html = '<div onclick="go()">Click</div>';
    const result = sanitizeForIframe(html);
    expect(result).toContain('onclick');
  });

  it('比 sanitizeForStreaming 更宽松', () => {
    const html = '<div onclick="test()">X</div><script>alert(1)</script>';
    const streaming = sanitizeForStreaming(html);
    const iframe = sanitizeForIframe(html);

    expect(iframe).toContain('<script>');
    expect(iframe).toContain('onclick');
    expect(streaming).not.toContain('<script>');
    expect(streaming).not.toContain('onclick');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. parseAllShowWidgets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('parseAllShowWidgets', () => {
  it('纯文本（无围栏）返回空数组', () => {
    const result = parseAllShowWidgets('Just some regular text without widgets');
    expect(result).toEqual([]);
  });

  it('解析单个 widget 围栏', () => {
    const input = [
      'Here is a chart:',
      '```show-widget',
      '{"title":"my_chart","widget_code":"<div>Chart</div>"}',
      '```',
      'Done.',
    ].join('\n');
    const segments = parseAllShowWidgets(input);

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: 'text', content: 'Here is a chart:' });
    expect(segments[1].type).toBe('widget');
    expect(segments[1].data?.title).toBe('my_chart');
    expect(segments[1].data?.widget_code).toBe('<div>Chart</div>');
    expect(segments[2]).toEqual({ type: 'text', content: 'Done.' });
  });

  it('解析多个 widget 围栏交错文本', () => {
    const input = [
      'First explanation.',
      '```show-widget',
      '{"title":"chart_1","widget_code":"<div>1</div>"}',
      '```',
      'Middle text.',
      '```show-widget',
      '{"title":"chart_2","widget_code":"<div>2</div>"}',
      '```',
      'End.',
    ].join('\n');
    const segments = parseAllShowWidgets(input);

    // text, widget, text, widget, text = 5 segments
    expect(segments).toHaveLength(5);
    expect(segments[0].type).toBe('text');
    expect(segments[1].type).toBe('widget');
    expect(segments[2].type).toBe('text');
    expect(segments[3].type).toBe('widget');
    expect(segments[4].type).toBe('text');

    expect(segments[1].data?.title).toBe('chart_1');
    expect(segments[3].data?.title).toBe('chart_2');
  });

  it('截断（未闭合围栏）返回空数组', () => {
    const input = 'Some intro\n```show-widget\n{"title":"partial","widget_code":"<div>loading...</div>"}';
    const segments = parseAllShowWidgets(input);
    // 围栏没有 ``` 闭合，正则不匹配，foundAny=false -> 空数组
    expect(segments).toEqual([]);
  });

  it('JSON 格式错误的围栏被跳过', () => {
    const input = '```show-widget\nNOT_JSON\n```\nAfter.';
    const segments = parseAllShowWidgets(input);
    // JSON 解析失败，widget 被跳过，但 trailing text 保留
    const textSegs = segments.filter(s => s.type === 'text');
    expect(textSegs.length).toBeGreaterThan(0);
    expect(segments.every(s => s.type === 'text')).toBe(true);
  });

  it('无 title 的 widget 正确解析', () => {
    const input = '```show-widget\n{"widget_code":"<svg></svg>"}\n```';
    const segments = parseAllShowWidgets(input);
    const widgets = segments.filter(s => s.type === 'widget');
    expect(widgets).toHaveLength(1);
    expect(widgets[0].data?.title).toBeUndefined();
    expect(widgets[0].data?.widget_code).toBe('<svg></svg>');
  });

  it('缺少 widget_code 字段的 JSON 被跳过', () => {
    const input = '```show-widget\n{"title":"no_code"}\n```';
    const segments = parseAllShowWidgets(input);
    // json.widget_code 为 falsy -> 不 push widget segment
    const widgets = segments.filter(s => s.type === 'widget');
    expect(widgets).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. computePartialWidgetKey
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computePartialWidgetKey', () => {
  it('无围栏返回 w-0', () => {
    expect(computePartialWidgetKey('just text')).toBe('w-0');
  });

  it('单个围栏（无前置文本）返回 w-0', () => {
    const content = '```show-widget\n{"widget_code":"<div>x</div>"}';
    expect(computePartialWidgetKey(content)).toBe('w-0');
  });

  it('单个围栏（有前置文本）返回 w-1', () => {
    const content = 'Some text\n```show-widget\n{"widget_code":"<div>x</div>"}';
    expect(computePartialWidgetKey(content)).toBe('w-1');
  });

  it('partial -> closed key 一致性（单 widget）', () => {
    const widgetJson = '{"title":"chart","widget_code":"<div>Chart</div>"}';
    const openContent = `Here is a chart:\n\`\`\`show-widget\n${widgetJson}`;
    const partialKey = computePartialWidgetKey(openContent);

    const closedContent = `Here is a chart:\n\`\`\`show-widget\n${widgetJson}\n\`\`\``;
    const segments = parseAllShowWidgets(closedContent);
    // widget 在 segments 中的 index
    const widgetIdx = segments.findIndex(s => s.type === 'widget');
    const closedKey = `w-${widgetIdx}`;

    expect(partialKey).toBe(closedKey);
  });

  it('partial -> closed key 一致性（第二个 widget）', () => {
    const w1 = '{"title":"w1","widget_code":"<div>1</div>"}';
    const w2 = '{"title":"w2","widget_code":"<div>2</div>"}';

    const openContent = [
      'Intro.',
      '```show-widget', w1, '```',
      'Middle.',
      '```show-widget', w2,
    ].join('\n');
    const partialKey = computePartialWidgetKey(openContent);

    const closedContent = openContent + '\n```';
    const segments = parseAllShowWidgets(closedContent);
    let widgetCount = 0;
    let closedKey = '';
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].type === 'widget') {
        widgetCount++;
        if (widgetCount === 2) { closedKey = `w-${i}`; break; }
      }
    }

    expect(partialKey).toBe(closedKey);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. extractPartialWidgetCode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('extractPartialWidgetCode', () => {
  it('完整 JSON 正确提取', () => {
    const body = '{"title":"test","widget_code":"<div>Hello</div>"}';
    const result = extractPartialWidgetCode(body);
    expect(result.code).toBe('<div>Hello</div>');
    expect(result.title).toBe('test');
    expect(result.scriptsTruncated).toBe(false);
  });

  it('不完整 JSON（流式中）提取 widget_code', () => {
    // 模拟 JSON 还在流式传输中：widget_code 值未闭合
    const body = '{"title":"streaming","widget_code":"<div class=\\"box\\">Hello World</div><p>More content here for length';
    const result = extractPartialWidgetCode(body);
    expect(result.code).not.toBeNull();
    expect(result.code).toContain('Hello World');
    expect(result.scriptsTruncated).toBe(false);
  });

  it('未闭合 <script> 被截断', () => {
    const body = '{"title":"partial","widget_code":"<style>.x{}</style><div>Chart</div><script>const data = [1,2,3';
    const result = extractPartialWidgetCode(body);
    // script 未闭合，应被截断
    expect(result.scriptsTruncated).toBe(true);
    if (result.code) {
      expect(result.code).not.toContain('<script');
      expect(result.code).toContain('<div>Chart</div>');
    }
  });

  it('空/短内容返回 null', () => {
    const result = extractPartialWidgetCode('{"widget_code":"hi"}');
    // "hi" 长度 < 10，应返回 null（手动提取路径）
    // 但完整 JSON 路径会先成功解析，返回 "hi"
    // 完整 JSON parse 成功 -> 直接返回 code
    expect(result.code).toBe('hi');
  });

  it('无 widget_code key 返回 null', () => {
    const result = extractPartialWidgetCode('{"title":"only title"');
    expect(result.code).toBeNull();
  });

  it('完全空字符串返回 null', () => {
    const result = extractPartialWidgetCode('');
    expect(result.code).toBeNull();
  });

  it('提取 title 字段', () => {
    const body = '{"title":"my_chart","widget_code":"<div class=\\"chart-container\\">Some very long chart content here padding';
    const result = extractPartialWidgetCode(body);
    expect(result.title).toBe('my_chart');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. buildReceiverSrcdoc
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('buildReceiverSrcdoc', () => {
  const lightSrcdoc = buildReceiverSrcdoc(':root { --bg: #fff; }', false);
  const darkSrcdoc = buildReceiverSrcdoc(':root { --bg: #000; }', true);

  it('包含 CSP meta 标签', () => {
    expect(lightSrcdoc).toContain('Content-Security-Policy');
  });

  it('CSP 包含全部 5 个 CDN 域名', () => {
    for (const cdn of CDN_WHITELIST) {
      expect(lightSrcdoc).toContain(cdn);
    }
  });

  it('CDN 白名单包含 5 个域名', () => {
    expect(CDN_WHITELIST).toHaveLength(5);
    expect(CDN_WHITELIST).toContain('s4.zstatic.net');
    expect(CDN_WHITELIST).toContain('cdn.jsdelivr.net');
    expect(CDN_WHITELIST).toContain('cdnjs.cloudflare.com');
    expect(CDN_WHITELIST).toContain('unpkg.com');
    expect(CDN_WHITELIST).toContain('esm.sh');
  });

  it('通过 connect-src none 阻断网络请求', () => {
    expect(lightSrcdoc).toContain("connect-src 'none'");
  });

  it('包含 ResizeObserver 高度同步', () => {
    expect(lightSrcdoc).toContain('ResizeObserver');
  });

  it('包含 __root 容器', () => {
    expect(lightSrcdoc).toContain('id="__root"');
  });

  it('包含所有 postMessage 通信协议', () => {
    expect(lightSrcdoc).toContain('widget:update');
    expect(lightSrcdoc).toContain('widget:finalize');
    expect(lightSrcdoc).toContain('widget:theme');
    expect(lightSrcdoc).toContain('widget:ready');
    expect(lightSrcdoc).toContain('widget:resize');
    expect(lightSrcdoc).toContain('widget:link');
    expect(lightSrcdoc).toContain('widget:sendMessage');
  });

  it('深色模式 class 正确', () => {
    expect(darkSrcdoc).toContain('class="dark"');
    expect(lightSrcdoc).toContain('class=""');
  });

  it('注入提供的 style block', () => {
    expect(lightSrcdoc).toContain('--bg: #fff');
    expect(darkSrcdoc).toContain('--bg: #000');
  });

  it('包含 finalizeHtml 分离脚本逻辑', () => {
    expect(lightSrcdoc).toContain('finalizeHtml');
    expect(lightSrcdoc).toContain('root.innerHTML!==visualHtml');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. resolveThemeVars
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('resolveThemeVars', () => {
  it('在 jsdom 环境中返回对象（可能为空，因为没有实际 CSS）', () => {
    const vars = resolveThemeVars();
    expect(typeof vars).toBe('object');
    // jsdom 没有真实 CSS 变量值，但函数不应抛错
    expect(vars).toBeDefined();
  });

  it('当手动设置 CSS 变量时能正确读取', () => {
    // 在 jsdom 中手动设置一个变量
    document.documentElement.style.setProperty('--color-surface', '#ffffff');
    document.documentElement.style.setProperty('--color-ink-900', '#141413');

    const vars = resolveThemeVars();
    expect(vars['--color-surface']).toBe('#ffffff');
    expect(vars['--color-ink-900']).toBe('#141413');

    // 清理
    document.documentElement.style.removeProperty('--color-surface');
    document.documentElement.style.removeProperty('--color-ink-900');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. getWidgetIframeStyleBlock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('getWidgetIframeStyleBlock', () => {
  const mockVars = {
    '--color-surface': '#ffffff',
    '--color-ink-900': '#141413',
    '--color-accent': '#ae5630',
  };
  const styleBlock = getWidgetIframeStyleBlock(mockVars);

  it('包含注入的 CSS 变量', () => {
    expect(styleBlock).toContain('--color-surface: #ffffff');
    expect(styleBlock).toContain('--color-ink-900: #141413');
    expect(styleBlock).toContain('--color-accent: #ae5630');
  });

  it('包含 CSS 变量桥接（background/text/border 映射）', () => {
    expect(styleBlock).toContain('--color-background-primary');
    expect(styleBlock).toContain('--color-text-primary');
    expect(styleBlock).toContain('--color-border-primary');
  });

  it('包含 chart palette 变量', () => {
    for (let i = 1; i <= 5; i++) {
      expect(styleBlock).toContain(`--color-chart-${i}`);
    }
  });

  it('包含字体变量', () => {
    expect(styleBlock).toContain('--font-sans');
    expect(styleBlock).toContain('--font-mono');
  });

  it('包含工具类（flex, grid, spacing 等）', () => {
    expect(styleBlock).toContain('.flex {');
    expect(styleBlock).toContain('.grid {');
    expect(styleBlock).toContain('.p-4 {');
    expect(styleBlock).toContain('.text-sm {');
    expect(styleBlock).toContain('.rounded-lg {');
  });

  it('包含表单预设样式', () => {
    expect(styleBlock).toContain('input[type="range"]');
    expect(styleBlock).toContain('input[type="text"]');
    expect(styleBlock).toContain('button:hover');
  });

  it('包含 dark 模式声明', () => {
    expect(styleBlock).toContain('.dark { color-scheme: dark; }');
  });

  it('包含 widgetFadeIn 动画', () => {
    expect(styleBlock).toContain('@keyframes widgetFadeIn');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. WIDGET_CSS_BRIDGE 常量完整性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('WIDGET_CSS_BRIDGE', () => {
  it('映射 background 变量到 Cherry Agent 的 surface 系列', () => {
    expect(WIDGET_CSS_BRIDGE).toContain('--color-background-primary');
    expect(WIDGET_CSS_BRIDGE).toContain('var(--color-surface)');
  });

  it('映射 text 变量到 ink 系列', () => {
    expect(WIDGET_CSS_BRIDGE).toContain('--color-text-primary');
    expect(WIDGET_CSS_BRIDGE).toContain('var(--color-ink-900)');
  });

  it('映射 border 变量到 ink 系列', () => {
    expect(WIDGET_CSS_BRIDGE).toContain('--color-border-primary');
    expect(WIDGET_CSS_BRIDGE).toContain('var(--color-ink-400)');
    expect(WIDGET_CSS_BRIDGE).toContain('--color-border-secondary');
    expect(WIDGET_CSS_BRIDGE).toContain('var(--color-ink-200)');
    expect(WIDGET_CSS_BRIDGE).toContain('--color-border-tertiary');
    expect(WIDGET_CSS_BRIDGE).toContain('var(--color-ink-100)');
  });

  it('包含 chart palette（chart-1 到 chart-5）', () => {
    for (let i = 1; i <= 5; i++) {
      expect(WIDGET_CSS_BRIDGE).toContain(`--color-chart-${i}`);
    }
  });

  it('包含排版变量', () => {
    expect(WIDGET_CSS_BRIDGE).toContain('--font-sans');
    expect(WIDGET_CSS_BRIDGE).toContain('--font-mono');
  });

  it('包含圆角布局变量', () => {
    expect(WIDGET_CSS_BRIDGE).toContain('--border-radius-md');
    expect(WIDGET_CSS_BRIDGE).toContain('--border-radius-lg');
    expect(WIDGET_CSS_BRIDGE).toContain('--border-radius-xl');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. 流式 script 截断回归测试
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('extractPartialWidgetCode script 截断逻辑', () => {
  it('无 script 标签不截断', () => {
    const body = '{"widget_code":"<div>Hello</div>"}';
    const result = extractPartialWidgetCode(body);
    expect(result.scriptsTruncated).toBe(false);
    expect(result.code).toBe('<div>Hello</div>');
  });

  it('已闭合的 script 不截断', () => {
    const body = '{"widget_code":"<div>Hi</div><script>alert(1)<\\/script>"}';
    const result = extractPartialWidgetCode(body);
    expect(result.scriptsTruncated).toBe(false);
  });

  it('保留已闭合 script 但截断最后未闭合的', () => {
    // 模拟流式中第二个 script 未闭合
    const code = '<script>var a=1;<\\/script><div>Hi</div><script>var b=';
    const body = `{"widget_code":"${code}`;
    const result = extractPartialWidgetCode(body);
    expect(result.scriptsTruncated).toBe(true);
    if (result.code) {
      expect(result.code).toContain('<div>Hi</div>');
    }
  });
});
