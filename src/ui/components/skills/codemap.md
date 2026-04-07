# src/ui/components/skills/

## Responsibility
提供技能相关的 UI 组件，包括技能卡片展示、详情查看、编辑等功能，支持技能市场和 Skill Manager 交互。

## Design
- **SkillCard**：显示单个技能的卡片（图标、名称、描述、标签等），点击打开详情或编辑
- **SkillDetail**：展示技能完整信息，包括使用场景、依赖、提示词等
- **SkillEditor**：编辑或创建技能的表单，包括字段验证和保存功能
- **Icon 映射**：`getSkillIcon()` 根据技能类型返回对应图标

## Flow
```
SkillMarket 页面
  → 列表展示 SkillCard[] (预设 + 自定义)
  → 用户点击卡片
  → 打开 SkillDetail 模态框 / SkillEditor 面板

编辑流程
  → SkillEditor 加载初始数据
  → 用户修改字段
  → 验证 + IPC: skill:update / skill:create
  → 关闭面板 + 刷新列表
```

## Integration
- **依赖**：React、useAppStore、useTranslation、UI 组件库 (Dialog、Input、Button等)、图标库
- **被依赖**：SkillMarket 页面、Sidebar 技能列表
- **关键接口**：
  - `SkillCard` Props：skill 对象、onClick、onEdit、onDelete
  - `SkillDetail` Props：skill 对象、onClose、onEdit
  - `SkillEditor` Props：skill? (编辑) / undefined (新建)、onSave、onCancel
  - `getSkillIcon(skillType)` → 返回组件
