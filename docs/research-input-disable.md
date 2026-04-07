# 对话框禁用输入 - 调研报告

## 最佳实践

### UI/UX 设计
- **视觉反馈**：禁用时显示加载指示器（spinner/skeleton）
- **状态提示**：显示进度文本（如"AI 正在思考..."）
- **可访问性**：使用 `aria-busy` 和 `aria-disabled` 属性
- **用户控制**：提供"停止生成"按钮让用户中断任务

### 业界参考
- **ChatGPT**：输入框禁用 + 底部显示"Stop generating"按钮
- **Claude.ai**：输入框禁用 + 闪烁的光标动画
- **Cursor**：输入框禁用 + 进度条显示

## React 实现方案

### 方案 1：简单状态控制
```tsx
const [isProcessing, setIsProcessing] = useState(false);

<textarea
  disabled={isProcessing}
  aria-busy={isProcessing}
  aria-label="消息输入框"
  placeholder={isProcessing ? "AI 正在思考..." : "输入消息..."}
/>
{isProcessing && <LoadingSpinner />}
```

### 方案 2：全局状态管理（推荐）
```tsx
// store/chat.ts
import { create } from 'zustand';

interface ChatStore {
  isProcessing: boolean;
  setProcessing: (value: boolean) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  isProcessing: false,
  setProcessing: (value) => set({ isProcessing: value }),
}));

// ChatInput.tsx
import { useChatStore } from '@/store/chat';

export function ChatInput() {
  const { isProcessing, setProcessing } = useChatStore();

  return (
    <div className="relative">
      <textarea
        disabled={isProcessing}
        aria-busy={isProcessing}
        className={cn(
          "w-full resize-none",
          isProcessing && "opacity-50 cursor-not-allowed"
        )}
      />
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/5">
          <Spinner />
          <span className="ml-2 text-sm text-gray-600">AI 正在思考...</span>
        </div>
      )}
    </div>
  );
}
```

### 方案 3：带停止按钮
```tsx
export function ChatInput() {
  const { isProcessing, stopGeneration } = useChatStore();

  return (
    <div className="relative">
      <textarea disabled={isProcessing} />
      {isProcessing && (
        <button
          onClick={stopGeneration}
          className="absolute bottom-2 right-2 px-3 py-1 bg-red-500 text-white rounded"
        >
          停止生成
        </button>
      )}
    </div>
  );
}
```

## 实现建议

1. **状态管理**：使用 Zustand 或 Context 管理全局处理状态
2. **视觉反馈**：禁用时降低透明度（opacity-50）+ 显示加载动画
3. **可访问性**：添加 ARIA 属性，支持屏幕阅读器
4. **用户体验**：提供停止按钮，避免用户感到失控
5. **错误处理**：任务失败时自动恢复输入框可用状态
