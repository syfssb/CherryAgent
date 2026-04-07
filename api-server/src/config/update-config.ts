/**
 * 更新配置
 * 管理应用版本和更新策略
 *
 * 在生产环境中，这些数据应该存储在数据库中
 * 这里作为配置文件示例，演示如何管理版本信息
 */

// 平台类型
export type Platform = 'darwin' | 'win32' | 'linux';
export type Arch = 'x64' | 'arm64' | 'ia32';

// 更新策略
export type UpdateStrategy = 'silent' | 'optional' | 'forced';

// 更新渠道
export type UpdateChannel = 'stable' | 'beta' | 'alpha';

// 更新文件信息
export interface UpdateFile {
  platform: Platform;
  arch: Arch;
  url: string;
  sha512?: string;
  size?: number;
  signature?: string; // 用于 macOS 代码签名验证
}

// 更新日志条目
export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement' | 'breaking' | 'security';
    description: string;
  }[];
}

// 版本信息
export interface VersionInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  minimumVersion?: string; // 最低支持版本，低于此版本必须强制更新
  strategy: UpdateStrategy;
  files: UpdateFile[];
  changelog?: ChangelogEntry[];
  stagingPercentage?: number; // 灰度发布百分比 (0-100)
  isEnabled?: boolean; // 是否启用此版本
}

// 渠道配置
export type ChannelConfig = Record<UpdateChannel, VersionInfo>;

/**
 * 版本配置
 * 实际生产环境中应该从数据库或 CMS 读取
 */
export const VERSION_CONFIG: ChannelConfig = {
  // 稳定版
  stable: {
    version: '0.2.0',
    releaseDate: '2025-01-29T00:00:00Z',
    releaseNotes: '新版本包含多项改进和修复',
    minimumVersion: '0.1.0',
    strategy: 'optional',
    isEnabled: true,
    stagingPercentage: 100, // 100% 表示全量发布
    files: [
      {
        platform: 'darwin',
        arch: 'arm64',
        url: 'https://your-cdn.example.com/Cherry-Agent-0.2.0-arm64.dmg',
        size: 85000000,
        sha512: 'placeholder-sha512-hash',
      },
      {
        platform: 'darwin',
        arch: 'x64',
        url: 'https://your-cdn.example.com/Cherry-Agent-0.2.0.dmg',
        size: 88000000,
        sha512: 'placeholder-sha512-hash',
      },
      {
        platform: 'win32',
        arch: 'x64',
        url: 'https://your-cdn.example.com/Cherry-Agent-Setup-0.2.0.exe',
        size: 75000000,
        sha512: 'placeholder-sha512-hash',
      },
      {
        platform: 'linux',
        arch: 'x64',
        url: 'https://your-cdn.example.com/Cherry-Agent-0.2.0.AppImage',
        size: 90000000,
        sha512: 'placeholder-sha512-hash',
      },
    ],
    changelog: [
      {
        version: '0.2.0',
        date: '2025-01-29',
        changes: [
          { type: 'feature', description: '新增自动更新功能，支持静默/可选/强制三种更新策略' },
          { type: 'feature', description: '新增多语言支持 (中文/英文)' },
          { type: 'feature', description: '新增主题切换功能 (浅色/深色)' },
          { type: 'improvement', description: '优化会话管理性能，减少 30% 内存占用' },
          { type: 'improvement', description: '改进工具调用响应速度' },
          { type: 'fix', description: '修复内存泄漏问题' },
          { type: 'fix', description: '修复 Windows 平台快捷键冲突' },
          { type: 'security', description: '升级依赖包，修复安全漏洞' },
        ],
      },
      {
        version: '0.1.0',
        date: '2025-01-20',
        changes: [
          { type: 'feature', description: '首次发布' },
          { type: 'feature', description: '基础会话功能' },
          { type: 'feature', description: '工具调用支持' },
          { type: 'feature', description: '会话历史管理' },
        ],
      },
    ],
  },

  // Beta 测试版
  beta: {
    version: '0.3.0-beta.1',
    releaseDate: '2025-01-28T00:00:00Z',
    releaseNotes: 'Beta 测试版本 - 包含实验性功能',
    strategy: 'optional',
    isEnabled: true,
    stagingPercentage: 50, // 50% 灰度发布
    files: [
      {
        platform: 'darwin',
        arch: 'arm64',
        url: 'https://releases.example.com/beta/cherry-agent-0.3.0-beta.1-arm64.dmg',
        size: 86000000,
      },
      {
        platform: 'darwin',
        arch: 'x64',
        url: 'https://releases.example.com/beta/cherry-agent-0.3.0-beta.1-x64.dmg',
        size: 89000000,
      },
      {
        platform: 'win32',
        arch: 'x64',
        url: 'https://releases.example.com/beta/cherry-agent-0.3.0-beta.1-x64.exe',
        size: 76000000,
      },
      {
        platform: 'linux',
        arch: 'x64',
        url: 'https://releases.example.com/beta/cherry-agent-0.3.0-beta.1-x64.AppImage',
        size: 91000000,
      },
    ],
    changelog: [
      {
        version: '0.3.0-beta.1',
        date: '2025-01-28',
        changes: [
          { type: 'feature', description: '实验性功能：AI 智能建议' },
          { type: 'feature', description: '实验性功能：自动代码审查' },
          { type: 'improvement', description: '改进消息流式传输性能' },
          { type: 'improvement', description: '优化 UI 响应速度' },
          { type: 'fix', description: '修复 Beta 已知问题' },
        ],
      },
    ],
  },

  // Alpha 内测版
  alpha: {
    version: '0.4.0-alpha.1',
    releaseDate: '2025-01-25T00:00:00Z',
    releaseNotes: 'Alpha 内测版本 - 仅供内部测试',
    strategy: 'optional',
    isEnabled: false, // 默认禁用，仅内部开启
    stagingPercentage: 10, // 10% 灰度发布
    files: [
      {
        platform: 'darwin',
        arch: 'arm64',
        url: 'https://releases.example.com/alpha/cherry-agent-0.4.0-alpha.1-arm64.dmg',
        size: 87000000,
      },
    ],
    changelog: [
      {
        version: '0.4.0-alpha.1',
        date: '2025-01-25',
        changes: [
          { type: 'feature', description: '实验性功能：插件系统' },
          { type: 'feature', description: '实验性功能：自定义工具' },
        ],
      },
    ],
  },
};

/**
 * 获取版本信息
 */
export function getVersionInfo(channel: UpdateChannel): VersionInfo | null {
  const info = VERSION_CONFIG[channel];

  // 检查版本是否启用
  if (info && info.isEnabled === false) {
    return null;
  }

  return info || null;
}

/**
 * 检查是否在灰度发布范围内
 * 使用用户 ID 或设备 ID 的哈希值来决定
 */
export function isInStagingPercentage(
  userId: string | undefined,
  percentage: number
): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;

  // 如果没有用户 ID，使用随机数（不推荐，应该使用持久化的设备 ID）
  const seed = userId || Math.random().toString();

  // 简单的哈希函数
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // 转换为 0-100 的百分比
  const userPercentage = Math.abs(hash % 100);

  return userPercentage < percentage;
}

/**
 * 比较版本号
 * @returns 1 如果 v1 > v2, -1 如果 v1 < v2, 0 如果相等
 */
export function compareVersions(v1: string, v2: string): number {
  // 移除 v 前缀和预发布后缀
  const normalize = (v: string) => {
    const base = v.replace(/^v/, '').split('-')[0];
    if (!base) return [0, 0, 0];
    return base.split('.').map(Number);
  };

  const parts1 = normalize(v1);
  const parts2 = normalize(v2);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  // 如果基础版本相同，检查预发布版本
  const pre1 = v1.includes('-') ? v1.split('-')[1] : '';
  const pre2 = v2.includes('-') ? v2.split('-')[1] : '';

  if (!pre1 && pre2) return 1; // 正式版 > 预发布版
  if (pre1 && !pre2) return -1;
  if (pre1 && pre2) return pre1.localeCompare(pre2);

  return 0;
}

/**
 * 检查是否需要强制更新
 */
export function requiresForceUpdate(
  currentVersion: string,
  minimumVersion?: string
): boolean {
  if (!minimumVersion) return false;
  return compareVersions(currentVersion, minimumVersion) < 0;
}

/**
 * 获取更新策略
 * 根据当前版本和最低支持版本决定更新策略
 */
export function getUpdateStrategy(
  currentVersion: string,
  versionInfo: VersionInfo
): UpdateStrategy {
  const forceUpdate = requiresForceUpdate(currentVersion, versionInfo.minimumVersion);
  return forceUpdate ? 'forced' : versionInfo.strategy;
}
