import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

const analyticsRouter = Router();

const analyticsEventSchema = z.object({
  event: z.enum([
    'lp_view',
    'lp_click_download',
    'lp_click_register',
    'lp_select_provider_interest',
    'lp_register_success',
  ]),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  timestamp: z.number().int().positive().optional(),
  url: z.string().url().optional(),
});

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0];
    return first?.trim() || 'unknown';
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    const first = forwarded[0];
    if (typeof first === 'string') {
      return first.trim();
    }
  }
  return req.ip || 'unknown';
}

analyticsRouter.post('/events', (req: Request, res: Response) => {
  const parsed = analyticsEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid analytics payload',
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const eventTime = parsed.data.timestamp
    ? new Date(parsed.data.timestamp).toISOString()
    : new Date().toISOString();

  if (process.env.NODE_ENV !== 'test') {
    // 先用结构化日志落地，后续可直接替换为 DB/消息队列写入
    console.info(
      '[analytics] event=%s ip=%s ua=%s url=%s at=%s properties=%s',
      parsed.data.event,
      getClientIp(req),
      req.get('user-agent') ?? '',
      parsed.data.url ?? '',
      eventTime,
      JSON.stringify(parsed.data.properties ?? {}),
    );
  }

  return res.status(202).json({
    success: true,
    data: {
      accepted: true,
      event: parsed.data.event,
      receivedAt: eventTime,
    },
  });
});

export { analyticsRouter };
