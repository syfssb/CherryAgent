/**
 * 转化漏斗埋点模块
 * 使用 navigator.sendBeacon / fetch 发送事件，fire-and-forget 不阻塞 UI
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const ANALYTICS_ENDPOINT = `${API_BASE}/api/analytics/events`;

type AnalyticsEvent =
  | { name: 'lp_view'; properties?: { referrer?: string } }
  | { name: 'lp_click_download'; properties: { platform: string } }
  | { name: 'lp_click_register'; properties?: { source?: string } }
  | { name: 'lp_select_provider_interest'; properties: { provider: string } }
  | { name: 'lp_register_success'; properties: { hasReferral: boolean } };

function sendEvent(event: AnalyticsEvent): void {
  const payload = JSON.stringify({
    event: event.name,
    properties: event.properties ?? {},
    timestamp: Date.now(),
    url: window.location.href,
  });

  try {
    // 优先 sendBeacon（页面卸载时也能发送）
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(ANALYTICS_ENDPOINT, blob);
      if (sent) return;
    }

    // fallback: fetch fire-and-forget
    fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // 静默失败，不影响用户体验
    });
  } catch {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[analytics]', event.name, event.properties);
    }
  }
}

export function trackEvent(event: AnalyticsEvent): void {
  try {
    sendEvent(event);
  } catch {
    // 埋点永远不能影响页面功能
  }
}

export function trackPageView(): void {
  trackEvent({ name: 'lp_view', properties: { referrer: document.referrer || undefined } });
}

export function trackDownloadClick(platform: string): void {
  trackEvent({ name: 'lp_click_download', properties: { platform } });
}

export function trackRegisterClick(source?: string): void {
  trackEvent({ name: 'lp_click_register', properties: { source } });
}

export function trackProviderInterest(provider: string): void {
  trackEvent({ name: 'lp_select_provider_interest', properties: { provider } });
}

export function trackRegisterSuccess(hasReferral: boolean): void {
  trackEvent({ name: 'lp_register_success', properties: { hasReferral } });
}
