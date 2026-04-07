import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('Analytics API', () => {
  it('should accept landing-page analytics events', async () => {
    const response = await request(app)
      .post('/api/analytics/events')
      .send({
        event: 'lp_view',
        properties: { referrer: 'https://example.com' },
        timestamp: Date.now(),
        url: 'https://cherry.example/landing',
      })
      .expect(202);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        accepted: true,
        event: 'lp_view',
      },
    });
  });

  it('should reject invalid analytics payload', async () => {
    const response = await request(app)
      .post('/api/analytics/events')
      .send({
        event: 'unknown_event',
        properties: {},
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid analytics payload');
  });
});
