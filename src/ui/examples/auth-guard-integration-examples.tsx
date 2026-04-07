/**
 * AuthGuard 集成示例
 * 展示如何在不同场景下使用 AuthGuard 保护组件
 */

import { useState } from 'react';
import { AuthGuard, withAuthGuard, AuthOnly, GuestOnly } from '@/ui/components/auth/AuthGuard';
import { SettingsPage } from '@/ui/pages/Settings';
import { MemoryEditor } from '@/ui/pages/MemoryEditor';
import { SkillMarket } from '@/ui/pages/SkillMarket';
import { TransactionHistory } from '@/ui/pages/TransactionHistory';
import { RechargeModal } from '@/ui/components/billing/RechargeModal';

/**
 * 示例 1: 基本用法 - 保护设置页面
 */
export function ProtectedSettingsExample() {
  return (
    <AuthGuard>
      <SettingsPage />
    </AuthGuard>
  );
}

/**
 * 示例 2: 使用高阶组件 - 保护 Memory 编辑
 */
const ProtectedMemoryEditor = withAuthGuard(MemoryEditor);

export function MemoryEditorExample() {
  return <ProtectedMemoryEditor />;
}

/**
 * 示例 3: 静默模式 - 充值弹窗
 * 未登录时不显示任何内容，不弹出登录框
 */
export function RechargeModalExample() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowModal(true)}>打开充值</button>
      {showModal && (
        <AuthGuard silent>
          <RechargeModal
            open={showModal}
            onClose={() => setShowModal(false)}
          />
        </AuthGuard>
      )}
    </>
  );
}

/**
 * 示例 4: 自定义回退 - Skill 市场
 */
export function SkillMarketExample() {
  return (
    <AuthGuard
      fallback={
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">登录后使用 Skill 市场</h2>
          <p className="text-muted">Skill 市场需要登录后才能使用</p>
        </div>
      }
    >
      <SkillMarket />
    </AuthGuard>
  );
}

/**
 * 示例 5: 显示登录提示 - 交易历史
 */
export function TransactionHistoryExample() {
  return (
    <AuthGuard showLoginPrompt>
      <TransactionHistory />
    </AuthGuard>
  );
}

/**
 * 示例 6: 条件渲染 - 仅登录用户可见
 */
export function ConditionalRenderingExample() {
  return (
    <div>
      <h1>欢迎使用 Cherry Agent</h1>

      {/* 仅登录用户可见 */}
      <AuthOnly>
        <div className="p-4 bg-green-100">
          <p>欢迎回来！这是登录用户专属内容</p>
        </div>
      </AuthOnly>

      {/* 仅未登录用户可见 */}
      <GuestOnly>
        <div className="p-4 bg-blue-100">
          <p>您尚未登录，请登录后使用完整功能</p>
        </div>
      </GuestOnly>

      {/* 对话功能 - 不需要登录 */}
      <div className="p-4">
        <p>对话功能可以免登录使用（通过代理服务）</p>
      </div>
    </div>
  );
}

/**
 * 示例 7: 完整的应用集成
 */
export function FullAppIntegrationExample() {
  const [activeTab, setActiveTab] = useState<'chat' | 'settings' | 'memory' | 'skills' | 'billing'>('chat');

  return (
    <div className="h-screen flex flex-col">
      {/* 导航栏 */}
      <nav className="flex gap-2 p-4 border-b">
        <button onClick={() => setActiveTab('chat')}>对话</button>
        <button onClick={() => setActiveTab('settings')}>设置</button>
        <button onClick={() => setActiveTab('memory')}>Memory</button>
        <button onClick={() => setActiveTab('skills')}>Skills</button>
        <button onClick={() => setActiveTab('billing')}>充值</button>
      </nav>

      {/* 内容区 */}
      <main className="flex-1 overflow-auto">
        {/* 对话 - 不需要登录 */}
        {activeTab === 'chat' && (
          <div className="p-6">
            <h2>对话功能（免登录）</h2>
            <p>通过代理服务实现免登录体验</p>
          </div>
        )}

        {/* 设置 - 需要登录 */}
        {activeTab === 'settings' && (
          <AuthGuard>
            <SettingsPage />
          </AuthGuard>
        )}

        {/* Memory 编辑 - 需要登录 */}
        {activeTab === 'memory' && (
          <AuthGuard>
            <MemoryEditor />
          </AuthGuard>
        )}

        {/* Skill 市场 - 需要登录 */}
        {activeTab === 'skills' && (
          <AuthGuard>
            <SkillMarket />
          </AuthGuard>
        )}

        {/* 充值 - 需要登录 */}
        {activeTab === 'billing' && (
          <AuthGuard>
            <TransactionHistory />
          </AuthGuard>
        )}
      </main>
    </div>
  );
}

/**
 * 所有示例的集合
 */
export function AuthGuardExamples() {
  return (
    <div className="space-y-8 p-6">
      <section>
        <h2 className="text-2xl font-bold mb-4">AuthGuard 集成示例</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold">示例 1: 基本用法</h3>
            <ProtectedSettingsExample />
          </div>

          <div>
            <h3 className="text-xl font-semibold">示例 2: HOC 包装</h3>
            <MemoryEditorExample />
          </div>

          <div>
            <h3 className="text-xl font-semibold">示例 3: 静默模式</h3>
            <RechargeModalExample />
          </div>

          <div>
            <h3 className="text-xl font-semibold">示例 4: 自定义回退</h3>
            <SkillMarketExample />
          </div>

          <div>
            <h3 className="text-xl font-semibold">示例 5: 登录提示</h3>
            <TransactionHistoryExample />
          </div>

          <div>
            <h3 className="text-xl font-semibold">示例 6: 条件渲染</h3>
            <ConditionalRenderingExample />
          </div>

          <div>
            <h3 className="text-xl font-semibold">示例 7: 完整集成</h3>
            <FullAppIntegrationExample />
          </div>
        </div>
      </section>
    </div>
  );
}

export default AuthGuardExamples;
