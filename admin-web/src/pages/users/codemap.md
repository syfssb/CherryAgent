# src/pages/users/

## Responsibility

用户管理模块，支持用户列表展示、搜索筛选、详情查看、禁用/启用、角色编辑等管理操作。核心功能是对平台用户进行完整的生命周期管理和安全控制。

## Design

- **多页面结构**：
  - `UserList.tsx`：用户列表、搜索筛选、批量操作
  - `UserDetail.tsx`：单个用户详情、修改用户信息、查看交易历史

- **列表页特性**：
  - 分页（PAGE_SIZE = 20）
  - 多条件筛选：状态（正常/已封禁）、角色（普通用户/管理员）、排序（注册时间/邮箱/名称/余额）
  - 实时搜索：邮箱或用户名
  - 行操作：查看详情、禁用/启用、删除、修改角色

- **状态管理**：
  - useQuery 获取用户列表（含分页、筛选结果）
  - useMutation 处理用户禁用、启用、删除、角色修改
  - queryClient.invalidateQueries 同步列表刷新

## Flow

**UserList 流程：**
1. 组件挂载 → useQuery 加载第 1 页用户列表
2. 用户输入搜索词 → 防抖 500ms → 调用 usersService.getUsers({ search, page: 1, limit: 20, filters })
3. 点击筛选条件（状态、角色、排序）→ 重置 page=1 → 重新查询
4. 用户点击"禁用用户" → useMutation 提交 userId → queryClient.invalidateQueries 刷新列表
5. 点击用户行 → 导航到 `/admin/users/{userId}` → UserDetail 页面

**UserDetail 流程：**
1. 从路由参数获取 userId → useQuery 加载用户详情
2. 显示用户基本信息：邮箱、余额、注册时间、禁用状态、角色
3. 可编辑字段（如余额、角色）→ 修改 → 保存 → useMutation 提交
4. 显示用户交易历史（可选的分页表格）

## Integration

- **Services**：
  - `usersService.getUsers(filters, page, limit)`：获取用户列表
  - `usersService.getUserDetail(userId)`：获取用户详情
  - `usersService.disableUser(userId)`：禁用用户
  - `usersService.enableUser(userId)`：启用用户
  - `usersService.deleteUser(userId)`：删除用户
  - `usersService.updateUser(userId, data)`：更新用户信息

- **UI 组件**：
  - Table + TableHeader + TableBody：用户列表表格
  - Badge：状态、角色标签
  - Button：操作按钮（查看、禁用、删除）
  - Input：搜索框
  - SelectField：筛选条件下拉

- **状态过滤**：
  - '正常' → isActive = true
  - '已封禁' → isActive = false

- **角色**：
  - 'user'：普通用户
  - 'admin'：管理员

- **工具函数**：
  - `getUserDisplayName(user)`：优先显示 name，否则显示邮箱前缀
  - `formatBalance(balance, currency)`：显示余额（带单位"积分"）
  - `formatDateTime(ts)`：日期格式化
