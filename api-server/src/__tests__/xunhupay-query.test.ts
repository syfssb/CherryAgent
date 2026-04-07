import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/payment-config.js', () => ({
  paymentConfigService: {
    getXunhupayConfig: vi.fn(),
  },
}));

import { xunhupayService, generateSign, verifySign } from '../services/xunhupay.js';
import { paymentConfigService } from '../services/payment-config.js';

describe('Xunhupay queryOrder 解析', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(paymentConfigService.getXunhupayConfig).mockResolvedValue({
      enabled: true,
      wechat: { appid: 'wx_appid', appsecret: 'wx_secret' },
      alipay: { appid: 'ali_appid', appsecret: 'ali_secret' },
      apiUrl: 'https://api.xunhupay.com/payment/do.html',
      notifyUrl: 'https://example.com/api/webhooks/xunhupay',
    });
  });

  it('应从 data.status=OD 解析为 paid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        errcode: 0,
        errmsg: '',
        data: {
          status: 'OD',
          transaction_id: 'tx_123',
          paid_date: '2026-02-19 17:29:40',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await xunhupayService.queryOrder('xh_test_order');

    expect(result.status).toBe('paid');
    expect(result.transactionId).toBe('tx_123');
    expect(result.paidAt).toBeInstanceOf(Date);
  });

  it('应从 data.status=WP 解析为 pending', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        errcode: 0,
        errmsg: '',
        data: {
          status: 'WP',
          transaction_id: null,
          paid_date: null,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await xunhupayService.queryOrder('xh_test_order');

    expect(result.status).toBe('pending');
    expect(result.transactionId).toBeUndefined();
    expect(result.paidAt).toBeUndefined();
  });

  it('应从 data.status=CD 解析为 expired', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        errcode: 0,
        errmsg: '',
        data: {
          status: 'CD',
          transaction_id: null,
          paid_date: null,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await xunhupayService.queryOrder('xh_test_order');

    expect(result.status).toBe('expired');
  });
});

describe('Xunhupay 签名校验', () => {
  it('应基于完整字段验签，裁剪字段会失败', () => {
    const secret = 'test_secret';
    const fullParams = {
      appid: 'test_appid',
      trade_order_id: 'xh_test_order_1',
      total_fee: '1.00',
      open_order_id: '202900001',
      transaction_id: '420000000001',
      status: 'OD',
      plugins: '{"localOrderId":"abc"}',
      time: '1771493370',
      nonce_str: 'abcdefg123',
    };

    const hash = generateSign(fullParams, secret);

    expect(verifySign({ ...fullParams, hash }, secret)).toBe(true);
    expect(
      verifySign(
        {
          trade_order_id: fullParams.trade_order_id,
          total_fee: fullParams.total_fee,
          transaction_id: fullParams.transaction_id,
          status: fullParams.status,
          plugins: fullParams.plugins,
          hash,
        },
        secret
      )
    ).toBe(false);
  });
});
