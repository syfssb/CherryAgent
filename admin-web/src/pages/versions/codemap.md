# src/pages/versions/

## Responsibility

桌面端版本管理模块，维护应用版本发布记录、更新日志、兼容性信息。支持管理员发布新版本、标记当前稳定版、配置更新策略。

## Design

- **多页面结构（index.ts 导出）**：
  - `VersionList.tsx`：版本列表、搜索筛选、新增版本、编辑、删除、标记为稳定版
  - `VersionForm.tsx`：版本新增/编辑表单，处理版本号、更新日志、兼容性等

- **VersionList 特性**：
  - 分页（PAGE_SIZE = 20）
  - 筛选：平台（macOS/Windows）、状态（草稿/发布/已停用）
  - 搜索：版本号
  - 行显示：版本号、发布日期、平台、下载链接状态、更新日志摘要、操作
  - 操作：编辑、删除、查看完整更新日志、标记为稳定版、设置强制更新

- **VersionForm 特性**：
  - 版本号（语义化版本，如 v0.2.15）
  - 平台选择：macOS arm64、macOS x64、Windows
  - 状态：草稿、发布、已停用
  - 更新日志：Markdown 编辑器
  - 下载链接：自动填充或手动输入（DMG、EXE 等）
  - 强制更新开关：启用后用户必须更新，否则无法继续使用
  - 兼容性信息：最低系统版本、依赖库版本等
  - 发布日期：自动或手动设置

- **状态管理**：
  - useQuery 加载版本列表
  - useMutation 处理新增、编辑、删除、标记稳定版等
  - MarkdownEditor 编辑更新日志
  - queryClient.invalidateQueries 同步列表

## Flow

**VersionList 流程：**
1. 挂载 → useQuery 加载版本列表（分页、平台筛选、状态筛选）
2. 用户搜索版本号 → 防抖 → 重新查询
3. 点击筛选（平台、状态） → 重置 page=1 → 刷新
4. 点击"新增版本"按钮 → 打开 VersionForm 弹窗（新增模式）
5. 点击版本行的"编辑"按钮 → 打开 VersionForm 弹窗（编辑模式，预填数据）
6. 编辑完成 → 点"保存" → useMutation createVersion 或 updateVersion → 列表刷新
7. 点击"标记为稳定版" → 弹出确认对话框 → useMutation setStableVersion(versionId) → 列表更新（显示稳定标签）
8. 点击"删除" → 确认对话框 → useMutation deleteVersion(versionId)
9. 点击"查看日志" → 弹窗显示完整 Markdown 渲染的更新日志
10. 点击"设置强制更新" → 弹窗选择受影响的版本范围 → useMutation setForceUpdate(versionId, fromVersion)

**VersionForm 流程：**
1. 打开弹窗（新增/编辑）
2. 用户填表：
   - 输入版本号（如 0.2.15）
   - 选择平台（macOS arm64/x64 或 Windows）
   - 选择状态（草稿/发布/已停用）
   - 编辑更新日志（Markdown）
   - 输入下载链接（或从构建系统自动填充）
   - 切换强制更新开关
   - 输入最低系统版本（如 macOS 10.15）
3. 实时 Markdown 预览：右侧显示日志渲染效果
4. 提交前校验：
   - 版本号格式有效（语义化版本）
   - 必填字段完整
   - 下载链接有效（可选验证）
5. 点"保存" → 调用 createVersion 或 updateVersion → 成功关闭弹窗、列表刷新

## Integration

- **Services**：
  - `versionsService.getVersions(filters, page, limit)`：获取版本列表
  - `versionsService.getVersionDetail(versionId)`：获取版本详情
  - `versionsService.createVersion(data)`：新增版本
  - `versionsService.updateVersion(versionId, data)`：编辑版本
  - `versionsService.deleteVersion(versionId)`：删除版本
  - `versionsService.setStableVersion(versionId)`：标记为稳定版
  - `versionsService.setForceUpdate(versionId, fromVersion)`：设置强制更新范围
  - `versionsService.getUpdateFeed(platform, arch)`：获取自动更新 feed（yml 格式）

- **UI 组件**：
  - Table + TableBody：版本列表
  - Badge：状态标签、平台标签
  - Button：操作按钮（编辑、删除、标记稳定、设置强制更新）
  - Dialog/Modal：VersionForm、查看日志、确认对话框
  - MarkdownEditor：更新日志编辑
  - MarkdownPreview：实时预览

- **版本状态**：
  - 'draft'：草稿（不对外发布）
  - 'published'：已发布（用户可下载）
  - 'deprecated'：已停用（不再推荐，但仍可下载）

- **平台支持**：
  - `darwin-arm64`：macOS Apple Silicon
  - `darwin-x64`：macOS Intel
  - `win32-x64`：Windows x64

- **强制更新策略**：
  - 选择一个版本范围（如 < 0.2.10）
  - 该范围内用户检查更新时，强制更新到最新版本
  - 配置后自动注入到 update-feed yml 中

- **更新 Feed 格式**（auto-updater 读取）：
  ```yaml
  version: 0.2.15
  releaseDate: 2026-03-08
  files:
    - url: https://github.com/.../Cherry-Agent-0.2.15-arm64-mac.zip
      sha512: ...
      size: 150000000
  path: https://github.com/.../Cherry-Agent-0.2.15-arm64-mac.zip
  dmgUrl: https://your-cdn.example.com/Cherry-Agent-0.2.15-arm64.dmg
  ```

- **下载链接来源**：
  - COS（腾讯云）：DMG、EXE 主要分发源
  - GitHub Releases：备份存档
  - 自定义镜像站点（可选）

- **版本号语义化规范**：
  - MAJOR：重大功能变更或破坏性更新
  - MINOR：新增功能（向后兼容）
  - PATCH：bug 修复
  - 示例：0.2.15 表示 0 主版本、2 次版本、15 补丁版本
