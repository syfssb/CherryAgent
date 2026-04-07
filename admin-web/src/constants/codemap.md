# src/constants/

## Responsibility
全局常量和配置值集中管理，包括 provider 选项（OpenAI、Anthropic 等）、状态标签映射、支付方法、模型类型、枚举值等。支持动态 provider 列表从 API 获取。

## Design
**主要文件：**
- `providers.ts` — Provider 常量（PROVIDER_OPTIONS、PROVIDER_FILTER_OPTIONS）、helper 函数（getProviderLabel）、动态 Hook（useProviders）

**静态常量模式：**
- 导出 ChannelProvider type（'openai' | 'anthropic' | ... | 'custom'）
- PROVIDER_OPTIONS — 表单选项（value, label）
- PROVIDER_FILTER_OPTIONS — 列表筛选选项（带"全部"）
- getProviderLabel() — value → label 映射函数

**动态 Provider Hook：**
- useProviders() — 优先从 API 获取 providers 列表，失败 fallback 到静态常量
- 返回 { providers, filterOptions, getProviderLabel }，支持组件直接使用

## Flow
1. **静态使用：** 导入 PROVIDER_OPTIONS / PROVIDER_FILTER_OPTIONS，直接在表单/列表中使用
2. **动态使用：** 页面调用 useProviders()，获取最新 provider 列表（首次挂载时从 API 拉取）
3. **映射：** 需要显示 label 时调用 getProviderLabel(value)

**API 集成：**
- fetchProviders() — 从后端获取动态 provider 列表（location: services/providers.ts）
- 成功 → 更新状态；失败 → 静默 fallback，继续使用静态常量

## Integration
- **依赖：** services/providers (fetchProviders)、React hooks (useState, useEffect)
- **被依赖：** 所有涉及 provider 选择的页面（channels, models, finance 等）
- **关键接口：** PROVIDER_OPTIONS, PROVIDER_FILTER_OPTIONS, useProviders(), getProviderLabel()
