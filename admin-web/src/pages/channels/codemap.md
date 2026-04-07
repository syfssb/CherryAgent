# src/pages/channels/

## Responsibility

LLM 渠道管理模块，支持集成多个第三方 AI 服务商（如 OpenAI、Anthropic、Moonshot 等）。管理渠道的启用/禁用、健康状态监控、API 密钥配置、成本和额度管理。

## Design

- **多页面结构**：
  - `ChannelList.tsx`：渠道列表、搜索筛选、启用禁用、新增编辑、健康状态指示
  - `ChannelForm.tsx`：渠道新增/编辑弹窗，处理 API 密钥、成本等配置

- **列表页特性**：
  - 分页（PAGE_SIZE = 20）
  - 筛选条件：启用状态、健康状态（健康、降级、不健康、已禁用）、搜索渠道名
  - 行操作：编辑、禁用/启用、删除、查看详情、测试连接
  - 健康状态 Badge：颜色编码（绿-健康、黄-降级、红-不健康、灰-禁用）

- **渠道配置**：
  - Provider：支持 OpenAI、Anthropic、Google、Moonshot、Claude 等多个提供商
  - API 密钥加密存储（使用 AES 加密）
  - 区域选择：多个区域端点支持
  - 成本配置：输入/输出 token 价格，支持积分和美元两种货币

- **状态管理**：
  - useQuery 加载渠道列表
  - useMutation 处理启用、禁用、删除
  - 弹窗表单用 useState 管理临时数据
  - 表单提交前校验 API 密钥可用性

## Flow

**ChannelList 流程：**
1. 挂载 → useQuery 加载渠道列表（第 1 页，含健康状态、配置信息）
2. 点击搜索框 → 输入渠道名 → 防抖 500ms → 调用 channelsService.getChannels({ search, page: 1 })
3. 点击筛选按钮：
   - 选择启用状态（全部/已启用/已禁用）
   - 选择健康状态（全部/健康/降级/不健康）
   - 重置 page=1 → 重新查询
4. 用户点击行上的"编辑"按钮 → 打开 ChannelForm 弹窗（编辑模式，预填数据）
5. 点击"禁用"按钮 → useMutation toggleChannel(id) → 列表实时更新
6. 点击"新增"按钮 → 打开 ChannelForm 弹窗（新增模式，默认值）
7. 点击"测试"按钮 → useMutation testConnection(id) → 弹窗显示结果

**ChannelForm 流程：**
1. 打开弹窗（新增/编辑） → 初始化表单状态
2. 用户填表：选择 Provider → 加载该 Provider 支持的区域列表 → 输入 API 密钥、成本价格
3. 实时校验：必填检查、API 密钥格式验证
4. 点击"保存" → useMutation 提交数据 → 成功后关闭弹窗、刷新列表
5. 点击"测试连接" → 验证 API 密钥有效性 → 显示测试结果（成功/失败）

## Integration

- **Services**：
  - `channelsService.getChannels(filters, page, limit)`：获取渠道列表
  - `channelsService.getChannelDetail(channelId)`：获取渠道详情
  - `channelsService.createChannel(data)`：新增渠道
  - `channelsService.updateChannel(channelId, data)`：编辑渠道
  - `channelsService.deleteChannel(channelId)`：删除渠道
  - `channelsService.toggleChannel(channelId, enabled)`：启用禁用
  - `channelsService.testConnection(channelId)`：测试连接

- **UI 组件**：
  - Table + TableHeader + TableBody：渠道列表
  - Badge：健康状态、启用状态标签
  - Button：操作按钮（编辑、删除、测试）
  - Input：搜索、API 密钥输入
  - Select：Provider 选择、区域选择
  - Dialog/Modal：ChannelForm 弹窗

- **Provider 支持**：
  - 从 `useProviders()` hook 获取所有可用提供商列表
  - 每个 Provider 配置：name、icon、regions、description

- **健康状态**：
  - 'healthy'：绿色标签，渠道正常可用
  - 'degraded'：黄色标签，渠道部分请求失败
  - 'unhealthy'：红色标签，渠道故障或不可用
  - 'disabled'：灰色标签，渠道已禁用

- **成本配置单位**：
  - 输入价格 = 每百万 token 的成本
  - 支持两种货币：CNY（积分）、USD（美元）

- **API 密钥安全**：
  - 前端输入时不做加密，由后端处理
  - 列表展示时用 `•••` 遮挡真实内容
  - 编辑时需重新输入完整密钥
