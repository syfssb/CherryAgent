import { z } from 'zod';

/**
 * 环境变量验证 Schema
 */
const envSchema = z.object({
  // 服务器配置
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  FRONTEND_URL: z.string().url().default('http://127.0.0.1:5173'),
  LANDING_URL: z.string().url().default('http://localhost:3002'),

  // 数据库
  DATABASE_URL: z.string().min(1),
  DB_POOL_MIN: z.coerce.number().int().min(0).default(0),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5000),

  // Stripe (可选 - 如果使用 Stripe 支付)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Clerk (已弃用，保留类型兼容)
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_DOMAIN: z.string().optional(),
  CLERK_ISSUER_URL: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),

  // Supabase (已弃用，保留类型兼容)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),

  // 迅虎支付 (可选 - 如果使用虎皮椒支付)
  XUNHUPAY_APPID: z.string().optional(),
  XUNHUPAY_APPSECRET: z.string().optional(),
  XUNHUPAY_GATEWAY_URL: z.string().url().default('https://api.xunhupay.com/payment/do.html'),
  XUNHUPAY_NOTIFY_URL: z.string().url().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('30d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  ADMIN_JWT_EXPIRES_IN: z.string().default('30d'),

  // 加密
  API_KEY_ENCRYPTION_KEY: z.string().length(64),

  // 速率限制
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // 日志
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['combined', 'common', 'dev', 'short', 'tiny']).default('combined'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173'),

  // AI 提供商 (可选)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_PROVIDER_NAME: z.string().optional(), // 覆盖 OpenAI 渠道的 provider 名称
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().optional(),
  ANTHROPIC_PROVIDER_NAME: z.string().optional(), // 覆盖 Anthropic 渠道的 provider 名称
  GOOGLE_AI_API_KEY: z.string().optional(),

  // 代理渠道 (可选)
  PROXY_API_KEY: z.string().optional(),
  PROXY_BASE_URL: z.string().optional(),
  PROXY_COST_MULTIPLIER: z.string().optional(),
  PROXY_MODELS: z.string().optional(), // 逗号分隔的模型名称列表，如 "kimi-k2.5,kimi-k2-0905-preview"
  PROXY_PROVIDER_NAME: z.string().optional(), // 覆盖代理渠道的 provider 名称

  // 告警通知 (可选)
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  ALERT_EMAIL_RECIPIENTS: z.string().optional(), // 逗号分隔的邮箱列表

  // Google OAuth (可选)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * 解析并验证环境变量
 */
function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map(err => {
      return `  - ${err.path.join('.')}: ${err.message}`;
    }).join('\n');

    console.error(`
╔════════════════════════════════════════════════════════╗
║              环境变量验证失败                           ║
╠════════════════════════════════════════════════════════╣
${errors}
╚════════════════════════════════════════════════════════╝
    `);

    throw new Error('环境变量验证失败，请检查 .env 文件');
  }

  return result.data;
}

export const env = parseEnv();
