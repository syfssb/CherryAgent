import type { SessionStore, Tag } from "./session-store.js";

/**
 * 标签使用统计信息
 */
export type TagUsageStats = {
  tagId: string;
  count: number;
};

/**
 * 标签管理存储类
 * 封装对 SessionStore 标签功能的访问，并提供额外的统计功能
 */
export class TagsStore {
  private sessionStore: SessionStore;

  constructor(sessionStore: SessionStore) {
    this.sessionStore = sessionStore;
  }

  /**
   * 创建新标签
   * @param name 标签名称
   * @param color 标签颜色（十六进制格式）
   */
  createTag(name: string, color: string): Tag {
    return this.sessionStore.createTag(name, color);
  }

  /**
   * 获取所有标签
   */
  getAllTags(): Tag[] {
    return this.sessionStore.getAllTags();
  }

  /**
   * 更新标签
   * @param id 标签 ID
   * @param updates 更新的字段
   */
  updateTag(id: string, updates: { name?: string; color?: string }): Tag | null {
    return this.sessionStore.updateTag(id, updates);
  }

  /**
   * 删除标签
   * @param id 标签 ID
   */
  deleteTag(id: string): boolean {
    return this.sessionStore.deleteTag(id);
  }

  /**
   * 获取标签使用次数
   * @param id 标签 ID
   * @returns 使用该标签的会话数量
   */
  getTagUsageCount(id: string): number {
    const sessions = this.sessionStore.getSessionsByTag(id);
    return sessions.length;
  }

  /**
   * 获取所有标签的使用统计
   * @returns 每个标签的使用统计
   */
  getAllTagUsageStats(): TagUsageStats[] {
    const tags = this.getAllTags();
    return tags.map((tag) => ({
      tagId: tag.id,
      count: this.getTagUsageCount(tag.id)
    }));
  }

  /**
   * 获取带有使用次数的标签列表
   */
  getTagsWithUsageCount(): Array<Tag & { usageCount: number }> {
    const tags = this.getAllTags();
    return tags.map((tag) => ({
      ...tag,
      usageCount: this.getTagUsageCount(tag.id)
    }));
  }

  /**
   * 为会话添加标签
   */
  addTagToSession(sessionId: string, tagId: string): void {
    this.sessionStore.addTag(sessionId, tagId);
  }

  /**
   * 从会话移除标签
   */
  removeTagFromSession(sessionId: string, tagId: string): void {
    this.sessionStore.removeTag(sessionId, tagId);
  }

  /**
   * 获取会话的所有标签
   */
  getSessionTags(sessionId: string): Tag[] {
    return this.sessionStore.getSessionTags(sessionId);
  }

  /**
   * 检查标签名称是否已存在
   * @param name 标签名称
   * @param excludeId 排除的标签 ID（用于编辑时检查）
   */
  isTagNameExists(name: string, excludeId?: string): boolean {
    const tags = this.getAllTags();
    return tags.some(
      (tag) => tag.name.toLowerCase() === name.toLowerCase() && tag.id !== excludeId
    );
  }
}
