import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { register, getLatestVersion, getWelcomeCredits, getCaptchaConfig, type VersionInfo, type WelcomeCredits, type CaptchaConfig } from '../lib/api';
import { Download, Sparkles, Gift, CreditCard, Zap, Shield, ArrowRight, Mail, Eye, EyeOff } from 'lucide-react';
import { detectPlatform, getDownloadUrl, PLATFORM_LABELS, DOWNLOAD_URLS } from '../lib/constants';
import { trackRegisterClick, trackRegisterSuccess } from '../lib/analytics';
import AntivirusModal from '../components/AntivirusModal';

/* ── 腾讯验证码脚本加载（模块级缓存，与桌面端 useTencentCaptcha.ts 同语义） ── */

const CAPTCHA_JS_URL = 'https://turing.captcha.qcloud.com/TCaptcha.js';

/** 模块级缓存：确保脚本只加载一次，多次调用复用同一 Promise */
let scriptLoadPromise: Promise<void> | null = null;

/** 加载腾讯验证码 SDK 脚本，返回 Promise<void>；已加载则立即 resolve */
function loadCaptchaScript(): Promise<void> {
  if ((window as any).TencentCaptcha) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CAPTCHA_JS_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null; // 失败后允许重试
      reject(new Error('验证码脚本加载失败，请检查网络后重试'));
    };
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

const REGISTER_FEATURES = [
  { icon: Gift, key: 'memory' },
  { icon: CreditCard, key: 'privacy' },
  { icon: Zap, key: 'skills' },
  { icon: Shield, key: 'price' },
] as const;

function getPasswordStrength(pwd: string): { strength: number; labelKey: string; color: string } {
  let strength = 0;
  if (pwd.length >= 8) strength++;
  if (/[A-Z]/.test(pwd)) strength++;
  if (/[a-z]/.test(pwd)) strength++;
  if (/[0-9]/.test(pwd)) strength++;
  if (/[^A-Za-z0-9]/.test(pwd)) strength++;

  if (strength <= 2) return { strength, labelKey: 'register.passwordStrength.weak', color: 'bg-red-500' };
  if (strength === 3) return { strength, labelKey: 'register.passwordStrength.medium', color: 'bg-yellow-500' };
  return { strength, labelKey: 'register.passwordStrength.strong', color: 'bg-[#ae5630]' };
}

export default function Register() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const refCode = searchParams.get('ref') || '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState(refCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState<VersionInfo | null>(null);
  const [welcomeCredits, setWelcomeCredits] = useState<WelcomeCredits>({ credits: 30, amount: 3 });
  const [showModal, setShowModal] = useState(false);
  const [pendingUrl, setPendingUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captchaConfig, setCaptchaConfig] = useState<CaptchaConfig | null>(null);
  /** null=加载中, true=成功, Error=失败 */
  const [captchaConfigStatus, setCaptchaConfigStatus] = useState<null | true | Error>(null);
  const [captchaShowing, setCaptchaShowing] = useState(false);

  useEffect(() => {
    const platform = detectPlatform();

    // 三个请求各自独立 catch，互不影响
    getLatestVersion(platform)
      .then((res) => { if (res.success && res.data) setDownloadInfo(res.data); })
      .catch(() => { /* 版本信息获取失败不影响注册 */ });

    getWelcomeCredits()
      .then((res) => { if (res.success && res.data) setWelcomeCredits(res.data); })
      .catch(() => { /* 额度信息获取失败使用默认值 */ });

    getCaptchaConfig()
      .then((res) => {
        if (res.success && res.data) {
          setCaptchaConfig(res.data);
          setCaptchaConfigStatus(true);
          // 预加载验证码脚本（不 await，仅预热；失败不阻塞）
          if (res.data.captchaEnabled && res.data.captchaAppId) {
            loadCaptchaScript().catch(() => {});
          }
        } else {
          setCaptchaConfigStatus(new Error('验证码配置加载异常'));
        }
      })
      .catch(() => {
        setCaptchaConfigStatus(new Error('验证码配置加载失败，请检查网络后刷新页面'));
      });
  }, []);

  function validateForm(): string | null {
    if (!email.trim()) return t('register.validation.emailRequired');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t('register.validation.emailInvalid');
    if (password.length < 8) return t('register.validation.passwordMin');
    if (!/[A-Z]/.test(password)) return t('register.validation.passwordUppercase');
    if (!/[a-z]/.test(password)) return t('register.validation.passwordLowercase');
    if (!/[0-9]/.test(password)) return t('register.validation.passwordNumber');
    if (password !== confirmPassword) return t('register.validation.passwordMismatch');
    return null;
  }

  /**
   * 弹出腾讯验证码，返回 ticket/randstr。
   * - 未启用验证码时返回空字符串（后端 captcha_enabled=false 场景）
   * - 脚本加载失败 / 构造失败时抛出错误（由 handleSubmit 处理）
   * - 用户关闭弹窗时抛出 USER_CANCELLED（handleSubmit 静默 return）
   */
  async function showCaptcha(): Promise<{ ticket: string; randstr: string }> {
    // 配置加载失败 → 直接报错，不让用户提交空 ticket 给后端
    if (captchaConfigStatus instanceof Error) {
      throw captchaConfigStatus;
    }
    // 配置未返回（仍在加载中）→ 提示用户稍等
    if (captchaConfigStatus === null) {
      throw new Error('安全配置加载中，请稍后再试');
    }
    // 后端未启用验证码 → 放行
    if (!captchaConfig?.captchaEnabled || !captchaConfig.captchaAppId) {
      return { ticket: '', randstr: '' };
    }

    // 先确保脚本加载完成（复用模块级缓存，首次 await 等加载，后续立即 resolve）
    await loadCaptchaScript();

    const TC = (window as any).TencentCaptcha;
    if (!TC) {
      throw new Error('验证码组件初始化失败，请刷新页面后重试');
    }

    setCaptchaShowing(true);
    try {
      return await new Promise<{ ticket: string; randstr: string }>((resolve, reject) => {
        const captcha = new TC(
          captchaConfig.captchaAppId,
          (res: { ret: number; ticket: string; randstr: string }) => {
            if (res.ret === 0) {
              resolve({ ticket: res.ticket, randstr: res.randstr });
            } else {
              reject(new Error('USER_CANCELLED'));
            }
          },
          {},
        );
        captcha.show();
      });
    } finally {
      setCaptchaShowing(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    // 验证码：失败时向用户显示错误，不静默降级（后端 captcha_enabled=true 时空 ticket 必被拒）
    let captchaTicket = '';
    let captchaRandstr = '';
    try {
      const result = await showCaptcha();
      captchaTicket = result.ticket;
      captchaRandstr = result.randstr;
    } catch (err) {
      if (err instanceof Error && err.message === 'USER_CANCELLED') return;
      // 脚本加载失败 / 组件初始化失败 → 显示错误，不继续提交
      setError(err instanceof Error ? err.message : t('register.errors.captchaFailed', '验证码加载失败，请刷新页面重试'));
      return;
    }

    setLoading(true);
    trackRegisterClick('register_page');
    try {
      const res = await register(
        email, password, name || undefined, referralCode || undefined,
        captchaTicket || undefined, captchaRandstr || undefined,
      );
      if (!res.success) {
        setError(res.error?.message || t('register.errors.registerFailed'));
        return;
      }

      trackRegisterSuccess(!!referralCode);
      setSuccess(true);
    } catch {
      setError(t('register.errors.networkError'));
    } finally {
      setLoading(false);
    }
  }

  const passwordStrength = password ? getPasswordStrength(password) : null;
  const platform = detectPlatform();
  const fallbackDownloadUrl = getDownloadUrl(platform);
  // Trusted origins for managed download URLs returned by the API server.
  // Set VITE_TRUSTED_DOWNLOAD_ORIGINS (comma-separated) in landing-web/.env to customize.
  const downloadBase = import.meta.env.VITE_DOWNLOAD_BASE_URL;
  const TRUSTED_DOWNLOAD_ORIGINS = [
    ...(downloadBase ? [`${downloadBase}/`] : []),
    ...(import.meta.env.VITE_TRUSTED_DOWNLOAD_ORIGINS
      ? import.meta.env.VITE_TRUSTED_DOWNLOAD_ORIGINS.split(',').map((s: string) => s.trim()).filter(Boolean)
      : []),
  ];
  const isTrustedReleaseUrl = (url?: string | null) =>
    !!url && TRUSTED_DOWNLOAD_ORIGINS.some((origin) => url.startsWith(origin));
  const hasManagedDownloadInfo = Boolean(downloadInfo?.version && isTrustedReleaseUrl(downloadInfo?.downloadUrl));
  const primaryDownloadUrl = isTrustedReleaseUrl(downloadInfo?.downloadUrl)
    ? downloadInfo!.downloadUrl
    : fallbackDownloadUrl;

  const handleDownloadClick = (url: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (detectPlatform() === 'win_x64') {
      setPendingUrl(url);
      setShowModal(true);
    } else {
      window.location.href = url;
    }
  };

  const handleConfirm = () => {
    setShowModal(false);
    window.location.href = pendingUrl;
  };

  if (success) {
    return (
      <>
      <div className="min-h-screen bg-[#141413] relative overflow-hidden flex items-center justify-center px-4">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#ae5630]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#ae5630]/8 rounded-full blur-3xl" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#ae5630]/5 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-2xl text-center space-y-8">
          {/* Celebration */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="text-8xl animate-bounce">🎉</div>
              <div className="absolute -top-4 -right-4 text-4xl" style={{ animation: 'spin 3s linear infinite' }}>✨</div>
              <div className="absolute -bottom-4 -left-4 text-4xl" style={{ animation: 'spin 3s linear infinite reverse', animationDelay: '0.5s' }}>🎊</div>
            </div>
          </div>

          {/* Success title */}
          <div className="space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold text-[#faf9f5]">
              {t('register.success.title')}
            </h1>

            {/* Reward card */}
            <div className="inline-block">
              <div className="relative group">
                <div className="absolute inset-0 bg-[#ae5630] rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity" />
                <div className="relative px-8 py-4 bg-[#ae5630]/15 border border-[#ae5630]/30 rounded-2xl backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-6 h-6 text-[#ae5630]" />
                    <p className="text-[#ae5630] font-bold text-xl">
                      {t('register.success.reward', { amount: welcomeCredits.amount })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[#9a9893] text-lg max-w-xl mx-auto leading-relaxed">
              {t('register.success.description')}
            </p>
          </div>

          {/* 邮箱验证提示 */}
          <div className="w-full max-w-md mx-auto">
            <div className="relative rounded-2xl border border-[#faf9f5]/10 bg-[#faf9f5]/[0.03] backdrop-blur-sm px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ae5630]/12 border border-[#ae5630]/20">
                  <Mail className="h-5 w-5 text-[#ae5630]" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-[#faf9f5]">
                    {t('register.success.verifyEmailTitle', '验证您的邮箱')}
                  </p>
                  <p className="text-sm text-[#9a9893] leading-relaxed">
                    {t('register.success.verifyEmailDesc', '我们已向 {{email}} 发送了验证邮件，请点击邮件中的链接完成验证后即可登录使用。', { email })}
                  </p>
                  <p className="text-xs text-[#6b6a68]">
                    {t('register.success.verifyEmailHint', '如未收到，请检查垃圾邮件文件夹')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Download buttons */}
          <div className="space-y-6 pt-4">
            {hasManagedDownloadInfo ? (
              <a
                href={primaryDownloadUrl}
                onClick={handleDownloadClick(primaryDownloadUrl)}
                className="group inline-flex items-center gap-3 px-10 py-5 bg-[#ae5630] text-white text-lg font-bold rounded-2xl hover:bg-[#c4633a] active:scale-[0.98] transition-all shadow-2xl shadow-[#ae5630]/30"
              >
                <Download size={24} className="group-hover:animate-bounce" />
                {t('register.success.downloadWithVersion', { platform: PLATFORM_LABELS[platform], version: downloadInfo.version })}
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </a>
            ) : (
              <a
                href={primaryDownloadUrl}
                onClick={handleDownloadClick(primaryDownloadUrl)}
                className="group inline-flex items-center gap-3 px-10 py-5 bg-[#ae5630] text-white text-lg font-bold rounded-2xl hover:bg-[#c4633a] active:scale-[0.98] transition-all shadow-2xl shadow-[#ae5630]/30"
              >
                <Download size={24} className="group-hover:animate-bounce" />
                {t('register.success.downloadPlatform', { platform: PLATFORM_LABELS[platform] })}
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </a>
            )}

            {/* Other platforms */}
            <div className="space-y-3">
              <p className="text-sm text-[#6b6a68]">{t('register.success.otherPlatforms')}</p>
              <div className="flex flex-wrap gap-3 justify-center">
                {(['mac_arm64', 'mac_x64', 'win_x64'] as const).map((p) => (
                  <a
                    key={p}
                    href={DOWNLOAD_URLS[p]}
                    onClick={handleDownloadClick(DOWNLOAD_URLS[p])}
                    className="px-4 py-2 bg-[#faf9f5]/5 hover:bg-[#faf9f5]/10 border border-[#faf9f51a] hover:border-[#faf9f533] rounded-lg text-sm text-[#9a9893] hover:text-[#faf9f5] transition-all"
                  >
                    {PLATFORM_LABELS[p]}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Back to home */}
          <button
            onClick={() => navigate('/')}
            className="text-sm text-[#6b6a68] hover:text-[#9a9893] transition-colors underline"
          >
            {t('register.success.backHome')}
          </button>
        </div>
      </div>

      <AntivirusModal
        open={showModal}
        onConfirm={handleConfirm}
        onClose={() => setShowModal(false)}
      />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f5] relative overflow-hidden">
      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row">
        {/* Left panel: product value */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-12 xl:px-20 py-12 bg-[#141413]">
          <div className="max-w-xl space-y-12">
            {/* Logo */}
            <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src="/app-icon.png" alt="Cherry Agent" className="w-12 h-12" />
              <span className="text-2xl font-bold text-[#faf9f5]">Cherry Agent</span>
            </a>

            {/* Main title */}
            <div className="space-y-4">
              <h1 className="text-5xl xl:text-6xl font-bold text-[#faf9f5] leading-tight">
                {t('register.sideTitle')}
                <br />
                <span className="text-[#ae5630]">
                  {t('register.sideSubtitle')}
                </span>
              </h1>
              <p className="text-xl text-[#9a9893]">
                {t('register.sideSubtitle')}
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-6">
              {REGISTER_FEATURES.map((feature, i) => (
                <div key={i} className="flex items-start gap-4 group">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#ae5630]/15 border border-[#faf9f51a] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <feature.icon className="w-6 h-6 text-[#ae5630]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#faf9f5] mb-1">{t(`register.features.${feature.key}.title`)}</h3>
                    <p className="text-sm text-[#9a9893]">{t(`register.features.${feature.key}.desc`)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <div className="pt-8 border-t border-[#faf9f51a]">
              <div className="bg-[#faf9f5]/5 backdrop-blur-sm border border-[#faf9f51a] rounded-xl p-4 hover:bg-[#faf9f5]/10 transition-colors">
                <p className="text-sm text-[#9a9893] italic mb-2">
                  {t('register.testimonial.quote')}
                </p>
                <p className="text-xs text-[#6b6a68]">— {t('register.testimonial.author')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel: registration form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 bg-[#faf9f5]">
          <div className="w-full max-w-md space-y-8">
            {/* Mobile Logo */}
            <div className="lg:hidden flex items-center justify-center gap-3">
              <img src="/app-icon.png" alt="Cherry Agent" className="w-10 h-10" />
              <span className="text-xl font-bold text-[#141413]">Cherry Agent</span>
            </div>

            {/* Referral reward banner */}
            {refCode && (
              <div className="relative group">
                <div className="absolute inset-0 bg-[#ae5630] rounded-xl blur-lg opacity-20 group-hover:opacity-30 transition-opacity" />
                <div className="relative bg-[#ae5630]/10 border border-[#ae5630]/30 rounded-xl p-5 backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-6 h-6 text-[#ae5630] flex-shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <p className="text-[#ae5630] font-bold text-lg mb-1">
                        {t('register.referralBanner.title')}
                      </p>
                      <p className="text-sm text-[#ae5630]/80">
                        {t('register.referralBanner.desc', { amount: welcomeCredits.amount })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Form title */}
            <div className="text-center lg:text-left">
              <h2 className="text-3xl font-bold text-[#141413] mb-2">{t('register.formTitle')}</h2>
              <p className="text-[#6b6a68]">{t('register.formSubtitle')}</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-[#141413] mb-2">{t('register.fields.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('register.placeholders.email')}
                  className="w-full px-4 py-3 bg-white border border-[#1414131a] rounded-xl text-[#141413] placeholder-[#87867f] focus:outline-none focus:ring-2 focus:ring-[#ae5630]/30 focus:border-[#ae5630]/50 transition-all"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-[#141413] mb-2">{t('register.fields.password')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('register.placeholders.password')}
                    className="w-full px-4 py-3 pr-11 bg-white border border-[#1414131a] rounded-xl text-[#141413] placeholder-[#87867f] focus:outline-none focus:ring-2 focus:ring-[#ae5630]/30 focus:border-[#ae5630]/50 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-[#87867f] hover:text-[#ae5630] transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
                {/* Password strength indicator */}
                {password && passwordStrength && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className={`h-1 flex-1 rounded-full transition-all ${
                            level <= passwordStrength.strength ? passwordStrength.color : 'bg-[#1414131a]'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-[#87867f]">
                      {t('register.passwordStrength.label')}<span className={passwordStrength.strength >= 4 ? 'text-[#ae5630]' : passwordStrength.strength === 3 ? 'text-yellow-500' : 'text-red-500'}>{t(passwordStrength.labelKey)}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-sm font-medium text-[#141413] mb-2">{t('register.fields.confirmPassword')}</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('register.placeholders.confirmPassword')}
                    className="w-full px-4 py-3 pr-11 bg-white border border-[#1414131a] rounded-xl text-[#141413] placeholder-[#87867f] focus:outline-none focus:ring-2 focus:ring-[#ae5630]/30 focus:border-[#ae5630]/50 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-[#87867f] hover:text-[#ae5630] transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              {/* Nickname */}
              <div>
                <label className="block text-sm font-medium text-[#141413] mb-2">
                  {t('register.fields.nickname')} <span className="text-[#87867f] text-xs">{t('register.fields.nicknameOptional')}</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('register.placeholders.nickname')}
                  className="w-full px-4 py-3 bg-white border border-[#1414131a] rounded-xl text-[#141413] placeholder-[#87867f] focus:outline-none focus:ring-2 focus:ring-[#ae5630]/30 focus:border-[#ae5630]/50 transition-all"
                />
              </div>

              {/* Referral code */}
              <div>
                <label className="block text-sm font-medium text-[#141413] mb-2">
                  {t('register.fields.referralCode')} <span className="text-[#87867f] text-xs">{t('register.fields.referralCodeOptional')}</span>
                </label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  placeholder={t('register.placeholders.referralCode')}
                  className="w-full px-4 py-3 bg-white border border-[#1414131a] rounded-xl text-[#141413] placeholder-[#87867f] focus:outline-none focus:ring-2 focus:ring-[#ae5630]/30 focus:border-[#ae5630]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  readOnly={!!refCode}
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              {/* 验证码状态提示 */}
              {captchaShowing && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#ae5630]/6 border border-[#ae5630]/15">
                  <svg className="h-4 w-4 animate-spin text-[#ae5630] shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm text-[#ae5630] font-medium">{t('register.captchaVerifying', '请完成安全验证')}</span>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading || captchaShowing}
                className="w-full py-4 bg-[#ae5630] text-white font-bold text-lg rounded-lg hover:bg-[#c4633a] disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#ae5630]/20"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {t('register.submitting')}
                  </span>
                ) : (
                  t('register.submitBtn')
                )}
              </button>
            </form>

            {/* Already have account */}
            <p className="text-center text-sm text-[#87867f]">
              {t('register.hasAccount')}{' '}
              <a
                href={getDownloadUrl()}
                onClick={handleDownloadClick(getDownloadUrl())}
                className="text-[#141413] underline hover:text-[#ae5630] transition-colors"
              >
                {t('register.desktopClient')}
              </a>{' '}
              {t('register.loginSuffix')}
            </p>
          </div>
        </div>
      </div>

      <AntivirusModal
        open={showModal}
        onConfirm={handleConfirm}
        onClose={() => setShowModal(false)}
      />
    </div>
  );
}
