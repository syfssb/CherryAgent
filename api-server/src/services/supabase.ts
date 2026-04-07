import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../utils/env.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { AuthenticationError, NotFoundError } from '../utils/errors.js';

/**
 * Supabase 客户端类型
 */
export type SupabaseAuthClient = SupabaseClient;

/**
 * Supabase 用户信息
 */
export interface SupabaseUserInfo {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}

function requireSupabaseUrl(): string {
  if (!env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL 未配置');
  }
  return env.SUPABASE_URL;
}

function requireSupabaseAnonKey(): string {
  if (!env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY 未配置');
  }
  return env.SUPABASE_ANON_KEY;
}

function requireSupabaseServiceKey(): string {
  if (!env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY 未配置');
  }
  return env.SUPABASE_SERVICE_KEY;
}

/**
 * 创建 Supabase 匿名客户端 (用于公开操作)
 */
export function createAnonClient(): SupabaseClient {
  return createClient(requireSupabaseUrl(), requireSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  });
}

/**
 * 创建 Supabase 服务端客户端 (用于管理员操作)
 */
export function createServiceClient(): SupabaseClient {
  return createClient(requireSupabaseUrl(), requireSupabaseServiceKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// 单例实例
let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

/**
 * 获取匿名客户端单例
 */
export function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    anonClient = createAnonClient();
  }
  return anonClient;
}

/**
 * 获取服务端客户端单例
 */
export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createServiceClient();
  }
  return serviceClient;
}

/**
 * 验证 Supabase Access Token
 * @param accessToken - Supabase JWT access token
 * @returns Supabase 用户信息
 * @throws AuthenticationError 如果 token 无效
 */
export async function verifyAccessToken(accessToken: string): Promise<SupabaseUserInfo> {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new AuthenticationError('Access token 不能为空');
  }

  const client = getAnonClient();
  const { data, error } = await client.auth.getUser(accessToken);

  if (error) {
    throw new AuthenticationError(`Token 验证失败: ${error.message}`);
  }

  if (!data.user) {
    throw new AuthenticationError('无效的 access token');
  }

  const supabaseUser = data.user;

  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    name: supabaseUser.user_metadata?.full_name ?? supabaseUser.user_metadata?.name ?? null,
    avatarUrl: supabaseUser.user_metadata?.avatar_url ?? null,
    emailVerified: supabaseUser.email_confirmed_at !== null,
  };
}

/**
 * 从数据库获取用户信息
 * @param userId - 用户 ID (本地数据库的 UUID)
 * @returns 用户信息
 * @throws NotFoundError 如果用户不存在
 */
export async function getUser(userId: string): Promise<typeof users.$inferSelect> {
  if (!userId) {
    throw new NotFoundError('用户 ID 不能为空');
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('用户');
  }

  return result[0]!;
}

/**
 * 通过 Supabase ID 获取用户
 * @param supabaseId - Supabase 用户 ID
 * @returns 用户信息或 null
 */
export async function getUserBySupabaseId(supabaseId: string): Promise<typeof users.$inferSelect | null> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.supabaseId, supabaseId))
    .limit(1);

  return result.length > 0 ? result[0]! : null;
}

/**
 * Supabase 认证辅助函数
 */
export const supabaseAuth = {
  /**
   * 使用 Supabase 验证用户
   */
  async verifyUser(accessToken: string) {
    const client = getAnonClient();
    const { data, error } = await client.auth.getUser(accessToken);

    if (error) {
      throw new Error(`Supabase 认证失败: ${error.message}`);
    }

    return data.user;
  },

  /**
   * 创建新用户
   */
  async createUser(email: string, password: string) {
    const client = getServiceClient();
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      throw new Error(`创建用户失败: ${error.message}`);
    }

    return data.user;
  },

  /**
   * 删除用户
   */
  async deleteUser(userId: string) {
    const client = getServiceClient();
    const { error } = await client.auth.admin.deleteUser(userId);

    if (error) {
      throw new Error(`删除用户失败: ${error.message}`);
    }
  },
};
