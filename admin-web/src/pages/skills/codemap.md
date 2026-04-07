# src/pages/skills/

## Responsibility

自定义技能管理模块，支持上传、编辑、发布用户自定义的 AI 技能。包括技能元信息管理（名称、描述、分类）、代码编辑、外部市场集成。

## Design

- **多页面结构**：
  - `SkillList.tsx`：技能列表、搜索筛选、启用禁用、编辑、删除、多语言支持
  - `ExternalSkillMarket.tsx`：第三方技能市场集成，浏览和导入外部技能

- **SkillList 特性**：
  - 分页（PAGE_SIZE = 20）
  - 筛选：启用状态（已启用/已禁用）、分类（工具、数据、内容生成等）
  - 搜索：技能名称或描述
  - 行操作：编辑、启用/禁用、删除、预览、发布
  - 多语言支持：技能名称、描述支持多种语言（中文、英文等）
  - 评分和星标：显示用户评分、支持管理员标记为推荐

- **SkillForm 弹窗**（新增/编辑）：
  - 技能名称（多语言 I18nEditor）
  - 技能描述（多语言 I18nEditor，Markdown 支持）
  - 分类选择：工具、数据、内容生成、代码、其他
  - Runtime：选择运行环境（Node.js、Python、Docker 等）
  - 代码编辑器：支持语法高亮、代码格式化
  - 启用/禁用开关
  - 标签/关键词：逗号分隔

- **ExternalSkillMarket 特性**：
  - 连接外部技能市场（如 GitHub、官方市场等）
  - 搜索和浏览可用技能
  - 一键导入：导入技能到本地
  - 版本管理：显示技能版本，支持更新

- **状态管理**：
  - useQuery 加载技能列表
  - useMutation 处理新增、编辑、删除、启用禁用、导入
  - 弹窗表单用 useState 管理临时数据和多语言字段
  - I18nEditor 用 extractFieldI18n 和 buildI18nPayload 处理多语言
  - queryClient.invalidateQueries 同步列表

## Flow

**SkillList 流程：**
1. 挂载 → useQuery 加载技能列表（分页、启用状态、分类筛选）
2. 用户搜索技能名 → 防抖 → 调用 skillsService.getSkills({ search, page: 1 })
3. 点击筛选（分类、状态） → 重置 page=1 → 重新查询
4. 点击"新增技能"按钮 → 打开 SkillForm 弹窗（新增模式）
   - 初始化空表单
   - I18nEditor 显示多语言输入框（中文、英文）
   - 填表：名称、描述、分类、Runtime、代码
5. 编辑后点"保存" → useMutation createSkill(data) → 成功关闭 + 刷新列表
6. 点击技能行的"编辑"按钮 → 打开 SkillForm 弹窗（编辑模式，预填数据）
7. 修改完成 → 点"保存" → useMutation updateSkill(id, data)
8. 点击"启用"或"禁用"按钮 → useMutation toggleSkill(id, enabled)
9. 点击"删除" → 确认对话框 → useMutation deleteSkill(id)
10. 点击"预览" → 弹窗展示技能的渲染效果和使用示例

**SkillForm 流程：**
1. 打开弹窗 → 初始化或预填数据
2. 多语言编辑：
   - I18nEditor 提供语言选项卡（中文、英文、日本语等）
   - 用户在各选项卡下填入对应语言的内容
   - 内部用 Record<locale, string> 表示（如 { 'en': 'My Skill', 'zh': '我的技能' }）
3. 分类和 Runtime 选择：从 SKILL_CATEGORY_OPTIONS 和 SKILL_RUNTIME_OPTIONS 下拉选择
4. 代码编辑：
   - 显示代码编辑器（CodeMirror 或类似）
   - 实时语法高亮
5. 提交前校验：
   - 名称必填（至少一种语言）
   - 代码必填，语法有效
   - Runtime 必选
6. 点"保存"后：
   - 调用 buildI18nPayload() 转换多语言数据格式
   - 提交 POST /api/admin/skills 或 PUT /api/admin/skills/{id}
7. 成功后关闭弹窗，列表自动刷新

**ExternalSkillMarket 流程：**
1. 打开市场页面 → useQuery 加载可用技能列表（从外部 API）
2. 用户搜索技能 → 防抖 → 调用外部服务 getMarketSkills({ search })
3. 点击技能卡片 → 展示详情：作者、版本、评分、安装数
4. 点击"导入"按钮 → useMutation importSkill(skillId) → 本地添加该技能

## Integration

- **Services**：
  - `skillsService.getSkills(filters, page, limit)`：获取技能列表
  - `skillsService.getSkillDetail(skillId)`：获取技能详情
  - `skillsService.createSkill(data)`：新增技能
  - `skillsService.updateSkill(skillId, data)`：编辑技能
  - `skillsService.deleteSkill(skillId)`：删除技能
  - `skillsService.toggleSkill(skillId, enabled)`：启用禁用
  - `skillsService.publishSkill(skillId)`：发布到市场
  - `externalSkillService.getMarketSkills(filters)`：获取外部市场技能
  - `externalSkillService.importSkill(skillId)`：导入外部技能

- **UI 组件**：
  - Table + TableBody：技能列表
  - Badge：分类、状态标签
  - Button：操作按钮（编辑、删除、启用、预览）
  - Dialog/Modal：SkillForm、导入弹窗
  - I18nEditor：多语言编辑组件
  - CodeEditor：代码编辑器（集成 CodeMirror）
  - Star：评分显示

- **多语言支持**（I18n）：
  - 支持的语言：中文（zh）、英文（en）、日本语（ja）等
  - extractFieldI18n(skill, 'name')：从 skill 对象提取 name 的 I18n 字段
  - buildI18nPayload(formData)：将表单的多语言数据转为 API 格式
  - 数据格式：`{ nameI18n: { "zh": "...", "en": "..." }, descriptionI18n: {...} }`

- **技能分类**（SKILL_CATEGORY_OPTIONS）：
  - '工具'：通用工具类技能
  - '数据'：数据处理、分析
  - '内容生成'：文本、图片生成
  - '代码'：代码生成、调试
  - '其他'：其他分类

- **Runtime 支持**（SKILL_RUNTIME_OPTIONS）：
  - 'nodejs'：Node.js 环境
  - 'python'：Python 环境
  - 'docker'：Docker 容器
  - 'wasm'：WebAssembly
  - 'http'：HTTP 端点调用

- **技能发布流程**：
  - 编辑完成 → 点"发布"按钮 → 审核工作流（可选）→ 上架到技能市场
  - 已发布技能显示"已发布"Badge
  - 支持版本控制：每次发布生成新版本号

- **评分和推荐**：
  - 显示用户评分（如 4.5 / 5 星）
  - 管理员可标记为"推荐"（显示在首页）
  - 显示安装/使用次数
