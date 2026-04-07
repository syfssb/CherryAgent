import { BrowserWindow, Notification } from "electron";
import { getIconPath } from "../pathResolver.js";
import { syncRemotePresetSkills } from "./preset-skills-installer.js";
import { getApiOriginBaseUrl } from "./runtime-config.js";

/**
 * 公告数据结构（与 API 返回一致）
 */
interface PolledAnnouncement {
  id: string;
  title: string;
  content: string;
  type: string;
  isPublished?: boolean;
  publishedAt: string | null;
}

/**
 * 去除 Markdown 标记，返回纯文本
 */
function stripMarkdown(md: string): string {
  return md
    .replace(/!\[.*?\]\(.*?\)/g, "")       // 图片
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")  // 链接 -> 文字
    .replace(/#{1,6}\s+/g, "")              // 标题
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, "$2") // 加粗/斜体
    .replace(/`{1,3}[^`]*`{1,3}/g, "")     // 行内代码/代码块
    .replace(/^>\s+/gm, "")                 // 引用
    .replace(/^[-*+]\s+/gm, "")            // 无序列表
    .replace(/^\d+\.\s+/gm, "")            // 有序列表
    .replace(/\n{2,}/g, "\n")              // 多余空行
    .trim();
}

/**
 * 内容轮询管理器
 * 定期检查公告和技能的更新版本
 * 检测到新公告时发送系统原生通知
 */
export class ContentPoller {
  private announcementTimer: ReturnType<typeof setInterval> | null = null;
  private skillTimer: ReturnType<typeof setInterval> | null = null;
  private lastAnnouncementVersion: string | null = null;
  private lastSkillVersion: string | null = null;

  /** 已知的公告 ID 集合（首次加载 + 后续轮询累积） */
  private knownAnnouncementIds = new Set<string>();
  /** 是否完成了首次公告加载（首次不发通知） */
  private initialAnnouncementLoadDone = false;

  private readonly ANNOUNCEMENT_INTERVAL = 3 * 60 * 1000; // 3 分钟
  private readonly SKILL_INTERVAL = 2 * 60 * 60 * 1000;   // 2 小时

  private getApiOrigin(): string {
    return getApiOriginBaseUrl();
  }

  start(): void {
    // 先立即检查一次
    this.checkAnnouncementUpdates().catch(() => {});
    this.checkSkillUpdates().catch(() => {});

    // 然后定时轮询
    this.announcementTimer = setInterval(
      () => this.checkAnnouncementUpdates().catch(() => {}),
      this.ANNOUNCEMENT_INTERVAL
    );
    this.skillTimer = setInterval(
      () => this.checkSkillUpdates().catch(() => {}),
      this.SKILL_INTERVAL
    );
    console.log("[content-poller] Started polling");
  }

  stop(): void {
    if (this.announcementTimer) clearInterval(this.announcementTimer);
    if (this.skillTimer) clearInterval(this.skillTimer);
    this.announcementTimer = null;
    this.skillTimer = null;
    console.log("[content-poller] Stopped polling");
  }

  /**
   * 从 API 获取当前已发布的公告列表
   */
  private async fetchAnnouncements(): Promise<PolledAnnouncement[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(
        `${this.getApiOrigin()}/api/announcements`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!response.ok) return [];
      const data = await response.json();
      const list: PolledAnnouncement[] = data.data?.announcements ?? [];
      return list;
    } catch {
      clearTimeout(timeout);
      return [];
    }
  }

  /**
   * 对新增公告发送系统原生通知
   */
  private showNativeNotification(announcement: PolledAnnouncement): void {
    if (!Notification.isSupported()) return;

    const body = announcement.content
      ? stripMarkdown(announcement.content).slice(0, 200)
      : "";

    let iconPath: string | undefined;
    try {
      iconPath = getIconPath();
    } catch {
      // 图标获取失败不影响通知
    }

    const notification = new Notification({
      title: announcement.title,
      body,
      ...(iconPath ? { icon: iconPath } : {}),
    });

    notification.on("click", () => {
      // 聚焦主窗口并通知前端打开通知面板
      const windows = BrowserWindow.getAllWindows();
      const target = windows[0];
      if (target && !target.isDestroyed()) {
        if (target.isMinimized()) target.restore();
        target.show();
        target.focus();
        target.webContents.send("open-notification-panel");
      }
    });

    notification.show();
    console.log("[content-poller] Native notification sent:", announcement.id, announcement.title);
  }

  private async checkAnnouncementUpdates(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(
        `${this.getApiOrigin()}/api/announcements/version`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!response.ok) return;
      const data = await response.json();
      const version = data.data?.lastUpdated;

      // 版本发生变化（或首次加载）时，拉取完整公告列表
      const versionChanged = version && this.lastAnnouncementVersion && version !== this.lastAnnouncementVersion;
      const isFirstLoad = !this.initialAnnouncementLoadDone;

      if (isFirstLoad || versionChanged) {
        const announcements = await this.fetchAnnouncements();

        if (isFirstLoad) {
          // 首次加载：记录所有已有公告 ID，不发通知
          for (const a of announcements) {
            this.knownAnnouncementIds.add(a.id);
          }
          this.initialAnnouncementLoadDone = true;
        } else {
          // 后续轮询：找出新增公告并发送系统通知
          const newAnnouncements = announcements.filter(
            (a) => !this.knownAnnouncementIds.has(a.id)
          );

          for (const a of newAnnouncements) {
            this.knownAnnouncementIds.add(a.id);
            this.showNativeNotification(a);
          }
        }

        if (versionChanged) {
          console.log("[content-poller] Announcements updated:", version);
          this.broadcastToRenderers("content:announcements-updated");
        }
      }

      this.lastAnnouncementVersion = version;
    } catch {
      // 静默失败，不影响应用运行
    }
  }

  private async checkSkillUpdates(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(
        `${this.getApiOrigin()}/api/skills/version`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!response.ok) return;
      const data = await response.json();
      const version = data.data?.lastUpdated;

      if (version && this.lastSkillVersion && version !== this.lastSkillVersion) {
        console.log("[content-poller] Skills updated:", version);
        this.broadcastToRenderers("content:skills-updated");
        // 技能更新时触发远程同步
        syncRemotePresetSkills().catch(() => {});
      }
      this.lastSkillVersion = version;
    } catch {
      // 静默失败
    }
  }

  private broadcastToRenderers(channel: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel);
      }
    }
  }
}
