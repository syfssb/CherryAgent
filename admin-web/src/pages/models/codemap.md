# src/pages/models/

## Responsibility

LLM 模型管理模块，维护支持的 AI 模型列表及其计费配置。支持启用/禁用模型、编辑模型价格、关联渠道和供应商、同步模型元数据。

## Design

- **多页面结构**：
  - `ModelList.tsx`：模型列表、搜索筛选、新增编辑、启用禁用、关联渠道
  - `ModelForm.tsx`：模型新增/编辑表单，处理名称、描述、计费规则、供应商关联

- **列表页特性**：
  - 分页（PAGE_SIZE = 20）
  - 筛选：启用状态（已启用/已禁用）、Provider（OpenAI/Anthropic/Google 等）
  - 搜索：模型名称或 ID
  - 行操作：编辑、启用/禁用、删除、查看详情
  - 价格显示：输入 token 价格、输出 token 价格（以积分/元为单位）
  - 关联渠道：显示支持该模型的渠道列表

- **价格计算**：
  - 后端存储：所有价格以分（积分）存储
  - 前端显示：格式化为元（如 0.01 积分/MTok）
  - 支持免费模型（价格 = 0）
  - 支持按 token 计费、按请求计费等多种模式

- **状态管理**：
  - useQuery 加载模型列表
  - useMutation 处理启用、禁用、删除、编辑
  - queryClient.invalidateQueries 同步列表
  - 弹窗表单用 useState 管理临时编辑数据

## Flow

**ModelList 流程：**
1. 挂载 → useQuery 加载模型列表（分页、启用状态、Provider 筛选）
2. 用户输入搜索词（模型名 ID） → 防抖 → 调用 modelsService.getModels({ search, page: 1 })
3. 点击筛选（启用状态、Provider） → 重置 page=1 → 重新查询
4. 点击模型行 → 打开 ModelForm 弹窗（编辑模式）
5. 编辑价格或描述后点"保存" → useMutation updateModel(id, data) → 列表刷新
6. 点击"禁用"按钮 → useMutation toggleModel(id) → 立即更新 Badge
7. 点击"新增模型"按钮 → 打开 ModelForm 弹窗（新增模式）

**ModelForm 流程：**
1. 打开弹窗（新增/编辑） → 初始化表单
   - 新增：默认值 (enabled=true, pricing={})
   - 编辑：预填模型信息
2. 用户填表：
   - Model ID：不可编辑（新增时必填）
   - 显示名称：输入中文名
   - 描述：可选文本
   - Provider：下拉选择（或自动推断）
   - Input Price：输入每百万 token 价格
   - Output Price：输出 token 价格
   - 启用状态：开关选择
3. 价格校验：
   - 必须是数字，可以是 0（表示免费）
   - 支持小数点后 2-4 位
4. 点击"保存" → 调用 createModel 或 updateModel → 成功关闭 + 刷新列表
5. 点击"取消" → 放弃编辑，关闭弹窗

## Integration

- **Services**：
  - `modelsService.getModels(filters, page, limit)`：获取模型列表
  - `modelsService.getModelDetail(modelId)`：获取模型详情
  - `modelsService.createModel(data)`：新增模型
  - `modelsService.updateModel(modelId, data)`：编辑模型
  - `modelsService.deleteModel(modelId)`：删除模型
  - `modelsService.toggleModel(modelId, enabled)`：启用禁用
  - `modelsService.syncModelsFromProviders()`：同步第三方模型元数据

- **UI 组件**：
  - Table + TableBody：模型列表
  - Badge：启用状态、Provider 标签
  - Button：操作按钮
  - Input：搜索框、价格输入
  - Select：Provider 选择
  - Dialog/Modal：ModelForm 弹窗

- **价格格式化**：
  - `formatCreditsPerMtok(credits)`：格式化价格显示
  - 逻辑：0 → '免费'；< 0.01 → `${credits} 积分`；< 1 → 保留 2 位；< 10 → 保留 1 位；>= 10 → 四舍五入
  
- **从模型获取积分价格**：
  - 优先取 `model.creditsPricing`（新字段）
  - 回退到 `model.pricing`（兼容旧数据）
  - 分别返回 inputPrice、outputPrice

- **Provider 支持**：
  - OpenAI：gpt-4, gpt-4-turbo, gpt-3.5-turbo 等
  - Anthropic：claude-3-opus, claude-3-sonnet, claude-3-haiku 等
  - Google：gemini-pro, gemini-1.5 等
  - Moonshot：moonshot-v1 等
  - 其他：通过 useProviders() 动态加载

- **关联渠道**：
  - 每个模型可由多个渠道提供
  - 模型详情页展示支持该模型的渠道列表
  - 编辑模型时可配置支持的渠道
