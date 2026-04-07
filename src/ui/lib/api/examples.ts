/**
 * API 客户端使用示例
 *
 * 演示如何在不同场景下使用统一 API 客户端
 */

import {
  authApi,
  billingApi,
  sessionApi,
  apiClient,
  ApiError,
} from '@/ui/lib/api';

/**
 * 示例 1: 用户登录
 */
export async function example1_login() {
  try {
    const result = await authApi.login('user@example.com', 'password123');

    console.log('登录成功:', {
      accessToken: result.accessToken,
      user: result.user,
      expiresIn: result.expiresIn,
    });

    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isAuthError) {
        console.error('邮箱或密码错误');
      } else if (error.isNetworkError) {
        console.error('网络连接失败');
      } else {
        console.error('登录失败:', error.message);
      }
    }
    throw error;
  }
}

/**
 * 示例 2: 获取用户信息（使用缓存）
 */
export async function example2_getUserInfo() {
  try {
    // 第一次请求
    const user1 = await authApi.getUserInfo();
    console.log('用户信息:', user1);

    // 1 分钟内的第二次请求会直接返回缓存
    const user2 = await authApi.getUserInfo();
    console.log('缓存命中:', user1 === user2);

    return user1;
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('获取用户信息失败:', error.message);
    }
    throw error;
  }
}

/**
 * 示例 3: 创建充值订单
 */
export async function example3_createRecharge() {
  try {
    const order = await billingApi.createRecharge({
      amount: 5000, // 50 积分（单位：分）
      channel: 'xunhu_wechat',
    });

    console.log('充值订单创建成功:', {
      orderId: order.id,
      amount: order.amount,
      qrCodeUrl: order.qrCodeUrl,
      expiresAt: order.expiresAt,
    });

    return order;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 400) {
        console.error('参数错误:', error.message);
      } else if (error.isServerError) {
        console.error('服务器错误，请稍后重试');
      } else {
        console.error('创建订单失败:', error.message);
      }
    }
    throw error;
  }
}

/**
 * 示例 4: 轮询支付状态
 */
export async function example4_pollPaymentStatus(orderId: string) {
  const maxAttempts = 60; // 最多轮询 60 次
  const interval = 2000; // 每 2 秒轮询一次

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await billingApi.checkPaymentStatus(orderId);

      console.log(`轮询 ${i + 1}/${maxAttempts}: 支付状态 = ${status}`);

      if (status === 'paid') {
        console.log('支付成功！');
        return 'paid';
      } else if (status === 'failed' || status === 'expired') {
        console.log('支付失败或已过期');
        return status;
      }

      // 等待后再次轮询
      await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      if (error instanceof ApiError) {
        console.error('查询支付状态失败:', error.message);
      }
      // 继续轮询
    }
  }

  console.log('轮询超时');
  return 'timeout';
}

/**
 * 示例 5: 获取使用记录（带分页和筛选）
 */
export async function example5_getUsage() {
  try {
    const result = await billingApi.getUsage({
      page: 1,
      pageSize: 20,
      model: 'claude-sonnet-4-5',
      startTime: Date.now() - 30 * 24 * 60 * 60 * 1000, // 最近 30 天
      endTime: Date.now(),
    });

    console.log('使用记录:', {
      总费用: result.summary.totalCost,
      总Token: result.summary.totalTokens,
      总请求数: result.summary.totalRequests,
      记录数: result.records.length,
    });

    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('获取使用记录失败:', error.message);
    }
    throw error;
  }
}

/**
 * 示例 6: 搜索会话
 */
export async function example6_searchSessions() {
  try {
    const result = await sessionApi.search({
      query: 'react components',
      tags: ['frontend'],
      page: 1,
      pageSize: 10,
    });

    console.log('搜索结果:', {
      总数: result.total,
      会话列表: result.sessions.map((s) => ({
        id: s.id,
        title: s.title,
        tags: s.tags,
      })),
    });

    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('搜索会话失败:', error.message);
    }
    throw error;
  }
}

/**
 * 示例 7: 创建会话并更新
 */
export async function example7_createAndUpdateSession() {
  try {
    // 创建会话
    const session = await sessionApi.create({
      title: 'My New Session',
      workspacePath: '/path/to/workspace',
      tags: ['frontend', 'react'],
    });

    console.log('会话创建成功:', session.id);

    // 更新会话
    const updated = await sessionApi.update(session.id, {
      title: 'Updated Session Title',
      isPinned: true,
      tags: ['frontend', 'react', 'typescript'],
    });

    console.log('会话更新成功:', updated);

    return updated;
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('操作失败:', error.message);
    }
    throw error;
  }
}

/**
 * 示例 8: 使用请求重试
 */
export async function example8_requestWithRetry() {
  try {
    const response = await apiClient.get('/some-endpoint', {
      retry: {
        maxRetries: 3, // 最多重试 3 次
        retryDelay: 1000, // 初始延迟 1 秒
        retryDelayMultiplier: 2, // 指数退避
      },
    });

    console.log('请求成功（可能经过重试）:', response);
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('请求失败（已重试 3 次）:', error.message);
    }
    throw error;
  }
}

/**
 * 示例 9: 使用请求取消
 */
export async function example9_requestWithAbort() {
  const controller = new AbortController();

  // 5 秒后取消请求
  const timeoutId = setTimeout(() => {
    console.log('取消请求');
    controller.abort();
  }, 5000);

  try {
    const response = await apiClient.get('/slow-endpoint', {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log('请求成功:', response);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('请求已取消');
    } else if (error instanceof ApiError) {
      console.error('请求失败:', error.message);
    }
    throw error;
  }
}

/**
 * 示例 10: 使用自定义拦截器
 */
export function example10_customInterceptors() {
  // 添加请求拦截器
  const removeRequestInterceptor = apiClient.interceptor.addRequestInterceptor(
    (url, config) => {
      console.log(`[Request] ${config.method} ${url}`);

      // 添加自定义请求头
      config.headers = {
        ...config.headers,
        'X-Request-ID': generateRequestId(),
        'X-Client-Version': '1.0.0',
      };

      return { url, config };
    }
  );

  // 添加响应拦截器
  const removeResponseInterceptor = apiClient.interceptor.addResponseInterceptor(
    (response, data) => {
      console.log(`[Response] ${response.status} ${response.url}`);
      console.log('Response time:', performance.now());
      return data;
    }
  );

  // 添加错误拦截器
  const removeErrorInterceptor = apiClient.interceptor.addErrorInterceptor((error) => {
    console.error('[Error]', error.toJSON());

    // 特殊错误处理
    if (error.status === 503) {
      showMaintenanceMessage();
    } else if (error.status === 429) {
      showRateLimitMessage();
    }

    return error;
  });

  // 返回移除函数
  return () => {
    removeRequestInterceptor();
    removeResponseInterceptor();
    removeErrorInterceptor();
  };
}

/**
 * 示例 11: 并发请求
 */
export async function example11_concurrentRequests() {
  try {
    // 并发执行多个请求
    const [user, balance, sessions] = await Promise.all([
      authApi.getUserInfo(),
      authApi.getBalance(),
      sessionApi.list({ page: 1, pageSize: 10 }),
    ]);

    console.log('并发请求完成:', {
      用户: user.email,
      余额: balance.amount,
      会话数: sessions.total,
    });

    return { user, balance, sessions };
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('并发请求失败:', error.message);
    }
    throw error;
  }
}

/**
 * 示例 12: 完整的充值流程
 */
export async function example12_completeRechargeFlow() {
  try {
    // 1. 创建充值订单
    console.log('1. 创建充值订单...');
    const order = await billingApi.createRecharge({
      amount: 5000,
      channel: 'xunhu_wechat',
    });

    console.log('订单创建成功:', order.id);

    // 2. 显示二维码
    console.log('2. 显示二维码:', order.qrCodeUrl);

    // 3. 轮询支付状态
    console.log('3. 等待支付...');
    const status = await example4_pollPaymentStatus(order.id);

    if (status === 'paid') {
      // 4. 支付成功，更新余额
      console.log('4. 支付成功，获取最新余额...');
      const balance = await authApi.getBalance();
      console.log('最新余额:', balance.amount);

      return { success: true, balance };
    } else {
      console.log('支付失败或超时');
      return { success: false };
    }
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('充值流程失败:', error.message);
    }
    throw error;
  }
}

/**
 * 辅助函数：生成请求 ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 辅助函数：显示维护提示
 */
function showMaintenanceMessage(): void {
  console.log('系统正在维护，请稍后再试');
}

/**
 * 辅助函数：显示限流提示
 */
function showRateLimitMessage(): void {
  console.log('请求过于频繁，请稍后再试');
}

/**
 * 运行所有示例
 */
export async function runAllExamples() {
  console.log('=== 开始运行示例 ===\n');

  try {
    // 示例 1: 登录
    console.log('--- 示例 1: 用户登录 ---');
    await example1_login();
    console.log('');

    // 示例 2: 获取用户信息
    console.log('--- 示例 2: 获取用户信息（缓存）---');
    await example2_getUserInfo();
    console.log('');

    // 示例 3: 创建充值订单
    console.log('--- 示例 3: 创建充值订单 ---');
    await example3_createRecharge();
    console.log('');

    // 示例 5: 获取使用记录
    console.log('--- 示例 5: 获取使用记录 ---');
    await example5_getUsage();
    console.log('');

    // 示例 6: 搜索会话
    console.log('--- 示例 6: 搜索会话 ---');
    await example6_searchSessions();
    console.log('');

    // 示例 7: 创建和更新会话
    console.log('--- 示例 7: 创建和更新会话 ---');
    await example7_createAndUpdateSession();
    console.log('');

    // 示例 11: 并发请求
    console.log('--- 示例 11: 并发请求 ---');
    await example11_concurrentRequests();
    console.log('');

    console.log('=== 所有示例运行完成 ===');
  } catch (error) {
    console.error('示例运行失败:', error);
  }
}
