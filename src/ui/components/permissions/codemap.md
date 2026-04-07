# src/ui/components/permissions/

## Responsibility
权限确认 UI 层，提供通用的权限请求对话框（ConfirmDialog）和 Hook（useConfirmDialog），支持文件操作、命令执行、网络请求等多种操作类型的权限管理。

## Design

### 核心架构
- **无模态状态管理**：ConfirmDialog 接收 `open` 和 `onClose` 回调，上层管理显示隐藏和结果处理
- **Hook 封装**：useConfirmDialog 提供命令式 API，返回 Promise，符合异步确认模式
- **灵活配置**：支持标题、消息、操作类型、详细信息、超时、记住选择等多维度定制
- **安全设计**：危险操作标记（dangerous=true）禁用 Enter 快捷键，超时默认拒绝

### 关键抽象
1. **ConfirmDialog**：无状态呈现组件，接收 `open, options, onClose`
2. **useConfirmDialog Hook**：有状态管理，返回 `{ confirm, Dialog }`
   - `confirm(options)` → 返回 Promise<ConfirmDialogResult>
   - `Dialog` 组件用于在父组件中渲染

### 设计模式
- **受控组件**：Dialog open 状态完全由上层控制
- **Promise 封装**：异步确认转换为 Promise，支持 async/await
- **操作类型映射**：不同操作类型显示不同图标（文件、执行、网络、删除等）

## Flow

### Hook 使用流程
```typescript
// 在父组件中
const { confirm, Dialog } = useConfirmDialog();

// 需要确认时
const result = await confirm({
  title: 'Confirm Action',
  message: 'Are you sure?',
  operationType: 'file',
  dangerous: false
});

if (result.action === 'allow') {
  // 执行操作
}

// 在 render 中
return <>
  <Dialog />
  {/* 其他内容 */}
</>
```

### 对话框生命周期
1. **打开**：`confirm(options)` 调用 → 创建 Promise + 设置 state `open: true`
2. **用户交互**：
   - 点"Allow" → `handleAllow()` → 清理定时器 → `onClose({ action: 'allow', remember })`
   - 点"Deny" → `handleDeny()` → 清理定时器 → `onClose({ action: 'deny', remember })`
   - 按 Esc → deny（除非 dangerous）
   - 按 Enter → allow（仅非 dangerous）
3. **超时自动拒绝**（可选）：倒计时到 0 → 自动执行 `defaultAction`
4. **关闭**：`handleClose(result)` → 解决 Promise + 设置 `open: false`
5. **清理**：定时器、键盘监听器销毁

### 状态管理
```typescript
dialogState = {
  open: boolean;
  options: ConfirmDialogOptions;
  resolve: ((result) => void) | null;
}
```

### 键盘快捷键
- **Esc**：始终触发 Deny
- **Enter**：仅非 dangerous 操作触发 Allow
- 提示文本显示在对话框底部

## Integration

### 依赖
- **React**: useState, useCallback, useRef, useEffect
- **i18next**：国际化（可选，当前未使用 i18n）

### 被依赖
- **Electron IPC 处理程序**（ipc-handlers.ts）：权限对话框确认逻辑
- **权限管理中间件**：在工具执行前确认权限
- **Chat 组件层**：权限确认后的结果传递

### 关键接口

#### ConfirmDialogOptions
```typescript
type ConfirmDialogOptions = {
  title: string;
  message: string;
  operationType?: string;        // 'file', 'execute', 'network', 'delete', ...
  details?: Record<string, string | number | boolean>;  // 额外信息展示
  allowLabel?: string;           // 默认 "Allow"
  denyLabel?: string;            // 默认 "Deny"
  showRemember?: boolean;        // 显示"记住选择"复选框
  timeoutSeconds?: number;       // 超时自动拒绝（秒）
  defaultAction?: 'allow' | 'deny';  // 超时默认操作，默认 'deny'
  dangerous?: boolean;           // 危险操作标记，禁用 Enter 快捷键
}
```

#### ConfirmDialogResult
```typescript
type ConfirmDialogResult = {
  action: 'allow' | 'deny';
  remember: boolean;             // 用户是否勾选记住选择
}
```

#### useConfirmDialog Hook
```typescript
{
  confirm: (options: ConfirmDialogOptions) => Promise<ConfirmDialogResult>;
  Dialog: React.ComponentType;   // 无 props 的组件，返回对话框 UI
}
```

#### ConfirmDialogProps
```typescript
interface ConfirmDialogProps extends ConfirmDialogOptions {
  open: boolean;
  onClose: (result: ConfirmDialogResult) => void;
}
```

### 操作类型图标映射
| operationType | 图标 | 说明 |
|--|--|--|
| file, write, edit | 文件图标 | 文件操作 |
| execute, bash, command | 命令行图标 | 命令执行 |
| network, fetch, http | 全球图标 | 网络请求 |
| delete, remove | 垃圾桶图标 | 删除操作 |
| 默认 | 盾牌图标 | 通用安全操作 |

### 样式说明
- **背景**：半透明深色背景 + 模糊效果（`backdrop-blur-sm`）
- **卡片**：圆角（`rounded-2xl`）+ 边框 + 阴影（`shadow-elevated`）
- **操作类型标签**：
  - 非危险（warning）：黄色背景 + 文字
  - 危险（dangerous）：红色背景 + 文字
- **超时进度条**：从右到左线性移动，1 秒 1% 递减
- **动画**：进入时 `fade-in zoom-in-95` 200ms

### 文件清单
- **ConfirmDialog.tsx**：权限确认对话框组件 + useConfirmDialog Hook
- **index.ts**：导出 ConfirmDialog 和 useConfirmDialog
