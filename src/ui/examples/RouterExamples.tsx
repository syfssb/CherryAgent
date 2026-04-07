import React from 'react';
import { useRouter } from '../hooks/useRouter';
import type { Route } from '../hooks/useRouter';

/**
 * 路由系统使用示例
 *
 * 这个文件展示了如何在应用中使用自定义路由系统
 */

// ============================================================================
// 示例 1: 基本用法
// ============================================================================

export function BasicRouterExample() {
  const { currentRoute, navigate } = useRouter();

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">当前路由: {currentRoute}</h2>

      <nav className="flex gap-2 mb-4">
        <button
          onClick={() => navigate('/chat')}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          聊天
        </button>
        <button
          onClick={() => navigate('/usage')}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          用量
        </button>
        <button
          onClick={() => navigate('/memory')}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          记忆
        </button>
        <button
          onClick={() => navigate('/skills')}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          技能
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          设置
        </button>
      </nav>

      <div className="p-4 bg-gray-100 rounded">
        {currentRoute === '/chat' && <div>聊天页面内容</div>}
        {currentRoute === '/usage' && <div>用量页面内容</div>}
        {currentRoute === '/memory' && <div>记忆页面内容</div>}
        {currentRoute === '/skills' && <div>技能页面内容</div>}
        {currentRoute === '/settings' && <div>设置页面内容</div>}
      </div>
    </div>
  );
}

// ============================================================================
// 示例 2: 带高亮的导航栏
// ============================================================================

interface NavButtonProps {
  route: Route;
  currentRoute: Route;
  onNavigate: (route: Route) => void;
  children: React.ReactNode;
}

function NavButton({ route, currentRoute, onNavigate, children }: NavButtonProps) {
  const isActive = currentRoute === route;

  return (
    <button
      onClick={() => onNavigate(route)}
      className={`px-4 py-2 rounded transition-colors ${
        isActive
          ? 'bg-blue-600 text-white font-bold'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

export function NavigationExample() {
  const { currentRoute, navigate } = useRouter();

  return (
    <div className="p-4">
      <nav className="flex gap-2 mb-4">
        <NavButton route="/chat" currentRoute={currentRoute} onNavigate={navigate}>
          聊天
        </NavButton>
        <NavButton route="/usage" currentRoute={currentRoute} onNavigate={navigate}>
          用量
        </NavButton>
        <NavButton route="/memory" currentRoute={currentRoute} onNavigate={navigate}>
          记忆
        </NavButton>
        <NavButton route="/skills" currentRoute={currentRoute} onNavigate={navigate}>
          技能
        </NavButton>
        <NavButton route="/settings" currentRoute={currentRoute} onNavigate={navigate}>
          设置
        </NavButton>
      </nav>

      <main>当前页面: {currentRoute}</main>
    </div>
  );
}

// ============================================================================
// 示例 3: 使用 switch 语句渲染页面
// ============================================================================

export function SwitchRouterExample() {
  const { currentRoute, navigate } = useRouter();

  const renderPage = () => {
    switch (currentRoute) {
      case '/chat':
        return <ChatPagePlaceholder />;
      case '/usage':
        return <UsagePagePlaceholder />;
      case '/memory':
        return <MemoryPagePlaceholder />;
      case '/skills':
        return <SkillsPagePlaceholder />;
      case '/settings':
        return <SettingsPagePlaceholder />;
      default:
        return <ChatPagePlaceholder />;
    }
  };

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-gray-800 text-white p-4">
        <nav className="flex flex-col gap-2">
          <button
            onClick={() => navigate('/chat')}
            className="text-left px-3 py-2 rounded hover:bg-gray-700"
          >
            聊天
          </button>
          <button
            onClick={() => navigate('/usage')}
            className="text-left px-3 py-2 rounded hover:bg-gray-700"
          >
            用量
          </button>
          <button
            onClick={() => navigate('/memory')}
            className="text-left px-3 py-2 rounded hover:bg-gray-700"
          >
            记忆
          </button>
          <button
            onClick={() => navigate('/skills')}
            className="text-left px-3 py-2 rounded hover:bg-gray-700"
          >
            技能
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="text-left px-3 py-2 rounded hover:bg-gray-700"
          >
            设置
          </button>
        </nav>
      </aside>

      <main className="flex-1 p-8">{renderPage()}</main>
    </div>
  );
}

// ============================================================================
// 示例 4: 侧边栏组件（实际使用案例）
// ============================================================================

interface SidebarProps {
  currentRoute: Route;
  onNavigate: (route: Route) => void;
}

export function ExampleSidebar({ currentRoute, onNavigate }: SidebarProps) {
  const navItems = [
    { route: '/chat' as Route, label: '聊天', icon: '💬' },
    { route: '/usage' as Route, label: '用量', icon: '📊' },
    { route: '/memory' as Route, label: '记忆', icon: '🧠' },
    { route: '/skills' as Route, label: '技能', icon: '⚡' },
    { route: '/settings' as Route, label: '设置', icon: '⚙️' },
  ];

  return (
    <aside className="w-64 bg-gray-100 p-4">
      <h2 className="text-lg font-bold mb-4">导航</h2>

      <nav className="flex flex-col gap-2">
        {navItems.map(({ route, label, icon }) => (
          <button
            key={route}
            onClick={() => onNavigate(route)}
            className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
              currentRoute === route
                ? 'bg-blue-500 text-white'
                : 'hover:bg-gray-200'
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

// ============================================================================
// 页面占位符组件
// ============================================================================

function ChatPagePlaceholder() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">聊天页面</h1>
      <p>这是聊天页面的内容...</p>
    </div>
  );
}

function UsagePagePlaceholder() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">用量页面</h1>
      <p>这是用量页面的内容...</p>
    </div>
  );
}

function MemoryPagePlaceholder() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">记忆管理页面</h1>
      <p>这是记忆管理页面的内容...</p>
    </div>
  );
}

function SkillsPagePlaceholder() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">技能市场页面</h1>
      <p>这是技能市场页面的内容...</p>
    </div>
  );
}

function SettingsPagePlaceholder() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">设置页面</h1>
      <p>这是设置页面的内容...</p>
    </div>
  );
}

// ============================================================================
// 完整应用示例
// ============================================================================

export function CompleteAppExample() {
  const { currentRoute, navigate } = useRouter();

  return (
    <div className="flex h-screen">
      <ExampleSidebar currentRoute={currentRoute} onNavigate={navigate} />

      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold mb-6">路由系统示例应用</h1>

        <div className="mb-4 p-4 bg-blue-100 rounded">
          <p className="text-sm text-blue-800">
            当前路由: <strong>{currentRoute}</strong>
          </p>
          <p className="text-xs text-blue-600 mt-1">
            试试使用浏览器的前进/后退按钮！
          </p>
        </div>

        <div className="p-6 bg-white rounded shadow">
          {currentRoute === '/chat' && <ChatPagePlaceholder />}
          {currentRoute === '/usage' && <UsagePagePlaceholder />}
          {currentRoute === '/memory' && <MemoryPagePlaceholder />}
          {currentRoute === '/skills' && <SkillsPagePlaceholder />}
          {currentRoute === '/settings' && <SettingsPagePlaceholder />}
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// 导出所有示例
// ============================================================================

export default {
  BasicRouterExample,
  NavigationExample,
  SwitchRouterExample,
  CompleteAppExample,
};
