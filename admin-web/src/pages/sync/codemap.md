# src/pages/sync/

## Responsibility

数据同步管理模块，监控桌面端和云端之间的数据同步状态。包括同步概览、用户级别的同步详情、冲突解决、设备管理等功能。

## Design

- **多页面结构**：
  - `SyncOverview.tsx`：全局同步统计概览，显示活跃设备、同步用户、变更和冲突统计
  - `SyncUserDetail.tsx`：单个用户的同步详情，显示该用户的同步历史、设备列表、冲突记录

- **SyncOverview 特性**：
  - 统计卡片：
    - 总变更数：系统处理的总同步变更
    - 总冲突数：检测到的数据冲突
    - 未解决冲突：需要人工处理的冲突数
    - 活跃设备数：最近 24 小时有同步活动的设备
    - 活跃用户数：最近 24 小时有同步活动的用户数
  - 用户列表表：显示最活跃或最近有冲突的用户
    - 用户邮箱、同步变更数、冲突数、未解决冲突数、设备数、最后同步时间
  - 行操作：查看该用户的详情页、清空同步数据（仅管理员）

- **SyncUserDetail 特性**：
  - 用户信息：邮箱、注册时间、设备列表
  - 同步历史：变更时间线、变更类型、受影响数据
  - 冲突记录：未解决冲突列表、冲突类型、创建时间、操作
  - 设备列表：设备名称、最后同步时间、同步状态
  - 操作：重新同步、清空冲突、删除设备

- **状态管理**：
  - SyncOverview：useQuery 加载统计数据，useState 管理分页
  - SyncUserDetail：useQuery 加载用户同步详情
  - useMutation 处理清空数据、解决冲突等操作
  - queryClient.invalidateQueries 同步更新

## Flow

**SyncOverview 流程：**
1. 挂载 → useQuery 加载同步概览数据（统计信息、用户列表）
2. 显示 5 个统计卡片：总变更、总冲突、未解决冲突、活跃设备、活跃用户
3. 显示用户列表（分页，PAGE_SIZE=20）：用户邮箱、变更数、冲突数、设备数、最后同步时间
4. 用户点击列表中的用户行 → 导航到 `/admin/sync/{userId}` → SyncUserDetail 页面
5. 点击刷新按钮 → queryClient.invalidateQueries → 重新加载统计数据
6. 支持搜索用户邮箱 → 防抖 → 重新查询

**SyncUserDetail 流程：**
1. 从路由参数获取 userId → useQuery 加载该用户的同步详情
2. 显示用户信息：邮箱、注册时间、最近同步时间
3. 显示 3 个分页表格区块：
   - **设备列表**：设备名称、OS、最后同步时间、状态、操作（删除、重新同步）
   - **同步历史**：变更时间、变更类型（新增/修改/删除）、数据描述、状态
   - **冲突记录**：冲突时间、冲突类型、涉及字段、当前状态、操作（查看详情、解决）
4. 点击冲突记录的"查看详情" → 弹窗显示冲突数据对比
5. 点击冲突的"解决" → 弹窗让用户选择保留哪个版本（本地/云端）→ useMutation resolveConflict() → 更新状态
6. 点击设备的"删除" → 确认对话框 → useMutation deleteDevice(deviceId) → 刷新列表
7. 点击"清空冲突" → 高风险操作，弹对话框确认 → useMutation clearConflicts(userId)

## Integration

- **Services**：
  - `syncService.getSyncOverview()`：获取全局同步统计
  - `syncService.getSyncUsers(page, limit, search)`：获取活跃同步用户列表
  - `syncService.getSyncUserDetail(userId)`：获取用户同步详情
  - `syncService.getUserDevices(userId)`：获取用户设备列表
  - `syncService.getSyncHistory(userId, page, limit)`：获取用户同步历史
  - `syncService.getConflicts(userId, page, limit)`：获取用户冲突列表
  - `syncService.getConflictDetail(conflictId)`：获取冲突详情（数据对比）
  - `syncService.resolveConflict(conflictId, resolution)`：解决冲突
  - `syncService.deleteDevice(deviceId)`：删除设备
  - `syncService.resyncUser(userId)`：重新同步用户数据
  - `syncService.clearConflicts(userId)`：清空用户所有冲突

- **UI 组件**：
  - Card + CardContent：统计卡片、分页表格容器
  - Table + TableBody：用户列表、设备列表、历史、冲突列表
  - Badge：状态标签（成功、冲突、待处理）
  - Button：操作按钮（查看详情、删除、重新同步、解决）
  - Dialog/Modal：冲突详情、解决冲突弹窗
  - Tabs：SyncUserDetail 中分隔设备、历史、冲突三个区块（可选）

- **统计指标类型**（SyncOverviewData）：
  - `totalChanges: number`：总同步变更数
  - `totalConflicts: number`：发生过的总冲突数
  - `unresolvedConflicts: number`：未解决冲突数
  - `activeDevices: number`：最近有活动的设备数
  - `activeUsers: number`：最近有活动的用户数

- **用户同步数据**（SyncUser 类型）：
  - `userId: string`
  - `email: string | null`
  - `name: string | null`
  - `changesCount: number`：该用户总变更数
  - `conflictsCount: number`：该用户总冲突数
  - `unresolvedConflictsCount: number`：该用户未解决冲突数
  - `devicesCount: number`：该用户设备数
  - `lastSyncTime: number | null`：时间戳（毫秒）

- **时间格式化**：
  - `formatTimestamp(ts)`：将毫秒时间戳格式化为"YYYY-MM-DD HH:mm:ss"
  - 空值显示为"-"

- **冲突类型**（可选）：
  - 'field_conflict'：同一字段在本地和云端有不同值
  - 'deletion_conflict'：本地删除但云端修改
  - 'order_conflict'：列表排序冲突
  - 其他自定义冲突

- **设备同步状态**：
  - 'synced'：已同步，数据最新
  - 'syncing'：正在同步中
  - 'conflict'：有冲突需解决
  - 'offline'：离线状态
