# 文件 Hover 按钮 - 调研报告

## 最佳实践

### UI/UX 设计
- **位置**：右侧对齐，避免遮挡文件名
- **显示时机**：hover 时淡入，延迟 100-200ms 避免误触
- **按钮样式**：图标按钮 + 半透明背景 + hover 高亮
- **复制反馈**：复制后显示 toast 提示"已复制"
- **移动端适配**：移动端始终显示按钮（无 hover 状态）

### 业界参考
- **VS Code**：文件树 hover 显示操作按钮（新建、删除等）
- **GitHub**：代码文件 hover 显示复制按钮
- **Notion**：块级 hover 显示操作菜单

## React 实现方案

### 方案 1：CSS hover（推荐）
```tsx
export function FileItem({ file }: { file: File }) {
  const copyFilename = async () => {
    await navigator.clipboard.writeText(file.path);
    toast.success('已复制文件路径');
  };

  return (
    <div className="group relative flex items-center justify-between px-2 py-1 hover:bg-gray-100">
      <span className="truncate">{file.name}</span>

      {/* 按钮容器：默认隐藏，hover 时显示 */}
      <div className="hidden group-hover:flex gap-1">
        <button
          onClick={() => openFile(file.path)}
          className="p-1 rounded hover:bg-gray-200"
          title="打开文件"
        >
          <ExternalLinkIcon size={16} />
        </button>
        <button
          onClick={copyFilename}
          className="p-1 rounded hover:bg-gray-200"
          title="复制文件路径"
        >
          <CopyIcon size={16} />
        </button>
      </div>
    </div>
  );
}
```

### 方案 2：状态控制（更灵活）
```tsx
export function FileItem({ file }: { file: File }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative flex items-center justify-between px-2 py-1"
    >
      <span>{file.name}</span>

      {isHovered && (
        <div className="flex gap-1 animate-in fade-in duration-200">
          <IconButton icon={<OpenIcon />} onClick={() => openFile(file.path)} />
          <IconButton icon={<CopyIcon />} onClick={() => copyFilename(file.path)} />
        </div>
      )}
    </div>
  );
}
```

## 复制到剪贴板实现

### 现代浏览器（推荐）
```tsx
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('已复制文件路径');
  } catch (err) {
    console.error('复制失败:', err);
    toast.error('复制失败，请手动复制');
  }
};
```

### 兼容旧浏览器
```tsx
const copyToClipboard = (text: string) => {
  // 优先使用现代 API
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text)
      .then(() => toast.success('已复制'))
      .catch(() => fallbackCopy(text));
  }

  // Fallback 方案
  fallbackCopy(text);
};

const fallbackCopy = (text: string) => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
    toast.success('已复制');
  } catch (err) {
    toast.error('复制失败');
  } finally {
    document.body.removeChild(textarea);
  }
};
```

## 可访问性增强

```tsx
<button
  onClick={copyFilename}
  className="p-1 rounded hover:bg-gray-200"
  aria-label="复制文件路径"
  title="复制文件路径"
>
  <CopyIcon size={16} aria-hidden="true" />
</button>
```

## 实现建议

1. **使用 Tailwind group**：最简单高效的实现方式
2. **延迟显示**：添加 `transition-opacity delay-100` 避免误触
3. **图标库**：使用 lucide-react 或 heroicons
4. **Toast 提示**：使用 sonner 或 react-hot-toast
5. **移动端适配**：使用 `@media (hover: hover)` 检测 hover 支持
