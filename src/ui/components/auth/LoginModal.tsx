import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
  cn,
} from '@/ui/components/ui';
import { Checkbox } from '@/ui/components/ui/checkbox';
import { useAuthStore } from '@/ui/store/useAuthStore';
import { authApi } from '@/ui/lib/auth-api';
import { useTencentCaptcha } from '@/ui/hooks/useTencentCaptcha';
import MDContent from '@/ui/render/markdown-core';

/**
 * LoginModal 组件属性
 */
export interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * 登录表单状态
 */
interface LoginFormState {
  email: string;
  password: string;
  name: string;
  confirmPassword: string;
  referralCode: string;
}

/**
 * 表单验证错误
 */
interface FormErrors {
  email?: string;
  password?: string;
  name?: string;
  confirmPassword?: string;
  referralCode?: string;
}

/**
 * 认证模式
 */
type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-sent' | 'verification-sent';

/**
 * 验证邮箱格式
 */
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Google 图标组件
 */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

/**
 * 加载 Spinner 组件
 */
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/**
 * 法律内容弹窗状态
 */
interface LegalModalState {
  open: boolean;
  type: 'privacy_policy' | 'terms_of_service' | null;
  content: string | null;
  loading: boolean;
}

/**
 * 法律内容弹窗（服务条款 / 隐私政策）
 */
function LegalContentModal({
  state,
  onClose,
}: {
  state: LegalModalState;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const title =
    state.type === 'terms_of_service'
      ? t('auth.termsOfServiceTitle', '服务条款')
      : t('auth.privacyPolicyTitle', '隐私政策');

  // 使用 Radix Dialog 渲染，避免被外层 Dialog 的 pointer-events 限制拦截
  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[560px] p-0 flex flex-col gap-0 max-h-[85vh]">
        <DialogHeader className="flex-shrink-0 border-b border-ink-400/10 px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* 内容区：flex-1 + min-h-0 保证 overflow-y-auto 生效 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {state.loading ? (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner className="h-6 w-6 text-accent" />
              <span className="ml-3 text-sm text-muted">
                {t('auth.legalLoading', '加载中...')}
              </span>
            </div>
          ) : state.content ? (
            <MDContent text={state.content} />
          ) : (
            <p className="text-sm text-muted">{t('auth.legalLoading', '加载中...')}</p>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-ink-400/10 px-6 py-4">
          <Button type="button" className="w-full" onClick={onClose}>
            {t('auth.legalClose', '关闭')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 登录模态框组件
 * 支持 Google OAuth 和邮箱密码登录
 */
export function LoginModal({ open, onClose, onSuccess }: LoginModalProps) {
  const { t, i18n } = useTranslation();
  const loginFn = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const setError = useAuthStore((s) => s.setError);
  const setWelcomeBonus = useAuthStore((s) => s.setWelcomeBonus);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const { showCaptcha, captchaShowing } = useTencentCaptcha();

  const [form, setForm] = useState<LoginFormState>(() => {
    const savedEmail = localStorage.getItem('remember_me_email') ?? '';
    return {
      email: savedEmail,
      password: '',
      name: '',
      confirmPassword: '',
      referralCode: '',
    };
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [oauthLoading, setOauthLoading] = useState<'google' | null>(null);
  const [mode, setMode] = useState<AuthMode>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 记住我复选框状态（仅登录模式）
  const [rememberMe, setRememberMe] = useState<boolean>(
    () => Boolean(localStorage.getItem('remember_me_email'))
  );

  // 服务条款同意复选框状态（桌面端默认勾选）
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(true);

  // 法律内容弹窗状态
  const [legalModal, setLegalModal] = useState<LegalModalState>({
    open: false,
    type: null,
    content: null,
    loading: false,
  });

  // 从 URL 参数自动填充邀请码
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        setForm((prev) => ({ ...prev, referralCode: ref }));
        setMode('register');
      }
    } catch {
      // ignore - URL parsing may fail in some environments
    }
  }, []);

  // 切换 mode 时重置 agreedToTerms（桌面端保持默认勾选）
  useEffect(() => {
    setAgreedToTerms(true);
  }, [mode]);

  // 清理重发倒计时定时器
  useEffect(() => {
    return () => {
      if (resendTimerRef.current) {
        clearInterval(resendTimerRef.current);
      }
    };
  }, []);

  /**
   * 监听 Electron OAuth 回调（深度链接模式）
   */
  useEffect(() => {
    if (!open) return;

    const cleanup = window.electronAPI?.auth?.onAuthCallback?.((data: any) => {
      if (data.accessToken) {
        loginFn(data.accessToken, data.refreshToken, data.expiresIn)
          .then(() => {
            setOauthLoading(null);
            onSuccess?.();
            onClose();
          })
          .catch((err: Error) => {
            console.error('[LoginModal] OAuth callback login failed:', err);
            setOauthLoading(null);
          });
      } else if (data.error) {
        setError({ code: 'OAUTH_FAILED', message: data.error });
        setOauthLoading(null);
      }
    });

    return () => {
      cleanup?.();
    };
  }, [open, loginFn, onSuccess, onClose, setError]);

  /**
   * 打开法律内容弹窗
   */
  const handleOpenLegal = useCallback(
    async (type: 'privacy_policy' | 'terms_of_service') => {
      setLegalModal({ open: true, type, content: null, loading: true });

      const content = await authApi.getLegalContent(type, i18n.language);

      setLegalModal((prev) => ({
        ...prev,
        content,
        loading: false,
      }));
    },
    [i18n.language]
  );

  /**
   * 关闭法律内容弹窗
   */
  const handleCloseLegal = useCallback(() => {
    setLegalModal({ open: false, type: null, content: null, loading: false });
  }, []);

  /**
   * 验证表单
   */
  const validateForm = useCallback((): boolean => {
    const errors: FormErrors = {};

    if (!form.email.trim()) {
      errors.email = t('auth.emailRequired');
    } else if (!validateEmail(form.email)) {
      errors.email = t('auth.emailInvalid');
    }

    if (!form.password) {
      errors.password = t('auth.passwordRequired');
    } else if (mode === 'register') {
      const hasUpper = /[A-Z]/.test(form.password);
      const hasLower = /[a-z]/.test(form.password);
      const hasNumber = /[0-9]/.test(form.password);
      if (form.password.length < 8 || !hasUpper || !hasLower || !hasNumber) {
        errors.password = t('auth.passwordWeak', '密码至少 8 位，且包含大小写字母和数字');
      }
    } else if (form.password.length < 6) {
      errors.password = t('auth.passwordTooShort');
    }

    if (mode === 'register') {
      if (form.name.trim() && form.name.trim().length < 2) {
        errors.name = t('auth.nameTooShort', '名称至少需要 2 个字符');
      }
      if (!form.confirmPassword) {
        errors.confirmPassword = t('auth.confirmPasswordRequired', '请确认密码');
      } else if (form.confirmPassword !== form.password) {
        errors.confirmPassword = t('auth.passwordMismatch');
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form, t, mode]);

  /**
   * 启动重发验证邮件倒计时（60秒）
   */
  const startResendCooldown = useCallback(() => {
    setResendCooldown(60);
    if (resendTimerRef.current) {
      clearInterval(resendTimerRef.current);
    }
    resendTimerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendTimerRef.current) {
            clearInterval(resendTimerRef.current);
            resendTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  /**
   * 重新发送验证邮件
   */
  const handleResendVerification = useCallback(async () => {
    if (resendCooldown > 0) return;
    clearError();
    setIsSubmitting(true);

    try {
      const { authApi } = await import('@/ui/lib/auth-api');
      await authApi.resendVerificationByEmail(registeredEmail || form.email);
      startResendCooldown();
    } catch (err) {
      setError({
        code: 'RESEND_FAILED',
        message: err instanceof Error ? err.message : t('auth.resendVerificationFailed', '发送验证邮件失败，请稍后重试'),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [clearError, form.email, registeredEmail, resendCooldown, setError, startResendCooldown, t]);

  /**
   * 处理邮箱登录/注册
   */
  const handleEmailSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!validateForm()) {
      return;
    }

    // 服务条款同意检查
    if (!agreedToTerms) {
      setError({
        code: 'TERMS_NOT_AGREED',
        message: t('auth.mustAgreeToTerms', '请先同意服务条款和隐私政策'),
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { authApi } = await import('@/ui/lib/auth-api');

      // 验证码检查
      let captchaTicket = '';
      let captchaRandstr = '';
      try {
        const captchaResult = await showCaptcha();
        captchaTicket = captchaResult.ticket;
        captchaRandstr = captchaResult.randstr;
      } catch (captchaErr) {
        if (captchaErr instanceof Error && captchaErr.message === 'USER_CANCELLED') {
          setIsSubmitting(false);
          return;
        }
        // 其他错误降级处理，继续提交
      }

      if (mode === 'register') {
        // 注册：不返回 token，只显示验证提示
        await authApi.register(form.email, form.password, form.name.trim() || undefined, form.referralCode.trim() || undefined, captchaTicket || undefined, captchaRandstr || undefined);
        setRegisteredEmail(form.email);
        setMode('verification-sent');
        startResendCooldown();
      } else {
        // 登录
        const result = await authApi.login(form.email, form.password, captchaTicket || undefined, captchaRandstr || undefined);

        if (result?.accessToken) {
          // 处理记住我
          if (rememberMe) {
            localStorage.setItem('remember_me_email', form.email);
          } else {
            localStorage.removeItem('remember_me_email');
          }

          await loginFn(result.accessToken, result.refreshToken, result.expiresIn);

          if (result.balance) {
            updateBalance({
              amount: parseFloat(result.balance.amount || '0'),
              currency: result.balance.currency || 'USD',
              updatedAt: Date.now(),
            });
          }

          if (result.welcomeBonus) {
            const bonusAmount = parseFloat(result.welcomeBonus || '0');
            if (!Number.isNaN(bonusAmount) && bonusAmount > 0) {
              setWelcomeBonus({
                amount: bonusAmount,
                currency: result.balance?.currency || 'USD',
                label: t('auth.welcomeBonusLabel', '新手礼包'),
                grantedAt: Date.now(),
              });
            }
          } else {
            setWelcomeBonus(null);
          }

          onSuccess?.();
          onClose();
        }
      }
    } catch (err: any) {
      // 登录时邮箱未验证 → 显示验证提示
      if (err?.code === 'EMAIL_NOT_VERIFIED' || err?.data?.error?.code === 'EMAIL_NOT_VERIFIED') {
        setRegisteredEmail(form.email);
        setMode('verification-sent');
        startResendCooldown();
        return;
      }
      const message = err instanceof Error
        ? err.message
        : (mode === 'register'
          ? t('auth.registerFailed', '注册失败，请重试')
          : t('auth.loginFailed'));
      setError({
        code: mode === 'register' ? 'REGISTER_FAILED' : 'LOGIN_FAILED',
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [agreedToTerms, clearError, form, loginFn, mode, onClose, onSuccess, rememberMe, setError, setWelcomeBonus, showCaptcha, t, updateBalance, validateForm]);

  /**
   * 处理原生 Google OAuth 登录
   */
  const handleGoogleOAuth = useCallback(async () => {
    clearError();

    // 服务条款同意检查
    if (!agreedToTerms) {
      setError({
        code: 'TERMS_NOT_AGREED',
        message: t('auth.mustAgreeToTerms', '请先同意服务条款和隐私政策'),
      });
      return;
    }

    // 验证码检查（Google OAuth 流程在打开授权页前先完成验证）
    try {
      await showCaptcha();
    } catch (captchaErr) {
      if (captchaErr instanceof Error && captchaErr.message === 'USER_CANCELLED') {
        return;
      }
      // 其他错误（脚本加载失败等）降级处理，继续流程
    }

    setOauthLoading('google');

    try {
      // 1. 从后端获取 Google OAuth 授权 URL 和 state
      const { authUrl, state } = await authApi.getOAuthUrl('google');

      // 2. 打开 OAuth 页面
      const openOAuthPage = async (): Promise<boolean> => {
        // Electron 桌面端优先使用系统浏览器
        const isElectronRuntime = Boolean(window.electron || window.electronAPI);
        if (isElectronRuntime) {
          try {
            const billingApi = window.electron?.billing ?? window.electronAPI?.billing;
            console.log('[LoginModal] billingApi available:', !!billingApi, 'openExternalUrl:', !!billingApi?.openExternalUrl);
            if (billingApi?.openExternalUrl) {
              const result = await billingApi.openExternalUrl(authUrl);
              console.log('[LoginModal] openExternalUrl result:', result);
              if (result?.success) return true;
            }
          } catch (e) {
            console.warn('[LoginModal] Electron openExternalUrl failed:', e);
          }
          // Electron fallback: window.open 会被 setWindowOpenHandler 拦截并用系统浏览器打开
          // 虽然 window.open 返回 null，但实际上页面已经打开了
          window.open(authUrl, '_blank', 'width=500,height=700,left=200,top=100');
          return true; // 在 Electron 环境下认为打开成功
        }
        // 非 Electron 环境：用 popup 打开
        const popup = window.open(authUrl, '_blank', 'width=500,height=700,left=200,top=100');

        // 如果 popup 为 null，可能是在 Electron 环境下但 preload 脚本未正确加载
        // 使用 navigator.userAgent 作为备用检测方法
        if (!popup && navigator.userAgent.toLowerCase().includes('electron')) {
          // 在 Electron 环境下，window.open 被 setWindowOpenHandler 拦截返回 null 是正常的
          // setWindowOpenHandler 会调用 shell.openExternal 打开系统浏览器
          console.log('[LoginModal] Detected Electron via userAgent, treating as success');
          return true;
        }

        return !!popup;
      };

      const opened = await openOAuthPage();
      if (!opened) {
        setError({
          code: 'OAUTH_FAILED',
          message: t('auth.popupBlocked', '无法打开登录页面，请检查浏览器是否阻止了弹窗'),
        });
        setOauthLoading(null);
        return;
      }

      // 3. 轮询后端获取 OAuth 结果
      const pollResult = setInterval(async () => {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/auth/oauth/result?state=${encodeURIComponent(state)}`,
          );
          const json = await response.json();
          const result = json.data;

          if (result?.pending) return; // 还没完成，继续轮询

          clearInterval(pollResult);
          clearTimeout(pollTimeout);

          if (result?.error) {
            setError({
              code: 'OAUTH_FAILED',
              message: result.error,
            });
            setOauthLoading(null);
            return;
          }

          if (result?.accessToken) {
            await loginFn(
              result.accessToken,
              result.refreshToken,
              result.expiresIn,
            );

            if (result.isNewUser && result.welcomeBonus && result.welcomeBonus !== '0') {
              const bonusAmount = parseFloat(result.welcomeBonus);
              if (!Number.isNaN(bonusAmount) && bonusAmount > 0) {
                setWelcomeBonus({
                  amount: bonusAmount,
                  currency: result.balance?.currency || 'USD',
                  label: t('auth.welcomeBonusLabel', '新手礼包'),
                  grantedAt: Date.now(),
                });
              }
            }
            if (result.balance) {
              updateBalance({
                amount: parseFloat(result.balance.amount || '0'),
                currency: result.balance.currency || 'USD',
                updatedAt: Date.now(),
              });
            }

            setOauthLoading(null);
            // 关闭 OAuth 弹窗
            try {
              const elAuth = window.electron?.auth ?? window.electronAPI?.auth;
              await elAuth?.closeOAuthWindows?.();
            } catch { /* ignore */ }
            onSuccess?.();
            onClose();
          }
        } catch (e) {
          // 网络错误，继续轮询
        }
      }, 1500);

      // 超时 5 分钟后停止轮询
      const pollTimeout = window.setTimeout(() => {
        clearInterval(pollResult);
        setOauthLoading(null);
        setError({
          code: 'OAUTH_TIMEOUT',
          message: t('oauth.timeout', 'Google 登录超时，请重试'),
        });
      }, 5 * 60 * 1000);
    } catch (err) {
      console.error('[LoginModal] Google OAuth failed:', err);
      setError({
        code: 'OAUTH_FAILED',
        message: err instanceof Error ? err.message : 'OAuth 登录失败',
      });
      setOauthLoading(null);
    }
  }, [agreedToTerms, clearError, loginFn, onClose, onSuccess, setError, setWelcomeBonus, showCaptcha, t, updateBalance]);

  /**
   * 处理忘记密码提交
   */
  const handleForgotPasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!form.email.trim()) {
      setFormErrors({ email: t('auth.emailRequired') });
      return;
    }
    if (!validateEmail(form.email)) {
      setFormErrors({ email: t('auth.emailInvalid') });
      return;
    }

    setIsSubmitting(true);

    try {
      const { authApi } = await import('@/ui/lib/auth-api');

      // 验证码检查
      let captchaTicket = '';
      let captchaRandstr = '';
      try {
        const captchaResult = await showCaptcha();
        captchaTicket = captchaResult.ticket;
        captchaRandstr = captchaResult.randstr;
      } catch (captchaErr) {
        if (captchaErr instanceof Error && captchaErr.message === 'USER_CANCELLED') {
          setIsSubmitting(false);
          return;
        }
        // 其他错误降级处理，继续提交
      }

      await authApi.forgotPassword(form.email, captchaTicket || undefined, captchaRandstr || undefined);
      setMode('reset-sent');
    } catch (err) {
      setError({
        code: 'FORGOT_PASSWORD_FAILED',
        message: err instanceof Error ? err.message : t('auth.forgotPasswordFailed', '发送重置邮件失败'),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [clearError, form.email, setError, showCaptcha, t]);

  /**
   * 处理输入变化
   */
  const handleInputChange = useCallback((field: keyof LoginFormState) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      // 实时校验确认密码一致性
      if (field === 'confirmPassword') {
        if (value && value !== next.password) {
          setFormErrors((prevErrors) => ({ ...prevErrors, confirmPassword: t('auth.passwordMismatch') }));
        } else {
          setFormErrors((prevErrors) => ({ ...prevErrors, confirmPassword: undefined }));
        }
      } else if (field === 'password') {
        // 密码字段变化时，如果确认密码已有值则重新校验
        if (next.confirmPassword) {
          if (value !== next.confirmPassword) {
            setFormErrors((prevErrors) => ({ ...prevErrors, confirmPassword: t('auth.passwordMismatch') }));
          } else {
            setFormErrors((prevErrors) => ({ ...prevErrors, confirmPassword: undefined }));
          }
        }
      }

      return next;
    });

    if (field !== 'confirmPassword' && field !== 'password') {
      if (formErrors[field]) {
        setFormErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    } else if (field === 'password' && formErrors.password) {
      setFormErrors((prev) => ({ ...prev, password: undefined }));
    }

    if (error) {
      clearError();
    }
  }, [formErrors, error, clearError, t]);

  /**
   * 处理模态框关闭
   */
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      const savedEmail = localStorage.getItem('remember_me_email') ?? '';
      setForm({ email: savedEmail, password: '', name: '', confirmPassword: '', referralCode: '' });
      setFormErrors({});
      setMode('login');
      setOauthLoading(null);
      setIsSubmitting(false);
      setResendCooldown(0);
      setShowPassword(false);
      setShowConfirmPassword(false);
      setAgreedToTerms(true);
      setLegalModal({ open: false, type: null, content: null, loading: false });
      if (resendTimerRef.current) {
        clearInterval(resendTimerRef.current);
        resendTimerRef.current = null;
      }
      clearError();
      onClose();
    }
  }, [clearError, onClose]);

  const isFormLoading = isLoading || oauthLoading !== null || isSubmitting;

  const getDialogTitle = () => {
    switch (mode) {
      case 'forgot-password': return t('auth.forgotPasswordTitle', '忘记密码');
      case 'reset-sent': return t('auth.resetEmailSentTitle', '邮件已发送');
      case 'verification-sent': return t('auth.verificationSentTitle', '注册成功');
      default: return mode === 'login' ? t('auth.login') : t('auth.register');
    }
  };

  const getDialogDescription = () => {
    switch (mode) {
      case 'forgot-password': return t('auth.forgotPasswordDescription', '输入您的注册邮箱，我们将发送密码重置链接');
      case 'reset-sent': return t('auth.resetEmailSentDescription', '请查收您的邮箱并点击重置链接');
      case 'verification-sent': return t('auth.verificationSentDescription', '请验证您的邮箱以完成注册');
      default: return mode === 'login' ? t('auth.loginDescription') : t('auth.registerDescription', '注册新账号以开始使用');
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange} modal={!captchaShowing}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
        </DialogHeader>

        {/* 忘记密码 - 输入邮箱表单 */}
        {mode === 'forgot-password' && (
          <>
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4 mt-2">
              <div className="space-y-2">
                <label htmlFor="forgot-email" className="text-sm font-medium text-ink-700">
                  {t('auth.email')}
                </label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder={t('placeholder.email')}
                  value={form.email}
                  onChange={handleInputChange('email')}
                  disabled={isSubmitting}
                  aria-invalid={!!formErrors.email}
                  aria-describedby={formErrors.email ? 'forgot-email-error' : undefined}
                />
                {formErrors.email && (
                  <p id="forgot-email-error" className="text-sm text-error">
                    {formErrors.email}
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-error/20 bg-error-light px-4 py-3">
                  <p className="text-sm text-error">{error.message}</p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 mr-2" />
                    {t('auth.sendingResetEmail', '发送中...')}
                  </>
                ) : (
                  t('auth.sendResetEmail', '发送重置邮件')
                )}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted">
              <button
                type="button"
                className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
                onClick={() => {
                  setFormErrors({});
                  clearError();
                  setMode('login');
                }}
              >
                {t('auth.backToLogin', '返回登录')}
              </button>
            </div>
          </>
        )}

        {/* 重置邮件已发送 - 成功提示 */}
        {mode === 'reset-sent' && (
          <>
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
                <svg className="h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <p className="text-center text-sm text-muted">
                {t('auth.resetEmailSentMessage', '如果该邮箱已注册，您将收到一封包含密码重置链接的邮件。链接有效期为 1 小时。')}
              </p>
            </div>

            <Button
              type="button"
              className="w-full"
              onClick={() => {
                setFormErrors({});
                clearError();
                const savedEmail = localStorage.getItem('remember_me_email') ?? '';
                setForm({ email: savedEmail, password: '', name: '', confirmPassword: '', referralCode: '' });
                setMode('login');
              }}
            >
              {t('auth.backToLogin', '返回登录')}
            </Button>
          </>
        )}

        {/* 邮箱验证提示 - 注册成功后显示 */}
        {mode === 'verification-sent' && (
          <>
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#DCFCE7]">
                <svg className="h-8 w-8 text-[#16A34A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-ink-700">
                  {t('auth.verificationSentMessage', '我们已向您的邮箱发送了一封验证邮件，请点击邮件中的链接完成验证。')}
                </p>
                <p className="text-xs text-muted">
                  {t('auth.verificationSentHint', '如果没有收到邮件，请检查垃圾邮件文件夹。')}
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-error/20 bg-error-light px-4 py-3">
                <p className="text-sm text-error">{error.message}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isSubmitting || resendCooldown > 0}
                onClick={handleResendVerification}
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 mr-2" />
                    {t('auth.sendingVerification', '发送中...')}
                  </>
                ) : resendCooldown > 0 ? (
                  t('auth.resendVerificationCooldown', '{{seconds}} 秒后可重新发送', { seconds: resendCooldown })
                ) : (
                  t('auth.resendVerification', '重新发送验证邮件')
                )}
              </Button>

              <Button
                type="button"
                className="w-full"
                onClick={() => setMode('login')}
              >
                {t('auth.backToLogin', '返回登录')}
              </Button>
            </div>
          </>
        )}

        {/* 登录/注册表单 */}
        {(mode === 'login' || mode === 'register') && (
          <>
            {/* Google OAuth 登录按钮 */}
            <div className="flex flex-col gap-3 mt-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isFormLoading}
                onClick={() => handleGoogleOAuth()}
              >
                {oauthLoading === 'google' ? (
                  <LoadingSpinner className="h-5 w-5 mr-2" />
                ) : (
                  <GoogleIcon className="h-5 w-5 mr-2" />
                )}
                {t('auth.continueWithGoogle')}
              </Button>
            </div>

            {/* 分隔线 */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-ink-400/20" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-surface px-2 text-muted">{t('auth.orContinueWith')}</span>
              </div>
            </div>

            {/* 邮箱登录表单 */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-ink-700">
                    {t('auth.name', '昵称')}
                  </label>
                  <Input
                    id="name"
                    type="text"
                    placeholder={t('placeholder.username')}
                    value={form.name}
                    onChange={handleInputChange('name')}
                    disabled={isFormLoading}
                    aria-invalid={!!formErrors.name}
                    aria-describedby={formErrors.name ? 'name-error' : undefined}
                  />
                  {formErrors.name && (
                    <p id="name-error" className="text-sm text-error">
                      {formErrors.name}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-ink-700">
                  {t('auth.email')}
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('placeholder.email')}
                  value={form.email}
                  onChange={handleInputChange('email')}
                  disabled={isFormLoading}
                  aria-invalid={!!formErrors.email}
                  aria-describedby={formErrors.email ? 'email-error' : undefined}
                />
                {formErrors.email && (
                  <p id="email-error" className="text-sm text-error">
                    {formErrors.email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-ink-700">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('placeholder.password')}
                    value={form.password}
                    onChange={handleInputChange('password')}
                    disabled={isFormLoading}
                    aria-invalid={!!formErrors.password}
                    aria-describedby={formErrors.password ? 'password-error' : undefined}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#87867f] hover:text-[#141413] transition-colors duration-150"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {formErrors.password && (
                  <p id="password-error" className="text-sm text-error">
                    {formErrors.password}
                  </p>
                )}
              </div>

              {mode === 'register' && (
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-ink-700">
                    {t('auth.confirmPassword')}
                  </label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder={t('placeholder.password')}
                      value={form.confirmPassword}
                      onChange={handleInputChange('confirmPassword')}
                      disabled={isFormLoading}
                      aria-invalid={!!formErrors.confirmPassword}
                      aria-describedby={formErrors.confirmPassword ? 'confirm-password-error' : undefined}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#87867f] hover:text-[#141413] transition-colors duration-150"
                      aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {formErrors.confirmPassword && (
                    <p id="confirm-password-error" className="text-sm text-error">
                      {formErrors.confirmPassword}
                    </p>
                  )}
                </div>
              )}

              {mode === 'register' && (
                <div className="space-y-2">
                  <label htmlFor="referralCode" className="text-sm font-medium text-ink-700">
                    {t('auth.referralCode', '邀请码')}
                    <span className="text-muted font-normal ml-1">({t('common.optional', '选填')})</span>
                  </label>
                  <Input
                    id="referralCode"
                    type="text"
                    placeholder={t('auth.referralCodePlaceholder', '输入邀请码（如有）')}
                    value={form.referralCode}
                    onChange={handleInputChange('referralCode')}
                    disabled={isFormLoading}
                    maxLength={20}
                    className="uppercase"
                  />
                </div>
              )}

              {/* 忘记密码链接 + 记住我（仅登录模式） */}
              {mode === 'login' && (
                <div className="flex items-center justify-between">
                  {/* 记住我复选框 */}
                  <label className="flex cursor-pointer items-center gap-2.5 select-none group">
                    <Checkbox
                      checked={rememberMe}
                      onCheckedChange={(val) => setRememberMe(val === true)}
                      disabled={isFormLoading}
                      aria-label={t('auth.rememberMe', '记住我')}
                    />
                    <span className="text-sm text-muted group-hover:text-ink-700 transition-colors">
                      {t('auth.rememberMe', '记住我')}
                    </span>
                  </label>

                  <button
                    type="button"
                    className="text-sm text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
                    onClick={() => {
                      setFormErrors({});
                      clearError();
                      setMode('forgot-password');
                    }}
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </div>
              )}

              {/* 服务条款 + 隐私政策同意复选框（登录和注册模式均显示） */}
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="agree-to-terms"
                  checked={agreedToTerms}
                  onCheckedChange={(val) => setAgreedToTerms(val === true)}
                  disabled={isFormLoading}
                  aria-describedby="agree-to-terms-desc"
                  className="mt-0.5"
                />
                <label
                  htmlFor="agree-to-terms"
                  id="agree-to-terms-desc"
                  className="cursor-pointer text-sm text-muted leading-relaxed select-none"
                >
                  {t('auth.agreeToTerms', '我已阅读并同意')}{' '}
                  <button
                    type="button"
                    className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
                    onClick={() => handleOpenLegal('terms_of_service')}
                    tabIndex={0}
                  >
                    {t('auth.termsOfService', '服务条款')}
                  </button>
                  {' '}{t('auth.and', '和')}{' '}
                  <button
                    type="button"
                    className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
                    onClick={() => handleOpenLegal('privacy_policy')}
                    tabIndex={0}
                  >
                    {t('auth.privacyPolicy', '隐私政策')}
                  </button>
                </label>
              </div>

              {/* 全局错误提示 */}
              {error && (
                <div className="rounded-lg border border-error/20 bg-error-light px-4 py-3">
                  <p className="text-sm text-error">{error.message}</p>
                </div>
              )}

              {/* 提交按钮 */}
              <Button type="submit" className="w-full" disabled={isFormLoading}>
                {(isLoading || isSubmitting) && !oauthLoading ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 mr-2" />
                    {mode === 'login'
                      ? t('auth.loggingIn')
                      : t('auth.registering', '注册中...')}
                  </>
                ) : (
                  mode === 'login' ? t('auth.login') : t('auth.register')
                )}
              </Button>
            </form>

            {/* 注册/登录切换 */}
            <div className="mt-4 text-center text-sm text-muted">
              {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount', '已有账号？')}{' '}
              <button
                type="button"
                className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
                onClick={() => {
                  setFormErrors({});
                  clearError();
                  setMode(mode === 'login' ? 'register' : 'login');
                }}
              >
                {mode === 'login' ? t('auth.register') : t('auth.login')}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>

    {/* 法律内容弹窗（服务条款 / 隐私政策） */}
    <LegalContentModal state={legalModal} onClose={handleCloseLegal} />
    </>
  );
}

export default LoginModal;
