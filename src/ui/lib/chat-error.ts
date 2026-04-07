export const INSUFFICIENT_BALANCE_MESSAGE = '当前积分不足，无法继续本次任务。请先充值后再试。';
export const LOGIN_REQUIRED_MESSAGE = '登录已过期，请重新登录后继续使用。';
export const PERMANENT_MODEL_UNAVAILABLE_MESSAGE = '当前模型暂无可用渠道，请切换模型或稍后再试。';
export const TRANSIENT_CHAT_ERROR_MESSAGE = '请求失败，请稍后重试。';

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
  '未登录或登录已过期',
  '未登录',
];
const BALANCE_PATTERNS = [
  '积分不足',
  '余额不足',
  'rate_4002',
  'insufficient balance',
  'insufficient_balance',
  'api error: 402',
];
const PERMANENT_PATTERNS = [
  'model_not_found',
  'no available channel',
  'under group',
  '没有可用渠道',
  '没有可用的渠道',
];
const RETRYABLE_PATTERNS = [
  'timeout',
  'timed out',
  'network',
  'fetch failed',
  'server_error',
  'overloaded',
  '请求超时',
  '连接超时',
  '稍后重试',
  // SDK 内部错误（不应暴露给用户，归为可重试通用提示）
  'only prompt commands are supported',
  'srv_9001',
  '服务器内部错误',
];

type ParsedErrorPayload = {
  status?: number;
  code?: string;
  message?: string;
};

function containsPattern(text: string, patterns: string[]): boolean {
  const normalized = text.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function extractJsonPayload(text: string): ParsedErrorPayload {
  const jsonStart = text.indexOf('{');
  if (jsonStart === -1) {
    return {};
  }

  try {
    const parsed = JSON.parse(text.slice(jsonStart)) as Record<string, unknown>;
    const errorObject = parsed.error && typeof parsed.error === 'object'
      ? parsed.error as Record<string, unknown>
      : null;

    return {
      code: typeof errorObject?.code === 'string'
        ? errorObject.code
        : typeof parsed.code === 'string'
          ? parsed.code
          : undefined,
      message: typeof errorObject?.message === 'string'
        ? errorObject.message
        : typeof parsed.message === 'string'
          ? parsed.message
          : undefined,
    };
  } catch {
    return {};
  }
}

function parseErrorPayload(text: string): ParsedErrorPayload {
  const apiErrorMatch = text.match(/^API Error:\s*(\d{3})(?:\s+(.*))?$/i);
  if (apiErrorMatch) {
    const status = Number(apiErrorMatch[1]);
    const rest = apiErrorMatch[2]?.trim() ?? '';
    const parsed = extractJsonPayload(rest);
    return {
      status,
      code: parsed.code,
      message: parsed.message,
    };
  }

  const parsed = extractJsonPayload(text);
  return {
    ...parsed,
    status: undefined,
  };
}

export function isLoginRequiredErrorText(message: string | undefined): boolean {
  if (!message) return false;
  return containsPattern(message, LOGIN_REQUIRED_PATTERNS);
}

export function isBalanceErrorText(message: string | undefined): boolean {
  if (!message) {
    return false;
  }
  return containsPattern(message, BALANCE_PATTERNS);
}

function isPermanentModelUnavailableText(message: string): boolean {
  return containsPattern(message, PERMANENT_PATTERNS);
}

function isRetryableTransportErrorText(message: string, status?: number): boolean {
  if (status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }
  return containsPattern(message, RETRYABLE_PATTERNS);
}

export function normalizeChatErrorText(text: string | undefined): { text: string; isBalanceError: boolean; isLoginError?: boolean } {
  const rawText = text?.trim() ?? '';
  if (!rawText) {
    return { text: TRANSIENT_CHAT_ERROR_MESSAGE, isBalanceError: false };
  }

  const parsed = parseErrorPayload(rawText);
  const combined = [rawText, parsed.code, parsed.message].filter(Boolean).join(' ');

  if (isLoginRequiredErrorText(combined)) {
    return {
      text: LOGIN_REQUIRED_MESSAGE,
      isBalanceError: false,
      isLoginError: true,
    };
  }

  if (isBalanceErrorText(combined)) {
    return {
      text: INSUFFICIENT_BALANCE_MESSAGE,
      isBalanceError: true,
    };
  }

  if (isPermanentModelUnavailableText(combined)) {
    return {
      text: PERMANENT_MODEL_UNAVAILABLE_MESSAGE,
      isBalanceError: false,
    };
  }

  if (parsed.status !== undefined) {
    if ([404, 409, 422].includes(parsed.status) && parsed.message) {
      return {
        text: parsed.message,
        isBalanceError: false,
      };
    }

    if (isRetryableTransportErrorText(combined, parsed.status)) {
      return {
        text: TRANSIENT_CHAT_ERROR_MESSAGE,
        isBalanceError: false,
      };
    }
  }

  if (isRetryableTransportErrorText(combined, parsed.status)) {
    return {
      text: TRANSIENT_CHAT_ERROR_MESSAGE,
      isBalanceError: false,
    };
  }

  // 对话历史过期
  if (/no conversation found|conversation.*not found/i.test(combined)) {
    return { text: '对话历史已过期，已自动重置。请重新发送消息，将以新对话继续。', isBalanceError: false };
  }

  return {
    text: parsed.message || rawText,
    isBalanceError: false,
  };
}

export function getGlobalChatErrorMessage(text: string | undefined): string | null {
  const normalized = normalizeChatErrorText(text);

  if (normalized.text === LOGIN_REQUIRED_MESSAGE || normalized.isLoginError) {
    return LOGIN_REQUIRED_MESSAGE;
  }

  if (normalized.text === INSUFFICIENT_BALANCE_MESSAGE || normalized.isBalanceError) {
    return INSUFFICIENT_BALANCE_MESSAGE;
  }

  return null;
}

export function isGloballyHandledChatErrorText(text: string | undefined): boolean {
  return getGlobalChatErrorMessage(text) !== null;
}
