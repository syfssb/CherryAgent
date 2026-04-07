// Fallback to localhost for open-source builds; set CHERRY_API_URL in .env for production
const DEFAULT_API_BASE_URL = process.env.CHERRY_API_URL ?? "http://localhost:3000/api";

function normalizeBaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  return (
    normalizeBaseUrl(process.env.AUTH_API_URL) ??
    normalizeBaseUrl(process.env.VITE_API_BASE_URL) ??
    DEFAULT_API_BASE_URL
  );
}

export function getApiOriginBaseUrl(): string {
  const apiBase = getApiBaseUrl();
  return apiBase.replace(/\/api\/?$/, "");
}

export function getProxyBaseUrl(): string {
  return (
    normalizeBaseUrl(process.env.VITE_PROXY_BASE_URL) ??
    normalizeBaseUrl(process.env.PROXY_BASE_URL) ??
    getApiBaseUrl()
  );
}

export function applyRuntimeEnvDefaults(): void {
  if (!normalizeBaseUrl(process.env.VITE_API_BASE_URL)) {
    process.env.VITE_API_BASE_URL = getApiBaseUrl();
  }
  if (!normalizeBaseUrl(process.env.AUTH_API_URL)) {
    process.env.AUTH_API_URL = getApiBaseUrl();
  }
  if (
    !normalizeBaseUrl(process.env.VITE_PROXY_BASE_URL) &&
    !normalizeBaseUrl(process.env.PROXY_BASE_URL)
  ) {
    process.env.VITE_PROXY_BASE_URL = getProxyBaseUrl();
  }
}

