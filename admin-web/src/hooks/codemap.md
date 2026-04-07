# src/hooks/

## Responsibility
可复用的 React hooks 库，提供通用逻辑（防抖、本地存储、媒体查询、点击外部、剪贴板、窗口尺寸等），降低组件复杂度，提高代码复用率。

## Design
**主要 Hooks 清单：**
1. **useDebounce<T>(value, delay)** — 防抖，返回防抖后的值
2. **useLocalStorage<T>(key, initialValue)** — 本地存储，返回 [value, setValue]
3. **useMediaQuery(query)** — 媒体查询，返回布尔值
4. **useClickOutside<T>(callback)** — 点击外部检测，返回 ref
5. **useCopyToClipboard()** — 剪贴板复制，返回 [copied, copy 函数]
6. **useWindowSize()** — 窗口尺寸，返回 { width, height }
7. **useBreakpoint()** — 响应式断点，返回 { isMobile, isTablet, isDesktop, isLargeDesktop }

**设计模式：**
- 所有 hooks 遵循 React Hooks Rules（useEffect 正确的依赖数组）
- 支持 TypeScript 泛型（如 useDebounce<T>, useLocalStorage<T>）
- localStorage 异常处理（JSON parse 错误 → fallback 到初始值）
- 组件卸载时自动清理监听器（eventListener removeEventListener）

## Flow
组件使用流：
1. 组件导入所需 hook（如 useDebounce, useLocalStorage）
2. Hook 返回值用于状态、配置、计算
3. Hook 内部自动管理副作用（setTimeout, localStorage, eventListener）
4. 组件卸载时 hook 返回函数自动清理

**示例：**
- 搜索框：useDebounce(searchValue, 300) → 防抖后的值传给 API
- 侧边栏收起状态：useLocalStorage('sidebar-collapsed', false) → 自动持久化
- 响应式设计：useBreakpoint() → 判断是否移动端

## Integration
- **依赖：** React (useState, useEffect)、window API (matchMedia, localStorage, clipboard)
- **被依赖：** 所有组件、页面
- **关键接口：** useDebounce, useLocalStorage, useMediaQuery, useClickOutside, useCopyToClipboard, useWindowSize, useBreakpoint
