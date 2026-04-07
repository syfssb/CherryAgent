# src/ui/render/

## Responsibility
Markdown 渲染核心库，负责将 Markdown 文本转换为样式化的 React 组件。支持 GitHub Flavored Markdown（GFM）全语法，包括表格、任务列表、删除线等；集成语法高亮、代码块增强、图片延迟加载。

## Design

### 核心架构
- **分离关注**：
  - `markdown-core.tsx`：核心 Markdown 渲染引擎（react-markdown + rehype + remark plugins）
  - `markdown.tsx`：Suspense 懒加载入口和 Shimmer 占位符
  - ChatView 内部使用 `MDContent`（简化 API）或 `MarkdownRenderer`（完整功能）
- **懒加载策略**：Markdown 库体积大（~1.5MB），仅首次渲染时动态加载，之后 module cache
- **不可变性**：Props 为 `readonly`，无内部状态修改
- **排版响应式**：通过 CSS 变量 `--chat-font-size, --chat-line-height, --chat-paragraph-spacing` 实现动态排版

### 关键抽象
1. **markdown.tsx 导出函数**：`MDContent({ text })` → 简化 API，自动处理 lazy + Suspense
2. **MarkdownRenderer 组件**：完整 Markdown 渲染器，接收 `content, enhancedCodeBlocks, className`
3. **MarkdownRendererCore**：react-markdown 核心，自定义 20+ 组件映射
4. **Shimmer 占位符**：加载中动画效果，3 根高度不同的灰色条纹

### 设计模式
- **懒加载边界**：MarkdownRenderer 作为 Suspense 的边界，最小化加载阻塞
- **组件自定义**：不依赖默认样式，100% 自定义 components 映射
- **延迟值优化**：`useDeferredValue` 缓冲高频输入，提高流式更新体验
- **条件插件加载**：`enhancedCodeBlocks=true` 时禁用 `rehypeHighlight`（由 CodeBlock 接管）

## Flow

### 消息渲染管道
```
ChatView partialMessage / assistant.message.content[text]
  ↓
MarkdownRenderer({ content, enhancedCodeBlocks: true })
  ↓
<Suspense fallback={<MarkdownShimmer />}>
  <MarkdownRendererCore lazy={lazy}> ← 动态 import
    ↓
    useDeferredValue(content) — 缓冲流式更新
    ↓
    ReactMarkdown
      .remarkPlugins: [remarkGfm] — 解析 GFM 语法
      .rehypePlugins: [rehypeHighlight?]
        └─ rehypeHighlight（可选）：仅当 enhancedCodeBlocks=false 时启用
      ↓
      .components: { 20+ 自定义映射 }
        ├─ h1-h6: fontSize 相对于 --chat-font-size 倍率缩放
        ├─ p: lineHeight, margin 使用 CSS 变量
        ├─ code: 判断 inline/block → CodeBlock (block) 或 <code> inline
        ├─ pre: enhancedCodeBlocks=true 时跳过，让 code 处理
        ├─ table: 完整 GFM 表格支持 + hover 效果
        ├─ img: lazy loading + border + caption
        ├─ a: target="_blank" + 蓝色链接样式
        └─ ...（10+ 其他元素）
```

### 流式更新处理
1. 开始接收文本 → `content: "开始思考..."`
2. 渲染初始内容 → deferredContent = "开始..."（旧内容）
3. 新文本不断到达 → `content` 频繁更新
4. `useDeferredValue` 缓冲 → deferredContent 延迟 ~5-10ms 更新
5. 减少闪烁和重排（flickering），提高流式体验
6. 完成后 → content === deferredContent，页面稳定

### 代码块处理
```
content: "```typescript:src/utils/helper.ts\ncode here\n```"
  ↓
rehype parse → <pre><code class="language-typescript:src/utils/helper.ts">
  ↓
extractLanguageInfo("language-typescript:src/utils/helper.ts")
  → { language: "typescript", filename: "src/utils/helper.ts" }
  ↓
enhancedCodeBlocks=true:
  → <CodeBlock code="..." language="typescript" filename="..." />

enhancedCodeBlocks=false:
  → rehypeHighlight 处理 → <code class="hljs language-typescript">
```

### 加载态（Shimmer）
```
<Suspense fallback={<MarkdownShimmer />}>
  <MarkdownRendererCore />  ← lazy import 正在加载
</Suspense>

Shimmer 显示 3 条占位符条纹，从左到右滑动动画
```

## Integration

### 依赖
- **React**: lazy, Suspense, useDeferredValue, useMemo
- **react-markdown**：Markdown 渲染核心
- **remark-gfm**：GFM 语法扩展（表格、任务列表、删除线等）
- **rehype-highlight**：语法高亮（仅当 enhancedCodeBlocks=false）
- **安全默认值**：不解析原始 HTML，避免消息内容直接注入 DOM
- **src/ui/lib/hljs-configured**：预配置的 highlight.js 实例
- **CodeBlock 组件**：增强型代码块渲染（enhancedCodeBlocks=true）
- **utils/cn**：CSS class 合并

### 被依赖
- **ChatView.tsx**：
  - `MDContent` 用于部分消息预览（partial preview）
  - `MarkdownRenderer` 用于完整助手消息渲染
- **MessageAdapter.tsx**：AssistantMessageCard 内部使用 MarkdownRenderer
- **其他需要 Markdown 渲染的地方**：知识库、文档预览等

### 关键接口

#### markdown.tsx 导出
```typescript
export default function MDContent({ text }: { text: string })
```
简化 API，自动处理 Suspense 和 lazy 加载。

#### MarkdownRenderer Props
```typescript
interface MarkdownRendererProps {
  content: string;                 // Markdown 文本
  enhancedCodeBlocks?: boolean;   // true: 用 CodeBlock（支持行号、复制、文件名）
                                   // false: 用 rehypeHighlight（仅语法高亮）
  className?: string;              // 额外 CSS class
}
```

#### MarkdownRendererCore 组件映射
| 元素 | 自定义行为 | CSS 变量 |
|------|---------|---------|
| h1-h6 | fontSize 倍率缩放 | `--chat-font-size` |
| p | lineHeight, margin 响应式 | `--chat-line-height`, `--chat-paragraph-spacing` |
| ul/ol | ml-5 + space-y-1.5 | — |
| strong | font-semibold text-ink-900 | — |
| a | text-accent underline target="_blank" | — |
| img | max-w-full lazy loading rounded border | — |
| blockquote | border-l-4 bg-secondary italic | — |
| table | GFM 完整支持，hover 高亮行 | — |
| pre | overflow-x-auto rounded bg-tertiary | — |
| code (inline) | bg-tertiary px-1.5 py-0.5 text-accent | — |
| code (block) | CodeBlock OR rehypeHighlight | — |

### 性能考量
1. **Shimmer 骨架屏**：延迟用户焦虑感，加载时不显示空白
2. **Suspense 边界**：将 Markdown 库加载隔离在单独边界，不阻塞聊天界面其他部分
3. **useDeferredValue**：缓冲流式输入，减少不必要的重排（layout thrashing）
4. **Lazy 模块**：首次 import 时加载（~200-300ms），之后 module cache，无性能问题
5. **Markdown 库版本**：react-markdown v9+，较小体积

### 样式系统
- **响应式排版**：通过 CSS 变量 `--chat-font-size, --chat-line-height, --chat-paragraph-spacing` 驱动，无需重新渲染
- **暗色模式**：Tailwind `dark:` 前缀自动切换（表格、代码块、边框）
- **语义颜色**：`text-ink-700, text-muted, text-accent, text-error` 等

### 文件清单
- **markdown.tsx**：Suspense 懒加载入口，导出 `MDContent` 函数
- **markdown-core.tsx**：ReactMarkdown 核心，20+ 自定义组件映射，支持 GFM 全语法
