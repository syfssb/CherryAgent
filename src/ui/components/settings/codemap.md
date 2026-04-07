# src/ui/components/settings/

设置面板，管理云同步、数据导入导出、用户偏好。

## Responsibility

- **云同步** (`CloudSync`)：启用/禁用同步、手动触发同步、同步冲突解决、同步历史查看、同步配置（间隔、内容、策略）
- **数据管理** (`DataManagement`)：导出本地数据（会话、记忆、技能、设置）为 JSON、导入备份文件并支持合并/覆盖模式

## Design

### 核心模式

1. **Zustand 同步状态管理** (`useSyncStore`)
   - 同步状态：`idle` / `syncing` / `success` / `error` / `conflict`
   - 配置选项：自动同步间隔、同步内容（会话/记忆/技能/设置）、冲突解决策略
   - 主进程镜像：进入页面时通过 preload 拉取主进程 `sync:getConfig` / `sync:getStatus`
   - 进度追踪：当前进度百分比、消息提示
   - 冲突管理：冲突列表、单个/批量解决
   - 历史记录：同步结果（时间戳、上传/下载数、错误信息）

2. **数据导出架构**
   - 触发：用户在 `DataManagement` 选择导出类型
   - 执行：IPC `data:exportSimple()` 调用 Electron 主进程
   - 格式：JSON 文件，结构为 `{ version, exportedAt, data }`；当勾选会话时会额外带出 `messages / tags / sessionTags`
   - 下载：前端创建 Blob + `Object.createObjectURL()` + 虚拟 `<a>` 标签触发下载

3. **数据导入流程**
   - 文件选择：用户选择 `.json` 备份文件
   - 预览确认：显示文件信息、导入模式（合并/覆盖）、数据类型勾选
   - 导入执行：调用 IPC `data:importSimple`，主进程转换为标准 `.cowork-export` 归档后复用现有导入器
   - 结果反馈：成功导入数量、错误列表、成功/失败对话框

4. **冲突解决策略**
   ```
   冲突场景：本地和远程都修改了同一条数据
   
   解决策略（configurable）：
   - 'ask'：询问用户（弹对话框选择本地或远程）
   - 'local'：总是保留本地版本
   - 'remote'：总是保留远程版本
   - 'newest'：比较时间戳，保留最新修改
   ```

## Flow

### 云同步启用流程

```
1. 用户在 Settings → CloudSync 打开开关
2. CloudSync 调用 useSyncStore.enableSync()
3. useSyncStore 通过 preload 同步 accessToken → `sync:setAccessToken`
4. useSyncStore 推送当前 UI 配置 → `sync:updateConfig`
5. 主进程 `sync:enable` 启用 autoSync 并启动定时器
6. CloudSync 用 `sync:getStatus` 回填 UI 状态
```

### 手动同步流程

```
1. 用户点击 CloudSync 中的"立即同步"按钮
2. CloudSync 调用 useSyncStore.sync()
3. useSyncStore 状态变为 'syncing'
4. Electron IPC `sync:sync`
   - 主进程根据本地变更集执行上传 / 下载 / 冲突检测
   - 冲突列表通过 `sync:getConflicts` 回传渲染进程
5. 后端返回：
   {
     status: 'success' | 'conflict',
     uploaded: { sessions: 5, memories: 2, ... },
     downloaded: { sessions: 3, ... },
     conflicts: [{ id, type, localVersion, remoteVersion }]
   }
6. 前端更新 store：
   - status → 'success' 或 'conflict'
   - syncProgress 显示完成百分比
   - 如果有冲突，弹出 ConflictList 对话框
7. 用户选择冲突解决方案
   ├─ useSyncStore.resolveConflict(conflictId, 'local' | 'remote')
   ├─ Electron IPC `sync:resolveConflict`
   └─ 前端刷新本地数据
8. 同步完成 → 更新 lastSyncTime、添加到 history
```

### 数据导出流程

```
1. 用户在 DataManagement 勾选导出项：
   ☑ Sessions  ☑ Memories  ☑ Skills  ☑ Settings
2. 点击"导出数据"按钮
3. DataManagement 调用 window.electron?.data?.exportSimple()
   ↓
   Electron 主进程：
   - 查询数据库所有数据（SQLite）
   - 序列化为 JSON
   - 返回 { version, exportedAt, data }
4. 前端过滤选中的数据类型：
   const exportData = {
     version: "1.0",
     exportedAt: "2026-03-08T10:30:00Z",
     data: {
       sessions: [...],       // 如果勾选
       messages: [...],       // 会话勾选时一并导出
       tags: [...],
       sessionTags: [...],
       memories: undefined,   // 如果未勾选
       skills: [...],
       settings: {...}
     }
   }
5. 创建 Blob + Object.createObjectURL
6. 创建虚拟 <a> 标签，设置 href + download 属性
7. 触发 click() → 浏览器下载 `cherry-agent-backup-2026-03-08.json`
```

### 数据导入流程

```
1. 用户点击"导入数据"按钮 → 打开文件选择器
2. 选择 .json 备份文件 → DataManagement 显示导入对话框
   ├─ 文件信息（名称、大小）
   ├─ 导入模式单选：
      ○ 合并（保留现有数据，补充新数据；重复 ID 保留本地版本）
      ○ 覆盖（清空现有数据，全部用导入数据替换）
   ├─ 导入内容勾选（可选导入部分数据）
   └─ 覆盖模式有红色警告提示
3. 用户点击"导入"按钮
4. 前端读取文件内容 → JSON.parse()
5. 调用 window.electron?.data?.importSimple?.(data, options)
   ↓
   Electron 主进程：
   - 将简单 JSON 备份转换为标准归档（manifest + sessions/messages/...）
   - 复用 `data-import.ts` 的 merge / overwrite 导入逻辑
   - 返回真实导入统计和 warnings
7. 前端显示导入结果对话框：
   ✓ 成功导入
   └─ Sessions: 5
   └─ Memories: 12
   └─ Skills: 3
   └─ Settings: OK
8. 用户确认 → 关闭对话框，应用内容已更新
```

## Integration

### 依赖

- **Stores**：
  - `useSyncStore` — 同步状态管理
  - `useAuthStore` — 获取用户 ID、accessToken

- **Electron IPC**：
  - `sync:getConfig` / `sync:getStatus` — 初始化同步状态
  - `sync:enable` / `sync:disable` — 切换自动同步
  - `sync:updateConfig` / `sync:setAccessToken` — 同步配置与认证
  - `sync:sync` — 触发同步请求
  - `data:exportSimple()` — 导出数据
  - `data:importSimple(data, options)` — 导入简单 JSON 备份

- **UI 库**：
  - `Button`, `Dialog`, `Toggle`, `Select` 组件
  - `useTranslation()` 国际化
  - `cn()` 样式工具

- **第三方库**：
  - `driver.js` — onboarding 导览（在 onboarding 组件中使用）

### 被依赖

- **Settings 页面**：`<CloudSync>` + `<DataManagement>` 作为设置子面板
- **Sidebar** / **Header**：可能有"设置"菜单入口
- **Electron 主进程** (`agent-runner/`, `ipc-handlers.ts`)：实现数据导出导入 IPC handler

### 关键接口

```typescript
// useSyncStore 核心状态
interface SyncState {
  // 静态配置
  syncEnabled: boolean
  config: SyncConfig

  // 动态状态
  syncStatus: 'idle' | 'syncing' | 'success' | 'error' | 'conflict'
  syncProgress: ProgressInfo | null
  lastSyncTime: number | null
  lastSyncError: string | null
  conflicts: SyncConflict[]
  history: SyncHistoryItem[]

  // 操作
  initialize: () => Promise<void>
  enableSync: () => Promise<void>
  disableSync: () => Promise<void>
  sync: () => Promise<void>
  cancelSync: () => void
  setConfig: (config: Partial<SyncConfig>) => Promise<void>
  resolveConflict: (conflictId: string, resolution: 'local' | 'remote') => Promise<void>
  resolveAllConflicts: (resolution: 'local' | 'remote') => Promise<void>
  clearHistory: () => void
}

// 同步配置
interface SyncConfig {
  autoSyncInterval: number           // 分钟，1/5/15/30/60
  syncSessions: boolean
  syncMemories: boolean
  syncSkills: boolean
  syncSettings: boolean
  conflictResolution: 'ask' | 'local' | 'remote' | 'newest'
}

// 同步冲突
interface SyncConflict {
  id: string
  type: 'session' | 'memory' | 'skill' | 'setting'
  localVersion: { updatedAt: number, data: any }
  remoteVersion: { updatedAt: number, data: any }
}

// 同步历史项
interface SyncHistoryItem {
  id: string
  syncedAt: number
  duration: number                   // 毫秒
  status: 'success' | 'partial' | 'failed'
  uploaded: number
  downloaded: number
  conflicts: number
  error?: string
}

// 导出数据格式
interface ExportData {
  version: string
  exportedAt: string
  data: {
    sessions?: SessionData[]
    memories?: MemoryData[]
    skills?: SkillData[]
    settings?: SettingsData
  }
}

// 导入选项
interface ImportOptions {
  mode: 'merge' | 'overwrite'
  sessions: boolean
  memories: boolean
  skills: boolean
  settings: boolean
}

// 导入结果
interface ImportResult {
  success: boolean
  imported: {
    sessions: number
    memories: number
    skills: number
    settings: boolean
  }
  errors: string[]
}
```

### 文件清单

| 文件 | 职责 | 关键导出 |
|------|------|--------|
| `CloudSync.tsx` | 云同步面板（启用/禁用、手动同步、冲突解决、历史查看） | `CloudSync`, `type CloudSyncProps` |
| `DataManagement.tsx` | 数据导出导入面板（文件选择、导入模式、进度显示） | `DataManagement`, `type DataManagementProps` |
| `index.ts` | Barrel export | 所有组件和类型 |

## 关键 Bug 修复历史

1. **冲突解决对话框不显示**（未记录）
   - 根因：`ConflictList` 组件导入路径错误或组件未导出
   - 修复：检查 `src/ui/components/sync/ConflictList.tsx` 是否存在并正确导出

2. **同步轮询持续占用内存**（未记录）
   - 根因：取消同步后定时器未被清除
   - 修复：`useSyncStore` cleanup 逻辑确保 `clearTimeout()` 被调用

3. **导入大文件导致 UI 冻结**（未记录）
   - 根因：JSON.parse() 同步执行，大文件需时间
   - 修复：使用 Web Worker 或异步分块处理大文件导入

4. **导出文件名含时间戳失败**（v0.2.x 可能存在）
   - 根因：某些浏览器不支持特殊字符
   - 修复：统一使用 `YYYY-MM-DD` 格式（如 `cherry-agent-backup-2026-03-08.json`）
