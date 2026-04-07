import 'dotenv/config';

// 设置全局 HTTP 代理（用于访问 Google OAuth 等外部 API）
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.http_proxy || process.env.https_proxy;
if (proxyUrl) {
  import('undici').then(({ ProxyAgent, setGlobalDispatcher }) => {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log(`[proxy] Global fetch proxy set to ${proxyUrl}`);
  }).catch((err) => {
    console.warn('[proxy] Failed to set global proxy:', err.message);
  });
}

import 'express-async-errors';
import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './utils/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import { requestLogger } from './middleware/request-logger.js';
import { startCronTasks, stopCronTasks } from './services/cron-tasks.js';
import { closeConnection } from './db/index.js';

// 路由导入
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { proxyRouter } from './routes/proxy/index.js';
import { webhooksRouter } from './routes/webhooks.js';
import { usageRouter } from './routes/usage.js';
import { billingRouter } from './routes/billing.js';
import { adminRouter } from './routes/admin/index.js';
import { updatesRouter } from './routes/updates.js';
import { publicAnnouncementsRouter } from './routes/announcements.js';
import { publicConfigsRouter } from './routes/configs.js';
import { publicSkillsRouter } from './routes/skills.js';
import { legalRouter } from './routes/legal.js';
import { modelsPublicRouter } from './routes/models-public.js';
import { referralsRouter } from './routes/referrals.js';
import { checkinRouter } from './routes/checkin.js';
import { syncRouter } from './routes/sync.js';
import { analyticsRouter } from './routes/analytics.js';
import downloadsRouter from './routes/downloads.js';

/**
 * 创建并配置 Express 应用
 */
function createApp(): Express {
  const app = express();

  // ===================================
  // 安全中间件
  // ===================================
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // ===================================
  // CORS 配置
  // ===================================
  const configuredCorsOrigins = env.CORS_ORIGINS
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const normalizeOrigin = (value: string): string | null => {
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  };

  const corsOriginSet = new Set<string>();
  const addAllowedOrigin = (value?: string): void => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    corsOriginSet.add(trimmed);
    const normalized = normalizeOrigin(trimmed);
    if (normalized) corsOriginSet.add(normalized);
  };

  // 显式配置的域名
  configuredCorsOrigins.forEach(addAllowedOrigin);
  // 防呆：自动放行当前站点/API 站点，避免配置遗漏导致同域被 CORS 拒绝
  addAllowedOrigin(env.API_BASE_URL);
  addAllowedOrigin(env.FRONTEND_URL);
  addAllowedOrigin(env.LANDING_URL);
  app.use(cors({
    origin: (origin, callback) => {
      // Electron 桌面端打包后从 file:// 或 app:// 加载，Origin 为 null 或 undefined
      // 同理，服务端直接调用（如 curl）也没有 Origin
      if (!origin) {
        return callback(null, true);
      }
      // 本地开发环境放行 localhost / 127.0.0.1（精确匹配 hostname）
      try {
        const hostname = new URL(origin).hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          return callback(null, true);
        }
      } catch {
        // origin 解析失败，继续走白名单匹配
      }
      const normalizedOrigin = normalizeOrigin(origin);
      // 白名单匹配（支持原始值和归一化后的 origin 对比）
      if (
        corsOriginSet.has(origin)
        || (normalizedOrigin ? corsOriginSet.has(normalizedOrigin) : false)
      ) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400,
  }));

  // ===================================
  // 请求解析
  // ===================================
  // Webhook 路由需要原始 body，所以在这之前注册
  app.use('/api/webhooks', express.raw({ type: 'application/json' }));

  // 其他路由使用 JSON 解析
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ===================================
  // 日志中间件
  // ===================================
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.LOG_FORMAT));
  }
  app.use(requestLogger);

  // ===================================
  // 速率限制
  // ===================================
  app.use(rateLimiter);

  // ===================================
  // API 路由
  // ===================================
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/proxy', proxyRouter);
  app.use('/api/webhooks', webhooksRouter);
  app.use('/api/usage', usageRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/referrals', referralsRouter);
  app.use('/api/checkin', checkinRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/models', modelsPublicRouter);
  app.use('/api/updates', updatesRouter);
  app.use('/downloads', downloadsRouter);

  // ===================================
  // 公开 API 路由 (不需要认证)
  // ===================================
  app.use('/api/announcements', publicAnnouncementsRouter);
  app.use('/api/configs', publicConfigsRouter);
  app.use('/api/skills', publicSkillsRouter);
  app.use('/api/legal', legalRouter);

  // ===================================
  // 管理后台路由
  // ===================================
  app.use('/api/admin', adminRouter);

  // ===================================
  // 根路由
  // ===================================
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        name: 'API Proxy Service',
        version: '1.0.0',
        status: 'running',
        docs: '/api/health',
      },
    });
  });

  // 兼容旧版 Stripe 回调路径（历史 Session 仍会回跳到 /billing/recharge/*）
  app.get('/billing/recharge/success', (req: Request, res: Response) => {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        query.append(key, value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') {
            query.append(key, item);
          }
        }
      }
    }

    const suffix = query.toString();
    const redirectPath = suffix
      ? `/api/billing/recharge/success?${suffix}`
      : '/api/billing/recharge/success';

    res.redirect(302, redirectPath);
  });

  app.get('/billing/recharge/cancel', (_req: Request, res: Response) => {
    res.redirect(302, '/api/billing/recharge/cancel');
  });

  // ===================================
  // 错误处理
  // ===================================
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * 启动服务器
 */
async function startServer(): Promise<void> {
  const app = createApp();
  const port = env.PORT;

  app.listen(port, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║                  API Proxy Service                      ║
╠════════════════════════════════════════════════════════╣
║  Status:      Running                                   ║
║  Environment: ${env.NODE_ENV.padEnd(40)}║
║  Port:        ${String(port).padEnd(40)}║
║  URL:         ${env.API_BASE_URL.padEnd(40)}║
╚════════════════════════════════════════════════════════╝
    `);

    // 启动定时任务
    startCronTasks();
  });
}

// 优雅关闭
let isShuttingDown = false;

function gracefulShutdown(reason: string, exitCode: number = 1): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error(`[shutdown] ${reason}, shutting down gracefully...`);
  stopCronTasks();

  // 关闭数据库连接池，释放所有连接
  closeConnection()
    .then(() => {
      console.error('[shutdown] Database pool closed');
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error('[shutdown] Failed to close database pool:', err);
      process.exit(exitCode);
    });

  // 强制退出兜底：10 秒后无论如何退出
  setTimeout(() => {
    console.error('[shutdown] Forced exit after timeout');
    process.exit(exitCode);
  }, 10_000).unref();
}

// 未捕获异常处理
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Rejection:', reason);
  // 不立即退出，只记录日志。容器重启策略会处理真正的崩溃。
  // 大多数 unhandledRejection 是遗漏的 .catch()，不影响进程稳定性。
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM received', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT received', 0));

// 创建应用实例 (用于测试)
export const app = createApp();

// 只在非测试环境下启动服务器
if (env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { createApp };
