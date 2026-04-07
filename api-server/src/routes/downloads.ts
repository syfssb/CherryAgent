import { Router } from 'express';
import { resolve, basename } from 'path';
import { existsSync } from 'fs';

const router = Router();

// 下载页面 - 返回可用的安装包列表
router.get('/', (_req, res) => {
  const downloads = [
    {
      platform: 'mac-arm64',
      name: 'Cherry Agent (Mac Apple Silicon)',
      file: 'Cherry-Agent-0.2.0-arm64.dmg',
      size: '~150 MB',
    },
    {
      platform: 'mac-x64',
      name: 'Cherry Agent (Mac Intel)',
      file: 'Cherry-Agent-0.2.0-x64.dmg',
      size: '~150 MB',
    },
    {
      platform: 'windows',
      name: 'Cherry Agent (Windows 安装版)',
      file: 'Cherry-Agent-Setup-0.2.0.exe',
      size: '~120 MB',
    },
    {
      platform: 'windows-portable',
      name: 'Cherry Agent (Windows 便携版)',
      file: 'Cherry-Agent-0.2.0.exe',
      size: '~120 MB',
    },
  ];

  res.json({
    success: true,
    data: {
      version: '0.2.0',
      downloads,
    },
  });
});

// 下载文件
router.get('/:filename', (req, res) => {
  const { filename } = req.params;

  if (!filename) {
    res.status(400).json({
      success: false,
      error: '文件名不能为空',
    });
    return;
  }

  // 只取文件名部分，拒绝任何路径分隔符
  const safeName = basename(filename);
  if (!safeName || safeName !== filename) {
    res.status(400).json({
      success: false,
      error: '非法文件名',
    });
    return;
  }

  const downloadsDir = resolve(process.cwd(), 'public/downloads');
  const filePath = resolve(downloadsDir, safeName);

  // 确保解析后的路径仍在允许目录内，防止路径穿越
  if (!filePath.startsWith(downloadsDir + '/') && filePath !== downloadsDir) {
    res.status(403).json({
      success: false,
      error: '访问被拒绝',
    });
    return;
  }

  if (!existsSync(filePath)) {
    res.status(404).json({
      success: false,
      error: '文件不存在',
    });
    return;
  }

  res.download(filePath);
});

export default router;
