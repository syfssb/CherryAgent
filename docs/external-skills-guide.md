# 外部 Skill 自动抓取功能使用指南

## 功能概述

从 Vercel Labs skills 生态系统（GitHub 仓库）自动抓取优质 skills，导入到 Cherry Agent 系统。

## 数据源

默认从以下仓库抓取：
- `vercel-labs/skills` - Vercel Labs 官方 skills
- `anthropics/anthropic-quickstarts` - Anthropic 官方 skills

## API 端点

### 1. 抓取外部 skills

```bash
POST /api/admin/external-skills/fetch
```

**请求体**（可选）：
```json
{
  "repos": [
    {
      "owner": "vercel-labs",
      "repo": "skills",
      "skillsPath": "skills"
    }
  ]
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "message": "成功抓取 X 个 skills",
    "inserted": 10,
    "skipped": 2,
    "total": 12
  }
}
```

### 2. 获取外部 skills 列表

```bash
GET /api/admin/external-skills?status=pending&page=1&limit=20
```

**查询参数**：
- `status`: pending | approved | rejected | imported
- `source`: vercel-labs | anthropics | custom
- `page`: 页码
- `limit`: 每页数量

### 3. 导入 skill 到 preset_skills

```bash
POST /api/admin/external-skills/:id/import
```

**请求体**：
```json
{
  "isDefault": true
}
```

### 4. 更新 skill 状态

```bash
PATCH /api/admin/external-skills/:id/status
```

**请求体**：
```json
{
  "status": "approved"
}
```

### 5. 删除外部 skill

```bash
DELETE /api/admin/external-skills/:id
```

## 工作流程

```
1. 抓取外部 skills
   POST /api/admin/external-skills/fetch
   ↓
2. 查看待审核的 skills
   GET /api/admin/external-skills?status=pending
   ↓
3. 审核并标记状态
   PATCH /api/admin/external-skills/:id/status
   ↓
4. 导入到 preset_skills
   POST /api/admin/external-skills/:id/import
   ↓
5. 桌面端自动同步
   现有的 syncRemotePresetSkills() 机制
```

## 定时任务（可选）

可以添加 cron job 每天自动抓取：

```typescript
// api-server/src/jobs/fetch-skills.ts
import { CronJob } from 'cron';
import { fetchSkillsFromMultipleRepos, DEFAULT_SKILL_REPOS } from '../services/github-skills-fetcher.js';

// 每天凌晨 2 点执行
const job = new CronJob('0 2 * * *', async () => {
  console.log('[cron] 开始抓取外部 skills...');
  const skills = await fetchSkillsFromMultipleRepos(DEFAULT_SKILL_REPOS);
  // 存储到数据库...
});

job.start();
```

## 数据库表结构

```sql
external_skills
├── id (UUID)
├── source (VARCHAR) - 来源标识
├── repo_url (TEXT) - GitHub 仓库 URL
├── skill_slug (VARCHAR) - skill 目录名
├── name (VARCHAR) - skill 名称
├── description (TEXT) - 描述
├── category (VARCHAR) - 分类
├── skill_content (TEXT) - 完整的 SKILL.md 内容
├── icon (VARCHAR) - 图标
├── version (VARCHAR) - 版本
├── status (VARCHAR) - pending | approved | rejected | imported
├── imported_to_preset_id (UUID) - 导入后的 preset_skills.id
├── metadata (JSONB) - 额外元数据
├── fetched_at (TIMESTAMP) - 抓取时间
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

## 测试脚本

```bash
# 测试 GitHub fetcher
bun run scripts/test-github-fetcher.ts

# 执行 migration
bun run scripts/run-migration.ts src/db/migrations/0033_external_skills.sql
```

## 已实现的功能

✅ GitHub API 集成
✅ SKILL.md 解析器
✅ 数据库表和 migration
✅ 管理后台 API 路由
✅ 批量抓取功能
✅ 导入到 preset_skills
✅ 状态管理（pending/approved/rejected/imported）

## 下一步

1. 在后台管理前端添加 "Skill 市场" 页面
2. 添加定时任务自动抓取
3. 添加更多数据源（社区仓库）
