/**
 * 腾讯云验证码服务
 *
 * 使用 TC3-HMAC-SHA256 签名直接调用腾讯云 DescribeCaptchaResult API，
 * 不依赖腾讯云 SDK，仅使用 node 内置 crypto + 内置 fetch。
 *
 * 配置项从 system_configs 表读取：
 * - captcha_enabled         是否启用验证码
 * - captcha_secret_id       腾讯云 SecretId
 * - captcha_secret_key      腾讯云 SecretKey
 * - captcha_app_id          验证码 CaptchaAppId
 * - captcha_app_secret_key  验证码 AppSecretKey
 */

import crypto from 'crypto';
import { getSystemConfigs, getSystemConfigBool } from './config.js';
import { ValidationError } from '../utils/errors.js';

// ============================================================
// TC3-HMAC-SHA256 签名工具
// ============================================================

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

interface TencentApiParams {
  secretId: string;
  secretKey: string;
  service: string;
  action: string;
  version: string;
  payload: string;
  timestamp: number;
}

function buildAuthorization(params: TencentApiParams): string {
  const { secretId, secretKey, service, action: _action, version: _version, payload, timestamp } = params;

  const date = new Date(timestamp * 1000).toISOString().slice(0, 10); // YYYY-MM-DD
  const host = `${service}.tencentcloudapi.com`;

  // Step 1: 构造规范请求（Canonical Request）
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const contentType = 'application/json; charset=utf-8';
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const hashedRequestPayload = sha256Hex(payload);

  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n');

  // Step 2: 构造待签名字符串（String to Sign）
  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);

  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  // Step 3: 计算签名
  const secretDate = hmacSha256(Buffer.from(`TC3${secretKey}`, 'utf8'), date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = crypto
    .createHmac('sha256', secretSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  // Step 4: 构造 Authorization
  return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

// ============================================================
// 腾讯云验证码 API 调用
// ============================================================

interface CaptchaResponse {
  Response: {
    CaptchaCode: number;
    CaptchaMsg: string;
    EvilLevel: number;
    GetCaptchaTime: number;
    RequestId: string;
    Error?: {
      Code: string;
      Message: string;
    };
  };
}

async function callDescribeCaptchaResult(options: {
  secretId: string;
  secretKey: string;
  captchaAppId: number;
  appSecretKey: string;
  ticket: string;
  randstr: string;
  userIp: string;
}): Promise<CaptchaResponse> {
  const { secretId, secretKey, captchaAppId, appSecretKey, ticket, randstr, userIp } = options;

  const service = 'captcha';
  const host = `${service}.tencentcloudapi.com`;
  const action = 'DescribeCaptchaResult';
  const version = '2019-07-22';
  const timestamp = Math.floor(Date.now() / 1000);

  const payload = JSON.stringify({
    CaptchaType: 9,
    Ticket: ticket,
    UserIp: userIp,
    Randstr: randstr,
    CaptchaAppId: captchaAppId,
    AppSecretKey: appSecretKey,
  });

  const authorization = buildAuthorization({
    secretId,
    secretKey,
    service,
    action,
    version,
    payload,
    timestamp,
  });

  const response = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Host': host,
      'Authorization': authorization,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': String(timestamp),
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`Tencent Captcha API HTTP error: ${response.status}`);
  }

  return response.json() as Promise<CaptchaResponse>;
}

// ============================================================
// 高层接口
// ============================================================

/**
 * 从数据库读取验证码配置后验证
 *
 * - captcha_enabled = false 时直接放行
 * - captcha_enabled = true 但 ticket 为空时抛出 ValidationError
 * - 调用腾讯 API 验证失败时抛出 ValidationError
 */
export async function verifyCaptchaFromConfig(
  ticket: string | undefined,
  randstr: string | undefined,
  userIp: string
): Promise<void> {
  const enabled = await getSystemConfigBool('captcha_enabled', false);
  if (!enabled) {
    return;
  }

  if (!ticket || !randstr) {
    throw new ValidationError('请完成验证码验证');
  }

  // 批量读取验证码配置
  const configs = await getSystemConfigs([
    'captcha_secret_id',
    'captcha_secret_key',
    'captcha_app_id',
    'captcha_app_secret_key',
  ]);

  const secretId = configs.get('captcha_secret_id') ?? '';
  const secretKey = configs.get('captcha_secret_key') ?? '';
  const appIdStr = configs.get('captcha_app_id') ?? '';
  const appSecretKey = configs.get('captcha_app_secret_key') ?? '';

  if (!secretId || !secretKey || !appIdStr || !appSecretKey) {
    // 配置不完整时记录错误但不阻塞（管理员配置疏忽不应影响用户注册/登录）
    console.error('[Captcha] 验证码配置不完整，跳过验证');
    return;
  }

  const captchaAppId = Number(appIdStr);
  if (isNaN(captchaAppId) || captchaAppId <= 0) {
    console.error('[Captcha] captcha_app_id 格式无效:', appIdStr);
    return;
  }

  try {
    const result = await callDescribeCaptchaResult({
      secretId,
      secretKey,
      captchaAppId,
      appSecretKey,
      ticket,
      randstr,
      userIp,
    });

    if (result.Response.Error) {
      console.error('[Captcha] 腾讯 API 返回错误:', result.Response.Error);
      throw new ValidationError('验证码验证失败，请重试');
    }

    // CaptchaCode === 1 表示验证通过
    if (result.Response.CaptchaCode !== 1) {
      console.warn(
        '[Captcha] 验证未通过, CaptchaCode:',
        result.Response.CaptchaCode,
        'CaptchaMsg:',
        result.Response.CaptchaMsg
      );
      throw new ValidationError('验证码验证失败，请重试');
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('[Captcha] 调用腾讯验证码 API 异常:', error);
    throw new ValidationError('验证码验证失败，请重试');
  }
}
