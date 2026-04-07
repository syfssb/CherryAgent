/**
 * OAuth 登录按钮组件
 * 提供 Google 和 GitHub OAuth 登录功能
 */
import { useTranslation } from "react-i18next";
import { useOAuth, type OAuthProvider } from "../hooks/useOAuth";

/**
 * OAuth 按钮配置
 */
const OAUTH_BUTTONS: Array<{
  provider: OAuthProvider;
  labelKey: string;
  icon: string;
  bgColor: string;
  hoverColor: string;
}> = [
  {
    provider: "google",
    labelKey: "auth.continueWithGoogle",
    icon: "🔍",
    bgColor: "bg-[#f0eee6]",
    hoverColor: "hover:bg-[#e8e6de]"
  },
  {
    provider: "github",
    labelKey: "auth.continueWithGitHub",
    icon: "🐙",
    bgColor: "bg-[#141413]",
    hoverColor: "hover:bg-[#1e1e1c]"
  }
];

/**
 * OAuth 登录按钮组件
 */
export function OAuthLoginButtons() {
  const { t } = useTranslation();
  const { isLoading, error, login, isAuthenticated } = useOAuth();

  /**
   * 处理 OAuth 登录
   */
  const handleOAuthLogin = async (provider: OAuthProvider) => {
    try {
      await login(provider);
    } catch (error) {
      // 错误已经在 useOAuth 中处理
      console.error("OAuth login failed:", error);
    }
  };

  // 如果已认证，不显示登录按钮
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="oauth-login-buttons space-y-3">
      {/* 标题 */}
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold text-[#141413] dark:text-[#f0eee6]">
          {t("oauth.welcomeTitle", "欢迎使用 Claude Cowork")}
        </h2>
        <p className="text-sm text-[#87867f] mt-2">
          {t("oauth.welcomeSubtitle", "选择一种方式登录以开始使用")}
        </p>
      </div>

      {/* OAuth 登录按钮 */}
      {OAUTH_BUTTONS.map(({ provider, labelKey, icon, bgColor, hoverColor }) => (
        <button
          key={provider}
          onClick={() => handleOAuthLogin(provider)}
          disabled={isLoading}
          className={`
            w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg
            ${bgColor} ${hoverColor}
            border border-[#1414131a]
            text-[#141413] dark:text-white font-medium
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
          `}
        >
          <span className="text-2xl">{icon}</span>
          <span>{isLoading ? t("auth.loggingIn", "登录中...") : t(labelKey)}</span>
        </button>
      ))}

      {/* 错误提示 */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">
            <strong>{t("oauth.loginFailed", "登录失败")}:</strong> {error}
          </p>
        </div>
      )}

      {/* 隐私说明 */}
      <div className="mt-6 text-center">
        <p className="text-xs text-[#87867f]">
          {t("oauth.termsPrefix", "登录即表示您同意我们的")}
          <button type="button" className="text-[#ae5630] hover:text-[#c4633a] underline">
            {t("oauth.termsOfService", "服务条款")}
          </button>
          {t("oauth.termsJoin", "和")}
          <button type="button" className="text-[#ae5630] hover:text-[#c4633a] underline">
            {t("oauth.privacyPolicy", "隐私政策")}
          </button>
        </p>
      </div>
    </div>
  );
}

/**
 * OAuth 登录页面
 * 完整的登录页面组件
 */
export function OAuthLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0eee6] p-4">
      <div className="max-w-md w-full bg-[#faf9f7] rounded-xl shadow-lg p-8">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
            <span className="text-3xl text-white">🤖</span>
          </div>
        </div>

        {/* 登录按钮 */}
        <OAuthLoginButtons />
      </div>
    </div>
  );
}
