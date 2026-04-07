/**
 * 腾讯验证码 Hook
 * 自动从 /api/configs/captcha 获取配置
 * 动态加载 TCaptcha.js，包装 Promise 接口
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface CaptchaResult {
  ticket: string;
  randstr: string;
}

interface CaptchaConfig {
  captchaEnabled: boolean;
  captchaAppId: string;
}

const CAPTCHA_JS_URL = 'https://turing.captcha.qcloud.com/TCaptcha.js';

let scriptLoadPromise: Promise<void> | null = null;

function loadCaptchaScript(): Promise<void> {
  if ((window as any).TencentCaptcha) {
    return Promise.resolve();
  }
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CAPTCHA_JS_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error('腾讯验证码脚本加载失败'));
    };
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export function useTencentCaptcha() {
  const [config, setConfig] = useState<CaptchaConfig | null>(null);
  /**
   * captchaShowing: 验证码弹窗是否正在展示
   * 用于外部组件（如 LoginModal）在验证码弹窗期间关闭 Radix Dialog 的事件拦截，
   * 否则 Dialog modal 模式会吃掉 TCaptcha iframe 的鼠标事件导致无法拖动。
   */
  const [captchaShowing, setCaptchaShowing] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:3000/api';
    fetch(`${apiBase}/configs/captcha`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          const cfg = json.data as CaptchaConfig;
          setConfig(cfg);
          if (cfg.captchaEnabled && cfg.captchaAppId) {
            loadCaptchaScript().catch(() => {});
          }
        } else {
          setConfig({ captchaEnabled: false, captchaAppId: '' });
        }
      })
      .catch(() => {
        setConfig({ captchaEnabled: false, captchaAppId: '' });
      });
  }, []);

  const showCaptcha = useCallback((): Promise<CaptchaResult> => {
    if (!config?.captchaEnabled || !config.captchaAppId) {
      return Promise.resolve({ ticket: '', randstr: '' });
    }
    return loadCaptchaScript().then(
      () =>
        new Promise<CaptchaResult>((resolve, reject) => {
          const TC = (window as any).TencentCaptcha;
          if (!TC) {
            resolve({ ticket: '', randstr: '' });
            return;
          }
          setCaptchaShowing(true);
          const captcha = new TC(
            config.captchaAppId,
            (res: { ret: number; ticket: string; randstr: string }) => {
              setCaptchaShowing(false);
              if (res.ret === 0) {
                resolve({ ticket: res.ticket, randstr: res.randstr });
              } else {
                reject(new Error('USER_CANCELLED'));
              }
            },
            {}
          );
          captcha.show();
        })
    ).catch((err: Error) => {
      setCaptchaShowing(false);
      // 脚本加载失败时降级通过
      if (err.message !== 'USER_CANCELLED') {
        return { ticket: '', randstr: '' };
      }
      throw err;
    });
  }, [config]);

  return { showCaptcha, captchaEnabled: config?.captchaEnabled ?? false, captchaShowing };
}
