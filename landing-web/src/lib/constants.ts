export const PLATFORM_LABELS: Record<string, string> = {
  mac_arm64: 'macOS (Apple Silicon)',
  mac_x64: 'macOS (Intel)',
  win_x64: 'Windows',
  linux_x64: 'Linux',
};

export const PLATFORMS = ['mac_arm64', 'mac_x64', 'win_x64', 'linux_x64'] as const;
export type Platform = typeof PLATFORMS[number];

// Download base URL: set VITE_DOWNLOAD_BASE_URL in landing-web/.env for custom distribution
const COS_BASE = import.meta.env.VITE_DOWNLOAD_BASE_URL || '';

export const DOWNLOAD_URLS: Record<string, string> = {
  mac_arm64: `${COS_BASE}/Cherry-Agent-latest-arm64.dmg`,
  mac_x64: `${COS_BASE}/Cherry-Agent-latest.dmg`,
  win_x64: `${COS_BASE}/Cherry-Agent-Setup-Latest.exe`,
};

export function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes('win')) return 'win_x64';

  if (ua.includes('mac')) {
    // 1. Chromium userAgentData（最准确）
    const uaData = (navigator as unknown as { userAgentData?: { architecture?: string } }).userAgentData;
    if (uaData?.architecture === 'arm') return 'mac_arm64';
    if (uaData?.architecture === 'x86') return 'mac_x64';

    // 2. WebGL GPU renderer 检测（Safari 也支持）
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
          if (renderer) {
            const r = renderer.toLowerCase();
            if (/apple m\d/.test(r) || r.includes('apple gpu')) return 'mac_arm64';
            if (/intel|radeon|amd|nvidia/.test(r)) return 'mac_x64';
          }
        }
      }
    } catch { /* WebGL not available */ }

    // 3. 兜底：默认 Intel（保守策略，arm64 包在 Intel 上无法运行）
    return 'mac_x64';
  }

  return 'mac_arm64';
}

export function getDownloadUrl(platform?: string): string {
  const p = platform || detectPlatform();
  return DOWNLOAD_URLS[p] || DOWNLOAD_URLS['mac_arm64'];
}
