import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Clerk 实例单例
 */
let clerkInstance: any | null = null;
let clerkInitPromise: Promise<void> | null = null;

/**
 * 获取 Clerk Publishable Key
 */
function getClerkPublishableKey(): string {
  const key = (import.meta as any).env?.VITE_CLERK_PUBLISHABLE_KEY
    || (window as any).__CLERK_PUBLISHABLE_KEY__
    || '';
  return key;
}

/**
 * 初始化 Clerk 实例（动态导入 @clerk/clerk-js）
 */
export async function initClerk(): Promise<any | null> {
  if (clerkInstance) return clerkInstance;

  const publishableKey = getClerkPublishableKey();
  if (!publishableKey) {
    console.warn('[ClerkProvider] VITE_CLERK_PUBLISHABLE_KEY 未配置，Clerk 认证不可用');
    return null;
  }

  if (clerkInitPromise) {
    await clerkInitPromise;
    return clerkInstance;
  }

  try {
    const { Clerk } = await import('@clerk/clerk-js');
    const clerk = new Clerk(publishableKey);

    clerkInitPromise = clerk.load({
      appearance: {
        variables: {
          colorPrimary: '#6366f1',
        },
      },
    });

    await clerkInitPromise;
    clerkInstance = clerk;
    return clerk;
  } catch (error) {
    console.error('[ClerkProvider] Clerk 初始化失败:', error);
    clerkInitPromise = null;
    return null;
  }
}

/**
 * 获取当前 Clerk 实例
 */
export function getClerk(): any | null {
  return clerkInstance;
}

/**
 * 获取当前 Clerk session token
 */
export async function getClerkToken(): Promise<string | null> {
  if (!clerkInstance?.session) return null;

  try {
    const token = await clerkInstance.session.getToken();
    return token;
  } catch {
    return null;
  }
}

/**
 * ClerkProvider 属性
 */
interface ClerkProviderProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Clerk Provider 组件
 * 在 Electron 环境中初始化 Clerk
 */
export function ClerkProvider({ children, fallback }: ClerkProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const publishableKey = getClerkPublishableKey();
    if (!publishableKey) {
      // 没有配置 Clerk key，直接渲染子组件
      setIsReady(true);
      return;
    }

    initClerk().then(() => {
      setIsReady(true);
    }).catch(() => {
      // 初始化失败也继续渲染，只是 Clerk 功能不可用
      setIsReady(true);
    });
  }, []);

  if (!isReady) {
    return <>{fallback ?? null}</>;
  }

  return <>{children}</>;
}
