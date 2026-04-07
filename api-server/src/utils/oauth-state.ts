import crypto from 'crypto';
import { z } from 'zod';
import { env } from './env.js';
import { AuthenticationError, ValidationError } from './errors.js';

export type OAuthProvider = 'google';

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

const statePayloadSchema = z.object({
  v: z.literal(1),
  nonce: z.string().min(16),
  provider: z.enum(['google']),
  iat: z.number().int(),
  exp: z.number().int(),
  redirectUri: z.string().min(1),
  codeChallenge: z.string().optional(),
});

type OAuthStatePayload = z.infer<typeof statePayloadSchema>;

const consumedStates = new Map<string, number>();

interface CreateOAuthStateOptions {
  provider: OAuthProvider;
  redirectUri: string;
  codeChallenge?: string;
  ttlMs?: number;
  now?: number;
}

interface VerifyOAuthStateOptions {
  provider: OAuthProvider;
  redirectUri: string;
  codeVerifier?: string;
  now?: number;
}

function signState(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(encodedPayload)
    .digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function decodePayload(encodedPayload: string): OAuthStatePayload {
  try {
    const json = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    return statePayloadSchema.parse(parsed);
  } catch {
    throw new ValidationError('OAuth state 格式无效');
  }
}

function cleanupConsumedStates(now: number): void {
  for (const [state, expiresAt] of consumedStates.entries()) {
    if (expiresAt <= now) {
      consumedStates.delete(state);
    }
  }
}

function verifyCodeChallenge(codeChallenge: string, codeVerifier?: string): void {
  if (!codeVerifier) {
    throw new ValidationError('缺少 code_verifier');
  }

  const expectedChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  if (!safeEqual(codeChallenge, expectedChallenge)) {
    throw new AuthenticationError('OAuth code_verifier 校验失败');
  }
}

export function createOAuthState(options: CreateOAuthStateOptions): string {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_STATE_TTL_MS;

  const payload: OAuthStatePayload = {
    v: 1,
    nonce: crypto.randomBytes(16).toString('hex'),
    provider: options.provider,
    iat: now,
    exp: now + ttlMs,
    redirectUri: options.redirectUri,
    ...(options.codeChallenge ? { codeChallenge: options.codeChallenge } : {}),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signState(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyOAuthState(
  state: string,
  options: VerifyOAuthStateOptions,
): OAuthStatePayload {
  const now = options.now ?? Date.now();
  cleanupConsumedStates(now);

  if (!state || typeof state !== 'string') {
    throw new ValidationError('缺少 OAuth state');
  }

  const segments = state.split('.');
  if (segments.length !== 2) {
    throw new ValidationError('OAuth state 格式无效');
  }

  if (consumedStates.has(state)) {
    throw new AuthenticationError('OAuth state 已使用或已失效');
  }

  const encodedPayload = segments[0];
  const signature = segments[1];
  if (!encodedPayload || !signature) {
    throw new ValidationError('OAuth state 格式无效');
  }
  const expectedSignature = signState(encodedPayload);

  if (!safeEqual(signature, expectedSignature)) {
    throw new AuthenticationError('OAuth state 校验失败');
  }

  const payload = decodePayload(encodedPayload);

  if (payload.provider !== options.provider) {
    throw new ValidationError('OAuth provider 不匹配');
  }

  if (payload.redirectUri !== options.redirectUri) {
    throw new ValidationError('OAuth redirect_uri 不匹配');
  }

  if (payload.exp + CLOCK_SKEW_MS < now) {
    throw new AuthenticationError('OAuth state 已过期');
  }

  if (payload.iat - CLOCK_SKEW_MS > now) {
    throw new ValidationError('OAuth state 时间戳无效');
  }

  if (payload.codeChallenge) {
    verifyCodeChallenge(payload.codeChallenge, options.codeVerifier);
  }

  consumedStates.set(state, payload.exp + CLOCK_SKEW_MS);

  return payload;
}

export function resetOAuthStateCacheForTest(): void {
  consumedStates.clear();
}
