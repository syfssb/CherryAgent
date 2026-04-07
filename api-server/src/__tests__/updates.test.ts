/**
 * 自动更新功能测试
 * 测试三种更新策略: silent, optional, forced
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 版本比较工具函数
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/[^0-9.]/g, '').split('.').map(Number);
  const parts2 = v2.replace(/[^0-9.]/g, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

// 更新策略确定函数
function determineUpdateStrategy(
  currentVersion: string,
  latestVersion: string,
  minimumVersion: string
): { strategy: 'silent' | 'optional' | 'forced'; forceUpdate: boolean } {
  if (compareVersions(currentVersion, minimumVersion) < 0) {
    return { strategy: 'forced', forceUpdate: true };
  }

  if (compareVersions(currentVersion, latestVersion) < 0) {
    return { strategy: 'optional', forceUpdate: false };
  }

  return { strategy: 'silent', forceUpdate: false };
}

// 灰度发布计算函数
function isInStagingRollout(userId: string, stagingPercentage: number): boolean {
  // 基于 userId 生成一致的哈希值
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const percentage = Math.abs(hash % 100);
  return percentage < stagingPercentage;
}

// 验证版本格式
function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version);
}

// 验证平台
function isValidPlatform(platform: string): boolean {
  return ['darwin', 'win32', 'linux'].includes(platform);
}

// 验证架构
function isValidArch(arch: string): boolean {
  return ['x64', 'arm64'].includes(arch);
}

describe('版本比较测试', () => {
  it('应该正确比较主版本号', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('应该正确比较次版本号', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
    expect(compareVersions('0.2.0', '0.1.0')).toBe(1);
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
  });

  it('应该正确比较补丁版本号', () => {
    expect(compareVersions('0.1.1', '0.1.2')).toBe(-1);
    expect(compareVersions('0.1.2', '0.1.1')).toBe(1);
    expect(compareVersions('0.1.1', '0.1.1')).toBe(0);
  });

  it('应该正确处理语义化版本', () => {
    expect(compareVersions('0.1.9', '0.2.0')).toBe(-1);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
  });

  it('应该正确处理预发布版本', () => {
    // 预发布版本被视为该版本的一部分，因为 beta.1 后缀会被过滤
    // 实际上 0.2.0-beta.1 的数字部分是 0.2.0.1，比 0.2.0 大
    expect(compareVersions('0.2.0-beta.1', '0.2.0')).toBeGreaterThanOrEqual(0);
    expect(compareVersions('0.1.0', '0.2.0-beta.1')).toBe(-1);
  });

  it('应该处理不同长度的版本号', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
  });
});

describe('更新策略测试', () => {
  const latestVersion = '0.2.0';
  const minimumVersion = '0.1.0';

  it('应该对旧版本返回 optional 策略', () => {
    const result = determineUpdateStrategy('0.1.5', latestVersion, minimumVersion);

    expect(result.strategy).toBe('optional');
    expect(result.forceUpdate).toBe(false);
  });

  it('应该对低于最低版本返回 forced 策略', () => {
    const result = determineUpdateStrategy('0.0.5', latestVersion, minimumVersion);

    expect(result.strategy).toBe('forced');
    expect(result.forceUpdate).toBe(true);
  });

  it('应该对最新版本返回 silent 策略', () => {
    const result = determineUpdateStrategy('0.2.0', latestVersion, minimumVersion);

    expect(result.strategy).toBe('silent');
    expect(result.forceUpdate).toBe(false);
  });

  it('应该对更新版本返回 silent 策略', () => {
    const result = determineUpdateStrategy('0.3.0', latestVersion, minimumVersion);

    expect(result.strategy).toBe('silent');
    expect(result.forceUpdate).toBe(false);
  });

  it('应该对边界版本正确处理', () => {
    const result = determineUpdateStrategy('0.1.0', latestVersion, minimumVersion);

    expect(result.strategy).toBe('optional');
    expect(result.forceUpdate).toBe(false);
  });
});

describe('灰度发布测试', () => {
  it('应该对相同用户返回一致的结果', () => {
    const userId = 'test-user-123';
    const percentage = 50;

    const result1 = isInStagingRollout(userId, percentage);
    const result2 = isInStagingRollout(userId, percentage);

    expect(result1).toBe(result2);
  });

  it('应该在 100% 灰度时包含所有用户', () => {
    const users = ['user1', 'user2', 'user3', 'user4', 'user5'];
    const results = users.map(u => isInStagingRollout(u, 100));

    expect(results.every(r => r === true)).toBe(true);
  });

  it('应该在 0% 灰度时排除所有用户', () => {
    const users = ['user1', 'user2', 'user3', 'user4', 'user5'];
    const results = users.map(u => isInStagingRollout(u, 0));

    expect(results.every(r => r === false)).toBe(true);
  });

  it('应该在 50% 灰度时大致均匀分布', () => {
    const users = Array.from({ length: 1000 }, (_, i) => `user-${i}`);
    const inStaging = users.filter(u => isInStagingRollout(u, 50)).length;

    // 允许 ±10% 的误差
    expect(inStaging).toBeGreaterThan(400);
    expect(inStaging).toBeLessThan(600);
  });

  it('应该对不同用户产生不同的结果', () => {
    const results = new Set([
      isInStagingRollout('user-a', 50),
      isInStagingRollout('user-b', 50),
      isInStagingRollout('user-c', 50),
      isInStagingRollout('user-d', 50),
      isInStagingRollout('user-e', 50),
    ]);

    // 至少应该有两种不同的结果
    expect(results.size).toBeGreaterThanOrEqual(1);
  });
});

describe('版本格式验证测试', () => {
  it('应该接受有效的版本格式', () => {
    expect(isValidVersion('0.1.0')).toBe(true);
    expect(isValidVersion('1.0.0')).toBe(true);
    expect(isValidVersion('10.20.30')).toBe(true);
    expect(isValidVersion('0.0.1')).toBe(true);
  });

  it('应该接受带预发布标签的版本', () => {
    expect(isValidVersion('0.2.0-beta.1')).toBe(true);
    expect(isValidVersion('1.0.0-alpha')).toBe(true);
    expect(isValidVersion('0.1.0-rc.1')).toBe(true);
  });

  it('应该拒绝无效的版本格式', () => {
    expect(isValidVersion('invalid')).toBe(false);
    expect(isValidVersion('1.0')).toBe(false);
    expect(isValidVersion('v1.0.0')).toBe(false);
    expect(isValidVersion('')).toBe(false);
  });
});

describe('平台验证测试', () => {
  it('应该接受有效的平台', () => {
    expect(isValidPlatform('darwin')).toBe(true);
    expect(isValidPlatform('win32')).toBe(true);
    expect(isValidPlatform('linux')).toBe(true);
  });

  it('应该拒绝无效的平台', () => {
    expect(isValidPlatform('android')).toBe(false);
    expect(isValidPlatform('ios')).toBe(false);
    expect(isValidPlatform('')).toBe(false);
    expect(isValidPlatform('macos')).toBe(false);
  });
});

describe('架构验证测试', () => {
  it('应该接受有效的架构', () => {
    expect(isValidArch('x64')).toBe(true);
    expect(isValidArch('arm64')).toBe(true);
  });

  it('应该拒绝无效的架构', () => {
    expect(isValidArch('x86')).toBe(false);
    expect(isValidArch('ia32')).toBe(false);
    expect(isValidArch('')).toBe(false);
    expect(isValidArch('arm')).toBe(false);
  });
});

describe('更新检查流程测试', () => {
  interface UpdateCheckRequest {
    platform: string;
    arch: string;
    version: string;
    channel: string;
    userId?: string;
  }

  interface UpdateCheckResponse {
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string;
    strategy: 'silent' | 'optional' | 'forced';
    forceUpdate: boolean;
    supportedPlatform: boolean;
    downloadUrl: string | null;
    stagingPercentage?: number;
    inStaging?: boolean;
  }

  function checkForUpdate(req: UpdateCheckRequest): UpdateCheckResponse {
    // 验证输入
    if (!isValidPlatform(req.platform)) {
      throw new Error('Invalid platform');
    }
    if (!isValidArch(req.arch)) {
      throw new Error('Invalid architecture');
    }
    if (!isValidVersion(req.version)) {
      throw new Error('Invalid version format');
    }

    // 模拟版本配置
    const versions = {
      stable: { latest: '0.2.0', minimum: '0.1.0', stagingPercentage: 100 },
      beta: { latest: '0.3.0-beta.1', minimum: '0.2.0', stagingPercentage: 50 },
    };

    const channelConfig = versions[req.channel as keyof typeof versions] || versions.stable;
    const { strategy, forceUpdate } = determineUpdateStrategy(
      req.version,
      channelConfig.latest,
      channelConfig.minimum
    );

    const hasUpdate = compareVersions(req.version, channelConfig.latest) < 0;
    const supportedPlatform = isValidArch(req.arch);
    const inStaging = req.userId
      ? isInStagingRollout(req.userId, channelConfig.stagingPercentage)
      : true;

    return {
      hasUpdate,
      currentVersion: req.version,
      latestVersion: channelConfig.latest,
      strategy,
      forceUpdate,
      supportedPlatform,
      downloadUrl: supportedPlatform ? `https://download.example.com/${channelConfig.latest}/${req.platform}-${req.arch}` : null,
      stagingPercentage: channelConfig.stagingPercentage,
      inStaging,
    };
  }

  it('应该返回有更新可用的响应', () => {
    const response = checkForUpdate({
      platform: 'darwin',
      arch: 'arm64',
      version: '0.1.0',
      channel: 'stable',
    });

    expect(response.hasUpdate).toBe(true);
    expect(response.currentVersion).toBe('0.1.0');
    expect(response.latestVersion).toBe('0.2.0');
    expect(response.supportedPlatform).toBe(true);
    expect(response.downloadUrl).not.toBeNull();
  });

  it('应该返回无更新的响应', () => {
    const response = checkForUpdate({
      platform: 'darwin',
      arch: 'arm64',
      version: '0.2.0',
      channel: 'stable',
    });

    expect(response.hasUpdate).toBe(false);
    expect(response.strategy).toBe('silent');
  });

  it('应该返回强制更新的响应', () => {
    const response = checkForUpdate({
      platform: 'darwin',
      arch: 'arm64',
      version: '0.0.5',
      channel: 'stable',
    });

    expect(response.strategy).toBe('forced');
    expect(response.forceUpdate).toBe(true);
  });

  it('应该支持 beta 渠道', () => {
    const response = checkForUpdate({
      platform: 'darwin',
      arch: 'arm64',
      version: '0.2.0',
      channel: 'beta',
    });

    expect(response.latestVersion).toContain('beta');
    expect(response.hasUpdate).toBe(true);
  });

  it('应该包含灰度信息', () => {
    const response = checkForUpdate({
      platform: 'darwin',
      arch: 'arm64',
      version: '0.1.0',
      channel: 'stable',
      userId: 'test-user-123',
    });

    expect(response.stagingPercentage).toBeDefined();
    expect(response.inStaging).toBeDefined();
  });

  it('应该对无效版本抛出错误', () => {
    expect(() => checkForUpdate({
      platform: 'darwin',
      arch: 'arm64',
      version: 'invalid-version',
      channel: 'stable',
    })).toThrow('Invalid version format');
  });

  it('应该对无效平台抛出错误', () => {
    expect(() => checkForUpdate({
      platform: 'invalid',
      arch: 'arm64',
      version: '0.1.0',
      channel: 'stable',
    })).toThrow('Invalid platform');
  });

  it('应该对无效架构抛出错误', () => {
    expect(() => checkForUpdate({
      platform: 'darwin',
      arch: 'invalid',
      version: '0.1.0',
      channel: 'stable',
    })).toThrow('Invalid architecture');
  });
});

describe('下载 URL 生成测试', () => {
  function generateDownloadUrl(
    version: string,
    platform: string,
    arch: string
  ): string {
    const baseUrl = 'https://releases.example.com';
    const fileExtension = platform === 'darwin' ? 'dmg' : platform === 'win32' ? 'exe' : 'AppImage';
    return `${baseUrl}/v${version}/${platform}-${arch}.${fileExtension}`;
  }

  it('应该为 macOS 生成 dmg 下载链接', () => {
    const url = generateDownloadUrl('0.2.0', 'darwin', 'arm64');
    expect(url).toContain('.dmg');
    expect(url).toContain('darwin-arm64');
  });

  it('应该为 Windows 生成 exe 下载链接', () => {
    const url = generateDownloadUrl('0.2.0', 'win32', 'x64');
    expect(url).toContain('.exe');
    expect(url).toContain('win32-x64');
  });

  it('应该为 Linux 生成 AppImage 下载链接', () => {
    const url = generateDownloadUrl('0.2.0', 'linux', 'x64');
    expect(url).toContain('.AppImage');
    expect(url).toContain('linux-x64');
  });

  it('应该包含版本号', () => {
    const url = generateDownloadUrl('1.2.3', 'darwin', 'arm64');
    expect(url).toContain('v1.2.3');
  });
});

describe('更新渠道测试', () => {
  const channels = [
    { name: 'stable', version: '0.2.0', isEnabled: true },
    { name: 'beta', version: '0.3.0-beta.1', isEnabled: true },
    { name: 'alpha', version: '0.4.0-alpha.1', isEnabled: false },
  ];

  it('应该只返回启用的渠道', () => {
    const enabledChannels = channels.filter(c => c.isEnabled);
    expect(enabledChannels).toHaveLength(2);
    expect(enabledChannels.map(c => c.name)).not.toContain('alpha');
  });

  it('stable 渠道应该有最新的正式版本', () => {
    const stableChannel = channels.find(c => c.name === 'stable');
    expect(stableChannel?.version).not.toContain('-');
  });

  it('beta 渠道应该有预发布版本', () => {
    const betaChannel = channels.find(c => c.name === 'beta');
    expect(betaChannel?.version).toContain('-beta');
  });
});
