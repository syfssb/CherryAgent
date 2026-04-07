# src/pages/content/

## Responsibility

内容管理模块，维护公开展示的法律和信息页面。包括隐私政策、服务条款、关于我们、公告发布等功能。支持多语言编辑和 Markdown 内容。

## Design

- **多页面结构**：
  - `PrivacyPolicy.tsx`：隐私政策页面，Markdown 编辑、多语言支持
  - `TermsOfService.tsx`：服务条款页面，同上
  - `AboutUs.tsx`：关于我们页面，文本和图片编辑
  - `AnnouncementList.tsx`：公告管理，支持新增、编辑、发布、排序、多语言

- **PrivacyPolicy & TermsOfService 特性**：
  - Markdown 编辑器：支持语法高亮、实时预览
  - 多语言支持：中文、英文、日本语等
  - 发版历史：记录每次修改、修改人、修改时间
  - 自动保存：定时保存草稿
  - 版本对比：对比不同时间点的内容变化

- **AboutUs 特性**：
  - 文本编辑：公司简介、使命、愿景等
  - 图片上传：企业 Logo、团队照片等
  - 多语言：每个文本字段支持多语言
  - 格式化：支持文本加粗、链接等基础格式

- **AnnouncementList 特性**：
  - 分页（PAGE_SIZE = 20）
  - 筛选：类型（通知/警告/重要/紧急/维护/促销）、发布状态（已发布/未发布）
  - 搜索：标题或内容摘要
  - 行操作：编辑、删除、发布/下架、精选（置顶）、查看预览
  - 显示：标题、类型、发布状态、创建时间、浏览次数、操作
  - 拖拽排序：公告显示优先级（精选公告优先）

- **AnnouncementForm 弹窗**（新增/编辑）：
  - 标题（多语言 I18nEditor）
  - 内容（多语言 Markdown 编辑）
  - 类型：选择公告类型（颜色编码）
  - 发布状态：草稿/发布
  - 有效期：开始日期、结束日期（过期后不显示）
  - 精选开关：置顶优先级

- **状态管理**：
  - useQuery 加载内容和公告列表
  - useMutation 处理保存、发布、删除等操作
  - MarkdownEditor 管理编辑态
  - I18nEditor 管理多语言字段
  - queryClient.invalidateQueries 同步列表

## Flow

**PrivacyPolicy & TermsOfService 流程：**
1. 挂载 → useQuery 加载当前页面的 Markdown 内容
2. I18nEditor 显示多语言选项卡（中文、英文等）
3. 用户切换到某个语言选项卡 → 显示该语言的 Markdown 编辑器
4. 用户编辑内容 → 右侧实时预览 Markdown 渲染结果
5. 定时自动保存草稿（每 30 秒）→ localStorage 或后端草稿表
6. 用户修改完成 → 点"发布"按钮 → useMutation updateContent(pageId, i18nData) → 成功提示
7. 支持"查看历史" → 弹窗显示修改历史列表 → 点击历史项可对比当前版本
8. 支持"版本对比" → 显示两个版本的 diff（并排显示）

**AboutUs 流程：**
1. 挂载 → useQuery 加载"关于我们"数据（多语言文本、图片 URL）
2. 编辑流程：
   - I18nEditor 管理多语言文本：公司简介、使命、愿景
   - 图片上传：点"上传图片"按钮 → 文件选择 → 上传到 CDN/COS → 获取 URL
   - 多个图片字段可分别上传：Logo、团队照片等
3. 编辑完成 → 点"保存"按钮 → useMutation updateAboutUs(data) → 成功关闭
4. 预览：实时显示页面呈现效果

**AnnouncementList 流程：**
1. 挂载 → useQuery 加载公告列表（分页、类型筛选、发布状态筛选）
2. 用户搜索标题 → 防抖 → 重新查询
3. 点击筛选（类型、状态） → 重置 page=1 → 刷新
4. 点击"新增公告"按钮 → 打开 AnnouncementForm 弹窗（新增模式）
5. 点击公告行的"编辑"按钮 → 打开 AnnouncementForm 弹窗（编辑模式，预填数据）
6. 编辑完成 → 点"保存" → useMutation createAnnouncement 或 updateAnnouncement → 列表刷新
7. 点击"发布"按钮（对草稿） → useMutation publishAnnouncement(id) → 状态变为"已发布"
8. 点击"下架"按钮（对已发布） → useMutation unpublishAnnouncement(id) → 状态变为"未发布"
9. 点击"精选"按钮 → useMutation featuredAnnouncement(id) → 标记为精选 → 显示星标
10. 支持拖拽排序：拖拽公告行改变顺序 → useMutation reorderAnnouncements(ids) → 排序更新
11. 点击"删除" → 确认对话框 → useMutation deleteAnnouncement(id)

**AnnouncementForm 流程：**
1. 打开弹窗（新增/编辑）
2. 用户填表：
   - I18nEditor 填入标题（支持多语言）
   - 选择公告类型（颜色编码，不同类型展示不同样式）
   - Markdown 编辑器填入内容（支持多语言）
   - 设置有效期：开始日期、结束日期
   - 选择初始状态：草稿/发布
   - 切换"精选"开关（置顶优先级）
3. Markdown 实时预览：右侧显示渲染结果
4. 提交前校验：标题和内容必填（至少一种语言）
5. 点"保存" → useMutation 提交 → 成功关闭弹窗、列表刷新

## Integration

- **Services**：
  - `contentService.getPrivacyPolicy()`：获取隐私政策
  - `contentService.updatePrivacyPolicy(i18nData)`：更新隐私政策
  - `contentService.getTermsOfService()`：获取服务条款
  - `contentService.updateTermsOfService(i18nData)`：更新服务条款
  - `contentService.getAboutUs()`：获取关于我们
  - `contentService.updateAboutUs(data)`：更新关于我们
  - `contentService.getContentHistory(pageId)`：获取页面修改历史
  - `announcementsService.getAnnouncements(filters, page, limit)`：获取公告列表
  - `announcementsService.createAnnouncement(data)`：新增公告
  - `announcementsService.updateAnnouncement(id, data)`：编辑公告
  - `announcementsService.deleteAnnouncement(id)`：删除公告
  - `announcementsService.publishAnnouncement(id)`：发布公告
  - `announcementsService.unpublishAnnouncement(id)`：下架公告
  - `announcementsService.featuredAnnouncement(id, featured)`：精选/取消精选
  - `announcementsService.reorderAnnouncements(ids)`：排序公告
  - `uploadService.uploadImage(file)`：上传图片

- **UI 组件**：
  - MarkdownEditor + MarkdownPreview：编辑和预览
  - I18nEditor：多语言编辑（用于标题、描述）
  - Table + TableBody：公告列表
  - Badge：公告类型标签、发布状态标签
  - Button：操作按钮（编辑、删除、发布、精选）
  - Dialog/Modal：AnnouncementForm、版本对比、历史查看弹窗
  - Input：搜索框
  - DatePicker：有效期设置
  - FileUpload：图片上传

- **公告类型**（typeFilterOptions 和 getTypeBadge）：
  - `'info'` → '通知'（蓝色）
  - `'warning'` → '警告'（黄色）
  - `'important'` → '重要'（红色）
  - `'critical'` → '紧急'（深红）
  - `'maintenance'` → '维护'（灰色）
  - `'promotion'` → '促销'（绿色）

- **公告发布状态**：
  - `'draft'`：草稿（管理员可见，用户不可见）
  - `'published'`：已发布（用户可见）
  - `'expired'`：已过期（超过有效期后自动隐藏）

- **多语言内容格式**：
  - `titleI18n: { "zh": "...", "en": "...", "ja": "..." }`
  - `contentI18n: { "zh": "# 标题\n...", "en": "# Title\n..." }`
  - 前端渲染时根据用户语言选择对应版本

- **版本历史**：
  - 记录每次修改：修改者、修改时间、修改内容摘要
  - 支持版本对比：并排显示两个版本的差异
  - 支持回滚：恢复到历史版本（可选）

- **草稿自动保存**：
  - 定时保存（每 30 秒）
  - localStorage 本地存储（降低后端压力）
  - 或后端 draft_content 表存储

- **公告排序**：
  - 精选公告置顶
  - 非精选公告按创建时间倒序
  - 支持拖拽改变优先级
