/**
 * 公开 API - 公告路由
 *
 * 功能:
 * - GET /api/announcements                - 获取已发布的公告列表（不需要认证）
 * - GET /api/announcements/notifications  - 获取通知聚合数据（置顶 + 最近通知 + 未读数）
 * - GET /api/announcements/version        - 获取公告版本信息（用于客户端轮询）
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db/index.js';
import { successResponse } from '../utils/response.js';
import { resolveI18n, getLocaleFromQuery } from '../utils/i18n.js';

export const publicAnnouncementsRouter = Router();

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  type: string;
  publish_at: string | null;
  expires_at: string | null;
  sort_order: number;
  is_pinned: boolean;
  pinned_at: string | null;
  i18n: Record<string, Record<string, string>> | null;
}

/**
 * GET /api/announcements
 * 获取已发布且未过期的公告列表
 * 排序规则：置顶优先（按 pinned_at 降序），然后按 created_at 降序
 * 支持 ?lang=zh|zh-TW|ja 查询参数返回对应语言内容
 */
publicAnnouncementsRouter.get('/', async (req: Request, res: Response) => {
  const locale = getLocaleFromQuery(req.query as Record<string, unknown>);

  const result = await pool.query(
    `SELECT id, title, content, type, publish_at, expires_at, sort_order,
            is_pinned, pinned_at, i18n
     FROM announcements
     WHERE is_published = true
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY is_pinned DESC, pinned_at DESC NULLS LAST, created_at DESC
     LIMIT 50`,
  );

  const announcements = (result.rows as AnnouncementRow[]).map((row) => {
    const localized = resolveI18n(row.i18n, locale, {
      title: row.title,
      content: row.content,
    });
    return {
      id: row.id,
      title: localized.title,
      content: localized.content,
      type: row.type,
      isPinned: row.is_pinned ?? false,
      pinnedAt: row.pinned_at,
      publishedAt: row.publish_at,
      expiresAt: row.expires_at,
    };
  });

  res.json(successResponse({ announcements }));
});

/**
 * GET /api/announcements/notifications
 * 返回通知聚合数据：置顶公告 + 最近24小时非置顶通知 + 未读数量
 * 支持 ?lang=zh|zh-TW|ja 查询参数
 */
publicAnnouncementsRouter.get('/notifications', async (req: Request, res: Response) => {
  const locale = getLocaleFromQuery(req.query as Record<string, unknown>);

  // 查询置顶公告
  const pinnedResult = await pool.query(
    `SELECT id, title, content, type, publish_at, expires_at, is_pinned, pinned_at, i18n
     FROM announcements
     WHERE is_published = true
       AND is_pinned = true
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY pinned_at DESC
     LIMIT 10`,
  );

  const pinned = (pinnedResult.rows as AnnouncementRow[]).map((row) => {
    const localized = resolveI18n(row.i18n, locale, {
      title: row.title,
      content: row.content,
    });
    return {
      id: row.id,
      title: localized.title,
      content: localized.content,
      type: row.type,
      isPinned: true,
      pinnedAt: row.pinned_at,
      publishedAt: row.publish_at,
      expiresAt: row.expires_at,
    };
  });

  // 查询最近24小时内的非置顶通知（只返回摘要字段）
  const recentResult = await pool.query(
    `SELECT id, title, created_at, i18n
     FROM announcements
     WHERE is_published = true
       AND (is_pinned = false OR is_pinned IS NULL)
       AND (expires_at IS NULL OR expires_at > NOW())
       AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT 20`,
  );

  interface RecentRow {
    id: string;
    title: string;
    created_at: string;
    i18n: Record<string, Record<string, string>> | null;
  }

  const recent = (recentResult.rows as RecentRow[]).map((row) => {
    const localized = resolveI18n(row.i18n, locale, {
      title: row.title,
    });
    return {
      id: row.id,
      title: localized.title,
      createdAt: row.created_at,
    };
  });

  // 未读数量 = 最近24小时内的非置顶通知数
  const unreadCount = recent.length;

  res.json(successResponse({
    pinned,
    recent,
    unreadCount,
  }));
});

/**
 * GET /api/announcements/version
 * 返回公告的版本摘要（最后更新时间 + 数量），供客户端轮询判断是否需要刷新
 */
publicAnnouncementsRouter.get('/version', async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT MAX(updated_at) as last_updated, COUNT(*) as count
     FROM announcements
     WHERE is_published = true
       AND (expires_at IS NULL OR expires_at > NOW())`,
  );

  const row = result.rows[0] as { last_updated: string | null; count: string };

  res.json(successResponse({
    lastUpdated: row.last_updated,
    count: parseInt(row.count, 10),
  }));
});

export default publicAnnouncementsRouter;
