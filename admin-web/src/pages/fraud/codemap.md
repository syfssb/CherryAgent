# src/pages/fraud/

## Responsibility

反欺诈模块，识别、监控和处理可疑账户。包括异常账户检测、风险评分、人工审核工作流、以及对恶意账户的禁用和处理。

## Design

- **单页面结构**：`FraudList.tsx` 包含所有反欺诈管理功能

- **特性**：
  - 分页（PAGE_SIZE = 20）
  - 筛选：审核状态（待审核、已处理、已忽略、已封禁）、风险原因、时间范围
  - 搜索：用户邮箱、用户 ID
  - 风险评分：数值越高风险越大（0-100 分）
  - 可疑原因：同 IP 多账户、一次性邮箱、快速消耗积分等
  - 行操作：查看详情、审核（批准/驳回）、手动禁用、恢复账户、忽略警告

- **工作流**：
  - 系统自动检测可疑账户 → 进入"待审核"状态
  - 管理员审核 → 批准（禁用账户）或驳回（消除警告）
  - 已处理账户可标记为"已忽略"（降低优先级但不删除）
  - 支持手动恢复：已禁用账户可解禁

- **风险评分算法**：
  - 多个风险因素组合计分
  - 自动生成分数，管理员可手动调整

- **状态管理**：
  - useQuery 加载可疑账户列表
  - useMutation 处理审核、禁用、恢复、忽略等操作
  - queryClient.invalidateQueries 同步列表
  - useState 管理搜索、筛选临时状态

## Flow

**FraudList 流程：**
1. 挂载 → useQuery 加载可疑账户列表（分页、状态筛选）
2. 系统默认显示"待审核"账户（优先级最高）
3. 用户搜索邮箱或 ID → 防抖 → 重新查询
4. 点击筛选（状态、原因、时间） → 重置 page=1 → 刷新
5. 点击可疑账户行 → 展开详情视图，显示：
   - 用户基本信息：邮箱、注册时间、最后活动时间
   - 风险原因列表（如"同 IP 多账户"、"一次性邮箱"）
   - 风险评分（数值 + 颜色指示）
   - 相关账户：如果是"同 IP 多账户"，显示同 IP 的其他账户

6. **审核操作**：
   - 点"批准"按钮 → 确认对话框 → useMutation approveFraud(id) → 禁用该账户 → 状态变为"已处理"
   - 点"驳回"按钮 → 可选输入驳回原因 → useMutation rejectFraud(id, reason) → 清除警告 → 状态变为"已处理"
   - 点"忽略"按钮 → useMutation ignoreFraud(id) → 状态变为"已忽略"

7. **其他操作**：
   - 点"禁用账户"按钮 → useMutation banAccount(userId) → 立即禁用
   - 点"恢复账户"按钮 → useMutation restoreAccount(userId) → 解除禁用
   - 点"查看详情"按钮 → 导航到用户详情页

8. **批量操作**（可选）：
   - 勾选多个可疑账户 → 点"批量审核"按钮 → 显示批量操作菜单
   - 选择"批量批准"或"批量驳回" → 同时处理多条记录

## Integration

- **Services**：
  - `fraudService.getSuspiciousAccounts(filters, page, limit)`：获取可疑账户列表
  - `fraudService.getSuspiciousDetail(userId)`：获取用户详细可疑信息
  - `fraudService.approveFraud(id)`：批准（禁用账户）
  - `fraudService.rejectFraud(id, reason)`：驳回（消除警告）
  - `fraudService.ignoreFraud(id)`：忽略（降低优先级）
  - `fraudService.banAccount(userId)`：手动禁用账户
  - `fraudService.restoreAccount(userId)`：恢复账户
  - `fraudService.getRelatedAccounts(userId)`：获取相关账户（如同 IP 账户）
  - `fraudService.updateRiskScore(userId, score)`：手动调整风险评分

- **UI 组件**：
  - Table + TableBody：可疑账户列表
  - Badge：状态（待审核、已处理、已忽略、已封禁）、风险原因
  - Button：操作按钮（审核、禁用、恢复、查看详情）
  - Dialog/Modal：详情展示、确认对话框
  - Input：搜索框、评分调整输入
  - ProgressBar/RiskScore：风险评分可视化

- **可疑原因**（reasonLabels 映射）：
  - `'same_ip_multiple_accounts'` → '同 IP 多账户'
  - `'disposable_email'` → '一次性邮箱'
  - `'rapid_credit_consumption'` → '快速消耗积分'
  - 其他：`same_credit_card`, `login_pattern_abnormal`, `device_fingerprint_mismatch` 等

- **审核状态**（statusConfig 映射）：
  - `'pending'` → '待审核'（红色，HIGH 优先级）
  - `'reviewed'` → '已处理'（普通色）
  - `'dismissed'` → '已忽略'（灰色，LOW 优先级）
  - `'banned'` → '已封禁'（红色，表示账户已禁）

- **风险评分颜色**：
  - >= 30：危险红色（极高风险）
  - >= 20：警告黄色（高风险）
  - < 20：灰色（低风险）

- **关键工具函数**：
  - `getReasonLabel(reason)`：映射原因字符串到中文标签
  - `getStatusBadge(status)`：映射状态到 Badge 配置
  - `getRiskScoreColor(score)`：评分到颜色的映射

- **工作流状态转移**：
  - pending → reviewed（点审核操作：批准或驳回）
  - pending → dismissed（点忽略）
  - pending/reviewed/dismissed → banned（手动点"禁用账户"或审核批准后自动禁用）
  - banned → restored（点"恢复账户"）
