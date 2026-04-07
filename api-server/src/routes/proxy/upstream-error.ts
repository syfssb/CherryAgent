import { AppError, ExternalServiceError, ProviderError } from '../../utils/errors.js';

export const PERMANENT_PROVIDER_ERROR_MESSAGE = '当前模型暂无可用渠道，请切换模型或稍后再试。';

const NON_RETRYABLE_UPSTREAM_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422, 429]);
const NETWORK_ERROR_PATTERNS = [
  'network',
  'fetch failed',
  'socket hang up',
  'econnreset',
  'econnrefused',
  'enotfound',
  'eai_again',
  'tls',
];
const TIMEOUT_ERROR_PATTERNS = [
  'timed out',
  'timeout',
  'request aborted',
  'aborterror',
  'signal is aborted',
  'body timeout',
  'headers timeout',
  '连接超时',
  '未响应',
];
const PERMANENT_PROVIDER_ERROR_PATTERNS = [
  'model_not_found',
  'no available channel',
  'under group',
  '没有可用渠道',
  '没有可用的渠道',
];

type ParsedUpstreamError = {
  code?: string;
  message: string;
};

function toBodySnippet(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) return 'empty response body';
  return trimmed.length > 1000 ? `${trimmed.slice(0, 1000)}...` : trimmed;
}

function parseUpstreamErrorBody(bodyText: string, fallbackStatus: number): ParsedUpstreamError {
  const snippet = toBodySnippet(bodyText);

  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const errorObject = parsed.error && typeof parsed.error === 'object'
      ? parsed.error as Record<string, unknown>
      : null;

    const code = typeof errorObject?.code === 'string'
      ? errorObject.code
      : typeof parsed.code === 'string'
        ? parsed.code
        : undefined;

    const message = typeof errorObject?.message === 'string'
      ? errorObject.message
      : typeof parsed.message === 'string'
        ? parsed.message
        : snippet;

    return {
      code,
      message: message || `upstream request failed with status ${fallbackStatus}`,
    };
  } catch {
    return {
      message: snippet || `upstream request failed with status ${fallbackStatus}`,
    };
  }
}

function containsPattern(haystack: string, patterns: string[]): boolean {
  const normalized = haystack.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function isPermanentProviderCondition(status: number, code?: string, message?: string, bodyText?: string): boolean {
  if (status < 500) {
    return false;
  }

  const combined = [code, message, bodyText].filter(Boolean).join(' ').toLowerCase();
  return containsPattern(combined, PERMANENT_PROVIDER_ERROR_PATTERNS);
}

function isLocalPermanentProviderMessage(message: string): boolean {
  return containsPattern(message, [
    '没有可用的渠道支持模型',
    '没有可用的 provider 适配器',
    'no available channel',
    'model_not_found',
  ]);
}

function buildDetails(service: string, statusCode?: number, upstreamCode?: string, bodyText?: string): Record<string, unknown> {
  return {
    service,
    ...(statusCode !== undefined ? { upstreamStatus: statusCode } : {}),
    ...(upstreamCode ? { upstreamCode } : {}),
    ...(bodyText ? { upstreamBody: toBodySnippet(bodyText) } : {}),
  };
}

export class UpstreamHttpError extends Error {
  public readonly service: string;
  public readonly upstreamStatus: number;
  public readonly upstreamCode?: string;
  public readonly upstreamBodyText: string;
  public readonly retryable: boolean;

  constructor(service: string, status: number, bodyText: string) {
    const parsed = parseUpstreamErrorBody(bodyText, status);
    const retryable = !NON_RETRYABLE_UPSTREAM_STATUS_CODES.has(status)
      && !isPermanentProviderCondition(status, parsed.code, parsed.message, bodyText);

    super(parsed.message);
    this.name = 'UpstreamHttpError';
    this.service = service;
    this.upstreamStatus = status;
    this.upstreamCode = parsed.code;
    this.upstreamBodyText = bodyText;
    this.retryable = retryable;

    Error.captureStackTrace(this, this.constructor);
  }
}

export function createUpstreamHttpError(service: string, status: number, bodyText: string): UpstreamHttpError {
  return new UpstreamHttpError(service, status, bodyText);
}

export function normalizeProxyRouteError(service: string, error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof UpstreamHttpError) {
    if (isPermanentProviderCondition(
      error.upstreamStatus,
      error.upstreamCode,
      error.message,
      error.upstreamBodyText,
    )) {
      return new ProviderError(
        PERMANENT_PROVIDER_ERROR_MESSAGE,
        409,
        buildDetails(service, error.upstreamStatus, error.upstreamCode, error.upstreamBodyText),
      );
    }

    if (NON_RETRYABLE_UPSTREAM_STATUS_CODES.has(error.upstreamStatus)) {
      return new ProviderError(
        error.message,
        error.upstreamStatus,
        buildDetails(service, error.upstreamStatus, error.upstreamCode, error.upstreamBodyText),
      );
    }

    return new ExternalServiceError(
      service,
      error.message,
      buildDetails(service, error.upstreamStatus, error.upstreamCode, error.upstreamBodyText),
      error.upstreamStatus >= 500 ? error.upstreamStatus : 502,
    );
  }

  if (error instanceof Error) {
    if (isLocalPermanentProviderMessage(error.message)) {
      return new ProviderError(
        PERMANENT_PROVIDER_ERROR_MESSAGE,
        409,
        buildDetails(service),
      );
    }

    if (containsPattern(error.message, TIMEOUT_ERROR_PATTERNS)) {
      return new ExternalServiceError(service, error.message, buildDetails(service), 504);
    }

    if (containsPattern(error.message, NETWORK_ERROR_PATTERNS)) {
      return new ExternalServiceError(service, error.message, buildDetails(service), 502);
    }

    return new ExternalServiceError(service, error.message, buildDetails(service), 502);
  }

  return new ExternalServiceError(service, String(error), buildDetails(service), 502);
}
