export type FatalRunnerErrorType =
  | 'login_required'
  | 'insufficient_balance'
  | 'fatal_api_error';

type FatalRunnerErrorPayload = {
  error: string;
  metadata?: {
    errorType: string;
    needsAuth?: boolean;
  };
};

const LOGIN_REQUIRED_PATTERNS = [
  'AUTH_1001',
  'auth_1001',
  'AUTH_1002',
  'auth_1002',
  'AUTH_1003',
  'auth_1003',
  'Please run /login',
  'please run /login',
  'login required',
  'authentication required',
  'missing authentication credentials',
  'invalid authentication credentials',
  'unauthenticated',
  '登录已过期',
  '未登录',
];

const BALANCE_ERROR_PATTERNS = [
  '积分不足',
  '余额不足',
  'rate_4002',
  'insufficient balance',
  'insufficient_balance',
  'api error: 402',
];

const FATAL_STDERR_PATTERN =
  /context_length_exceeded|maximum context length|context window.*exceeded|model.*decommissioned|model.*no longer available|deprecated.*model.*removed/i;

const CONTEXT_OVERFLOW_PATTERN =
  /context_length_exceeded|maximum context length|context window.*exceeded/i;

const MODEL_UNAVAILABLE_PATTERN =
  /model.*decommissioned|model.*no longer available|deprecated.*model.*removed/i;

function includesAnyPattern(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}

export function isLoginRequiredRunnerError(text: string): boolean {
  return includesAnyPattern(text, LOGIN_REQUIRED_PATTERNS);
}

export function isBalanceRunnerError(text: string): boolean {
  return includesAnyPattern(text, BALANCE_ERROR_PATTERNS);
}

export function isFatalRunnerStderr(text: string): boolean {
  return FATAL_STDERR_PATTERN.test(text);
}

export function normalizeFatalRunnerError(text: string): string {
  if (CONTEXT_OVERFLOW_PATTERN.test(text)) {
    return '上下文过长，请开启新会话或缩短输入后重试。';
  }

  if (MODEL_UNAVAILABLE_PATTERN.test(text)) {
    return '当前模型已下线或暂不可用，请切换模型后重试。';
  }

  return text.trim() || '请求失败，请稍后重试。';
}

export function buildFatalRunnerErrorPayload(
  type: FatalRunnerErrorType,
  rawError?: string
): FatalRunnerErrorPayload {
  switch (type) {
    case 'login_required':
      return {
        error: 'AUTH_1001',
        metadata: {
          errorType: 'UnauthenticatedError',
          needsAuth: true,
        },
      };
    case 'insufficient_balance':
      return {
        error: 'rate_4002',
        metadata: {
          errorType: 'InsufficientBalanceError',
        },
      };
    case 'fatal_api_error':
      return {
        error: normalizeFatalRunnerError(rawError ?? ''),
        metadata: {
          errorType: 'FatalApiError',
        },
      };
    default:
      return {
        error: rawError?.trim() || '请求失败，请稍后重试。',
      };
  }
}
