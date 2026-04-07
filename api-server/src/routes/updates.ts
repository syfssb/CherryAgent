/**
 * 更新路由
 * 提供应用更新信息的 API 端点
 *
 * 功能:
 * - 版本查询和比较
 * - 三种更新策略支持 (silent/optional/forced)
 * - 多平台支持 (darwin/win32/linux)
 * - 多架构支持 (x64/arm64/ia32)
 * - 更新渠道支持 (stable/beta/alpha)
 * - 灰度发布支持
 * - 更新日志管理
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  getVersionInfo,
  compareVersions,
  getUpdateStrategy,
  isInStagingPercentage,
  type UpdateChannel,
} from '../config/update-config.js';

const router = Router();

// 请求参数验证
const checkUpdateSchema = z.object({
  platform: z.enum(['darwin', 'win32', 'linux']),
  arch: z.enum(['x64', 'arm64', 'ia32']).optional().default('x64'),
  currentVersion: z.string().regex(/^\d+\.\d+\.\d+(-.*)?$/, 'Invalid version format'),
  channel: z.enum(['stable', 'beta', 'alpha']).optional().default('stable'),
  userId: z.string().optional(), // 用于灰度发布
});

/**
 * GET /updates/latest
 * 获取最新版本信息
 *
 * 查询参数:
 * - platform: 平台 (darwin/win32/linux)
 * - arch: 架构 (x64/arm64/ia32)
 * - version: 当前版本号
 * - channel: 更新渠道 (stable/beta/alpha)
 * - userId: 用户ID (用于灰度发布)
 */
router.get('/latest', async (req: Request, res: Response) => {
  try {
    // 从查询参数获取平台和版本信息
    const result = checkUpdateSchema.safeParse({
      platform: req.query.platform || process.platform,
      arch: req.query.arch,
      currentVersion: req.query.version || req.query.currentVersion || '0.0.0',
      channel: req.query.channel,
      userId: req.query.userId,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: result.error.flatten(),
      });
    }

    const { platform, arch, currentVersion, channel, userId } = result.data;

    // 获取对应渠道的最新版本
    const latestInfo = getVersionInfo(channel);

    if (!latestInfo) {
      return res.status(404).json({
        success: false,
        error: `No updates available for channel: ${channel}`,
      });
    }

    // 检查灰度发布
    const stagingPercentage = latestInfo.stagingPercentage || 100;
    const inStaging = isInStagingPercentage(userId, stagingPercentage);

    if (!inStaging) {
      // 不在灰度范围内，返回当前版本
      return res.json({
        success: true,
        data: {
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          message: 'Not in staging rollout',
          stagingPercentage,
        },
      });
    }

    // 查找适合当前平台的下载文件
    const platformFile = latestInfo.files.find(
      (f) => f.platform === platform && f.arch === arch
    );

    // 检查是否有新版本
    const hasUpdate = compareVersions(latestInfo.version, currentVersion) > 0;

    // 确定更新策略
    const strategy = getUpdateStrategy(currentVersion, latestInfo);
    const forceUpdate = strategy === 'forced';

    return res.json({
      success: true,
      data: {
        hasUpdate,
        currentVersion,
        latestVersion: latestInfo.version,
        releaseDate: latestInfo.releaseDate,
        releaseNotes: latestInfo.releaseNotes,
        strategy,
        forceUpdate,
        downloadUrl: platformFile?.url || null,
        downloadSize: platformFile?.size || null,
        sha512: platformFile?.sha512 || null,
        changelog: hasUpdate ? latestInfo.changelog : [],
        supportedPlatform: !!platformFile,
        stagingPercentage,
        inStaging: true,
      },
    });
  } catch (error) {
    console.error('[updates] GET /latest failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /updates/changelog
 * 获取完整更新日志
 */
router.get('/changelog', async (req: Request, res: Response) => {
  try {
    const channel = (req.query.channel as UpdateChannel) || 'stable';
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const latestInfo = getVersionInfo(channel);

    if (!latestInfo) {
      return res.status(404).json({
        success: false,
        error: `No changelog available for channel: ${channel}`,
      });
    }

    const changelog = latestInfo.changelog?.slice(0, limit) || [];

    return res.json({
      success: true,
      data: {
        channel,
        changelog,
        total: latestInfo.changelog?.length || 0,
      },
    });
  } catch (error) {
    console.error('[updates] GET /changelog failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /updates/download/:platform/:arch
 * 获取特定平台的下载链接
 */
router.get(
  '/download/:platform/:arch',
  async (req: Request, res: Response) => {
    try {
      const { platform, arch } = req.params;
      const channel = (req.query.channel as UpdateChannel) || 'stable';

      // 验证平台和架构
      if (!['darwin', 'win32', 'linux'].includes(platform!)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid platform',
        });
      }

      if (!['x64', 'arm64', 'ia32'].includes(arch!)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid architecture',
        });
      }

      const latestInfo = getVersionInfo(channel);

      if (!latestInfo) {
        return res.status(404).json({
          success: false,
          error: `No release available for channel: ${channel}`,
        });
      }

      const file = latestInfo.files.find(
        (f) => f.platform === platform && f.arch === arch
      );

      if (!file) {
        return res.status(404).json({
          success: false,
          error: `No download available for ${platform}-${arch}`,
        });
      }

      return res.json({
        success: true,
        data: {
          version: latestInfo.version,
          platform,
          arch,
          url: file.url,
          size: file.size,
          sha512: file.sha512,
        },
      });
    } catch (error) {
      console.error('[updates] GET /download failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /updates/channels
 * 获取可用的更新渠道
 */
router.get('/channels', async (_req: Request, res: Response) => {
  try {
    const channels: UpdateChannel[] = ['stable', 'beta', 'alpha'];
    const channelInfo = channels
      .map((channel) => {
        const info = getVersionInfo(channel);
        if (!info) return null;
        return {
          name: channel,
          version: info.version,
          releaseDate: info.releaseDate,
          strategy: info.strategy,
          isEnabled: info.isEnabled !== false,
        };
      })
      .filter((c) => c !== null);

    return res.json({
      success: true,
      data: channelInfo,
    });
  } catch (error) {
    console.error('[updates] GET /channels failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export { router as updatesRouter };
