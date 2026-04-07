# src/config/

## Responsibility
管理系统配置更新和维护，包括模型、渠道、字段映射等运行时配置的热更新机制。

## Design
基于数据库驱动的配置管理。定期读取并缓存模型、渠道、系统配置等，避免频繁 SQL 查询。支持配置热更新和版本控制。

## Flow
1. **update-config.ts**：定期任务，从 SQL 读取最新的模型、渠道、系统配置
2. **缓存更新**：将配置存至内存/全局变量，供其他服务快速访问
3. **事件通知**：配置变化时通知依赖方（如 proxy 层、billing 层）

## Integration
- **依赖**：db、pool、logger
- **被依赖**：proxy、services (billing、usage、channel 等)
- **关键接口**：
  - loadSystemConfigs() — 加载系统配置
  - loadModels() — 加载模型列表及定价
  - loadChannels() — 加载渠道配置
