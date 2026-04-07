# src/constants/

## Responsibility
定义全系统的常量和枚举，包括 Provider 类型、模型常量、错误码等，确保跨模块统一。

## Design
集中管理所有"不变量"。SUPPORTED_PROVIDERS 为后端唯一来源，供路由校验、计费、渠道等引用，避免字符串魔数分散。

## Flow
1. **providers.ts**：导出 SUPPORTED_PROVIDERS 数组和 ProviderType 类型
2. **isValidProvider()**：类型守卫函数，校验 provider 是否在列表中
3. **被全局引用**：routes、services、middleware 等通过导入此处常量实现类型安全

## Integration
- **依赖**：无
- **被依赖**：routes (auth、proxy)、services (billing、usage、channel 等)、middleware (validate 等)
- **关键接口**：
  - SUPPORTED_PROVIDERS — Provider 列表：openai、anthropic、google、azure、deepseek、moonshot、zhipu、baidu、alibaba、custom
  - isValidProvider() — 类型守卫
