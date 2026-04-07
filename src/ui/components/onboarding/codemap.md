# src/ui/components/onboarding/

新用户引导系统，使用交互式导览帮助用户快速了解应用界面和核心功能。

## Responsibility

- **引导步骤定义** (`useOnboardingTour`)：6 步导览流程，涵盖侧边栏、新建任务、模型选择、积分系统、对话输入等
- **导览 UI 定制** (`onboarding.css`)：driver.js 弹出框样式覆盖，适配 Cherry Agent 设计系统（深/浅主题）
- **完成状态管理**：localStorage 存储引导版本号，避免重复展示；提供 reset 接口重新启动引导

## Design

### 核心模式

1. **Driver.js 集成**
   - 库：`driver.js`（开源 Web 导览库）
   - 特点：高亮元素、弹出框说明、点击外部自动关闭、支持深度定制
   - 样式覆盖：`onboarding.css` 里用 CSS 变量和 `!important` 覆盖 driver 默认样式

2. **步骤驱动设计**
   ```
   第 1 步：欢迎界面（无元素聚焦）
   第 2 步：侧边栏介绍（[data-tour="sidebar"]）
   第 3 步：新建任务按钮（[data-tour="new-task"]）
   第 4 步：模型选择器（[data-tour="model-selector"]）
   第 5 步：积分显示（[data-tour="balance"]）
   第 6 步：输入框（[data-tour="prompt-input"]）
   ```

3. **条件渲染与延迟启动**
   - 检查完成状态：`isOnboardingCompleted()` 读取 localStorage 的 `onboarding-tour-version` key
   - 延迟启动：`TOUR_START_DELAY_MS = 1500` 毫秒，等待应用加载完成、所有元素就位
   - 动态步骤过滤：`filterAvailableSteps()` 移除页面中不存在的元素（兼容不同页面布局）

4. **国际化**
   - `react-i18next` 翻译所有步骤标题和描述
   - 按钮文本："下一步"、"上一步"、"开始使用"

## Flow

### 应用启动

```
1. 用户打开应用 (App.tsx)
2. <AppInitializer> 完成认证初始化
3. 应用渲染完整 UI（Sidebar、PromptInput 等）
   ↓
   useOnboardingTour hook 被调用（通常在最外层组件）
4. useOnboardingTour 初始化：
   ├─ 检查 localStorage['onboarding-tour-version']
   ├─ 如果 === '9'（最新版本）→ 跳过引导
   └─ 如果不存在或版本低 → 设置 1500ms 延迟计时器
5. 1500ms 后（确保所有元素已挂载）
   ├─ buildSteps(t) 生成 6 个步骤（带 i18n 翻译）
   ├─ filterAvailableSteps() 检查目标元素是否存在
      └─ 若 [data-tour="sidebar"] 不存在，移除该步
   ├─ driver() 初始化实例，设置配置
   └─ driverInstance.drive() 启动导览
6. 用户与导览交互：
   ├─ 点击"下一步" → driver 自动滚动到下一元素、显示下一步弹框
   ├─ 点击"上一步" → 返回上一步
   ├─ 点击关闭按钮或区域外点击 → 触发 onDestroyed 回调
   └─ 所有步骤完成或用户关闭 → markOnboardingCompleted() 保存到 localStorage
7. 后续登录时不再显示引导
```

### 导览步骤细节

```
Step 1: 欢迎界面
  ├─ 标题："欢迎使用 Cherry Agent"
  ├─ 描述："一个强大的 AI 工作助手，帮助你完成各种复杂的工作任务..."
  ├─ 位置：side: 'over', align: 'center'（居中屏幕，无特定元素）
  └─ 动作：点下一步

Step 2: 侧边栏
  ├─ 聚焦：[data-tour="sidebar"] 元素
  ├─ 标题："侧边栏 - 管理对话"
  ├─ 描述："左侧侧边栏展示所有对话会话...可以新建、搜索、置顶或归档"
  ├─ 位置：side: 'right', align: 'start'（在元素右侧）
  └─ 动作：点下一步

Step 3: 新建任务
  ├─ 聚焦：[data-tour="new-task"] 按钮
  ├─ 标题："新建任务"
  ├─ 描述："点击这里创建新的 AI 对话任务"
  ├─ 位置：side: 'bottom', align: 'start'（在元素下方）
  └─ 动作：点下一步

Step 4: 模型选择
  ├─ 聚焦：[data-tour="model-selector"] 下拉框
  ├─ 标题："模型选择"
  ├─ 描述："选择不同的 AI 模型。不同模型有不同的能力和价格..."
  ├─ 位置：side: 'bottom', align: 'center'
  └─ 动作：点下一步

Step 5: 积分系统
  ├─ 聚焦：[data-tour="balance"] 余额显示区域
  ├─ 标题："积分系统"
  ├─ 描述："使用 AI 模型会消耗积分。点击这里查看余额和充值..."
  ├─ 位置：side: 'bottom', align: 'end'（在元素下方、右对齐）
  └─ 动作：点下一步

Step 6: 开始对话
  ├─ 聚焦：[data-tour="prompt-input"] 输入框
  ├─ 标题："开始对话"
  ├─ 描述："在底部输入框描述你的任务。支持粘贴图片、上传文件..."
  ├─ 位置：side: 'top', align: 'center'（在元素上方）
  ├─ 按钮变化：最后一步的右下按钮文本是 "开始使用"
  └─ 动作：点完成 → 调用 onDestroyed() → markOnboardingCompleted()
```

## Integration

### 依赖

- **UI 库**：
  - `driver.js` — Web 导览库（CDN 或 npm）
  - `react-i18next` — 国际化

- **Store** (可选)：
  - 可在 future 与 onboarding 相关的 store 集成（如 onboarding 进度追踪）

- **CSS 变量** (从 Cherry Agent 设计系统)：
  - `--color-surface`、`--color-ink-*`、`--color-accent` 等

### 被依赖

- **App.tsx** / **主组件**：调用 `useOnboardingTour()` hook
- **data-tour 标签**：需要在相应组件上添加：
  - `Sidebar` → `data-tour="sidebar"`
  - "新建任务"按钮 → `data-tour="new-task"`
  - 模型选择器 → `data-tour="model-selector"`
  - 余额显示 → `data-tour="balance"`
  - 输入框 → `data-tour="prompt-input"`

### 关键接口

```typescript
// useOnboardingTour hook 返回值
interface UseOnboardingTourReturn {
  startTour: () => void        // 手动启动导览（可用于设置页面的"再次导览"按钮）
  resetOnboarding: () => void  // 重置完成状态（清除 localStorage）
}

// DriveStep 配置（driver.js 类型）
interface DriveStep {
  element?: string             // CSS selector，可选（第1步无元素）
  popover: {
    title: string             // 步骤标题
    description: string       // 步骤描述
    side?: 'top' | 'bottom' | 'left' | 'right' | 'over'
    align?: 'start' | 'center' | 'end'
  }
}

// SyncConfig（非导览，但在 settings 中会引用）
interface OnboardingConfig {
  version: string             // localStorage 里的版本号 key
  startDelayMs: number        // 启动延迟时间
  showProgress: boolean       // 显示进度（step X / Y）
}
```

### 文件清单

| 文件 | 职责 | 关键导出 |
|------|------|--------|
| `useOnboardingTour.ts` | 导览逻辑、步骤定义、完成状态管理 | `useOnboardingTour`, `resetOnboarding` |
| `onboarding.css` | driver.js 样式定制、深/浅主题适配 | （全局样式，无 export） |
| `codemap.md` | 本文件 | （文档，无 export） |

## 关键 Bug 修复历史

1. **导览在深色主题下看不清**（可能存在）
   - 根因：driver.js 默认样式不适配深色背景
   - 修复：`onboarding.css` 新增 `.dark .driver-popover` 规则，自动检测 `.dark` 类或 `.theme-dark` 类

2. **某些元素不存在时导览崩溃**（v1.0 可能存在）
   - 根因：driver.js 找不到 selector 会报错
   - 修复：`filterAvailableSteps()` 预先过滤不存在的元素

3. **导览延迟不足，元素未就位**（早期版本可能存在）
   - 根因：`TOUR_START_DELAY_MS = 500` 太短
   - 修复：改为 `1500` 毫秒，确保所有异步组件加载完成

4. **导览版本号更新后用户没有看到新导览**（v1.0+ 优化）
   - 根因：localStorage 缓存旧版本号
   - 修复：修改 `ONBOARDING_VERSION = '9'` 强制新导览显示

5. **i18n 初始化滞后导致导览文本为键名**（v1.x 可能存在）
   - 根因：useOnboardingTour 在 i18n 未初始化时调用 `useTranslation()`
   - 修复：延迟启动（`TOUR_START_DELAY_MS`）同时也缓解了这个问题；可进一步在 i18n 初始化后再触发导览

## 与用户交互的关键组件

需要在以下组件上添加 `data-tour` 属性：

1. **Sidebar.tsx**
   ```tsx
   <aside data-tour="sidebar" className="...">
     {/* sidebar content */}
   </aside>
   ```

2. **新建任务按钮** (Sidebar 或 Header)
   ```tsx
   <button data-tour="new-task" onClick={createNewSession}>
     + 新建任务
   </button>
   ```

3. **模型选择器**
   ```tsx
   <select data-tour="model-selector" value={selectedModel}>
     {/* options */}
   </select>
   ```

4. **余额显示** (Header 或侧边栏)
   ```tsx
   <div data-tour="balance" className="...">
     余额: ¥{balance}
   </div>
   ```

5. **输入框** (PromptInput.tsx)
   ```tsx
   <textarea data-tour="prompt-input" placeholder="...">
     {/* input */}
   </textarea>
   ```
