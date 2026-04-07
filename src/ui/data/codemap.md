# src/ui/data/

## Responsibility
存储应用的静态业务数据集，目前主要是 22 个真实使用案例的集合，用于营销和用户教育。

## Design
- **数据结构**：
  - `UseCase` → 单个使用案例（id、标题、描述、耗时对比、规模、能力、分类、技能依赖、提示词模板）
  - `UseCaseGroup` → 按分��组织的案例集合
  - `UseCaseCategory` → 7 大分类（文件管理、数据处理、内容创作、财务管理、学习研究、工作协作、个人生活）

- **功能函数**：
  - `getAllUseCases()` → 获取所有案例（展平）
  - `getUseCasesByCategory(category)` → 按分类筛选
  - `getUseCaseStats()` → 统计信息（总数、按分类计数）

- **数据源**：从 `Cowork使用案例集.md` 提取的 22 个真实案例，每个包含性能对比（原耗时 → 优化耗时）

## Flow
```
应用启动
  → 导入 useCases 数据
  → SkillMarket / 首页等组件调用 getUseCases*()
  → 展示使用案例卡片
  → 用户点击 → 触发相关流程（如复制提示词到聊天框）
```

## Integration
- **依赖**：TypeScript 类型定义（无外部依赖）
- **被依赖**：SkillMarket、ReferralPage、首页展示组件
- **关键接口**：
  - `getAllUseCases()` → 获取全部 22 个案例
  - `getUseCasesByCategory(category)` → 按类别过滤
  - `getUseCaseStats()` → 统计信息
  - `useCases: UseCaseGroup[]` → 原始数据
