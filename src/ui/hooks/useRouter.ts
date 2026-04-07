import { useCallback, useSyncExternalStore } from 'react';

/**
 * 支持的路由类型
 */
export type Route = '/' | '/chat' | '/usage' | '/pricing' | '/memory' | '/skills' | '/settings' | '/referral' | '/debug';

/**
 * 验证路由是否有效
 */
const isValidRoute = (path: string): path is Route => {
  const validRoutes: Route[] = ['/', '/chat', '/usage', '/pricing', '/memory', '/skills', '/settings', '/referral', '/debug'];
  return validRoutes.includes(path as Route);
};

/**
 * 从 URL 路径获取路由，如果无效则返回默认路由
 */
const getRouteFromPath = (pathname: string): Route => {
  // Normalize root path to /chat
  if (pathname === '/') {
    return '/chat';
  }

  if (isValidRoute(pathname)) {
    return pathname;
  }
  return '/chat';
};

function getPathFromLocation(): string {
  if (window.location.protocol === 'file:') {
    const hashPath = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    return hashPath || '/';
  }
  return window.location.pathname;
}

// ---- 全局路由状态（单例），确保多个 useRouter 实例共享同一份状态 ----

type Listener = () => void;

let globalRoute: Route = getRouteFromPath(getPathFromLocation());
const listeners = new Set<Listener>();

function getSnapshot(): Route {
  return globalRoute;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setGlobalRoute(route: Route): void {
  if (route === globalRoute) return;
  globalRoute = route;
  emitChange();
}

// 监听浏览器前进/后退
window.addEventListener('popstate', () => {
  setGlobalRoute(getRouteFromPath(getPathFromLocation()));
});

if (window.location.protocol === 'file:') {
  window.addEventListener('hashchange', () => {
    setGlobalRoute(getRouteFromPath(getPathFromLocation()));
  });
}

/**
 * 路由 hook 返回值
 */
export interface UseRouterReturn {
  currentRoute: Route;
  navigate: (route: Route) => void;
}

/**
 * 基于全局单例的简单路由系统
 *
 * 功能：
 * 1. 所有 useRouter() 调用共享同一份路由状态
 * 2. 支持编程式导航
 * 3. 与浏览器 history API 集成
 * 4. 支持浏览器前进/后退按钮
 *
 * @returns {UseRouterReturn} 路由状态和导航函数
 *
 * @example
 * ```tsx
 * function App() {
 *   const { currentRoute, navigate } = useRouter();
 *
 *   return (
 *     <div>
 *       <button onClick={() => navigate('/chat')}>Chat</button>
 *       {currentRoute === '/chat' && <ChatPage />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useRouter(): UseRouterReturn {
  const currentRoute = useSyncExternalStore(subscribe, getSnapshot);

  const navigate = useCallback((route: Route) => {
    const targetRoute = isValidRoute(route) ? route : '/chat';

    if (targetRoute === globalRoute) {
      return;
    }

    if (window.location.protocol === 'file:') {
      const targetHash = `#${targetRoute}`;
      if (window.location.hash !== targetHash) {
        window.location.hash = targetRoute;
      } else {
        setGlobalRoute(targetRoute);
      }
      return;
    }

    // 更新浏览器历史
    window.history.pushState(null, '', targetRoute);

    // 更新全局状态，通知所有订阅者
    setGlobalRoute(targetRoute);
  }, []);

  return {
    currentRoute,
    navigate,
  };
}
