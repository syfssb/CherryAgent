/**
 * 对话界面组件使用示例
 * 展示如何使用 MessageCard、MessageTimestamp、MessageActions 等组件
 */

import { useState } from 'react';
import { MessageCard, type Message } from '@/ui/components/chat';

/**
 * 示例：完整的聊天界面
 */
export function ChatExample() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'user',
      content: '请帮我写一个 React 组件',
      timestamp: Date.now() - 120000, // 2分钟前
    },
    {
      id: '2',
      role: 'assistant',
      content: '好的，我来帮你创建一个 React 组件。\n\n```tsx\nfunction MyComponent() {\n  return <div>Hello World</div>;\n}\n```',
      timestamp: Date.now() - 60000, // 1分钟前
      thinkingContent: '我需要创建一个简单的 React 组件示例...',
      tokenCount: 245,
      cost: 0.0015,
      duration: 3500,
      toolCalls: [
        {
          id: 'call_1',
          name: 'create_file',
          status: 'success',
          input: { path: 'MyComponent.tsx', content: 'function MyComponent()...' },
          output: '文件创建成功',
          duration: 150,
        },
      ],
    },
    {
      id: '3',
      role: 'user',
      content: '谢谢！',
      timestamp: Date.now() - 30000, // 30秒前
    },
  ]);

  /**
   * 处理消息复制
   */
  const handleCopy = (content: string) => {
    console.log('已复制:', content);
    // 可以显示 toast 提示
  };

  /**
   * 处理重新生成
   */
  const handleRegenerate = (messageId: string) => {
    console.log('重新生成消息:', messageId);
    // 调用 API 重新生成消息
  };

  /**
   * 处理编辑
   */
  const handleEdit = (messageId: string) => {
    console.log('编辑消息:', messageId);
    // 进入编辑模式
  };

  /**
   * 处理删除
   */
  const handleDelete = (messageId: string) => {
    console.log('删除消息:', messageId);
    setMessages(messages.filter((msg) => msg.id !== messageId));
  };

  /**
   * 处理重试
   */
  const handleRetry = (messageId: string) => {
    console.log('重试发送消息:', messageId);
    // 重新发送失败的消息
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.map((message) => (
          <MessageCard
            key={message.id}
            message={message}
            onCopy={handleCopy}
            onRegenerate={handleRegenerate}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onRetry={handleRetry}
          />
        ))}
      </div>

      {/* 输入框（简化版） */}
      <div className="border-t border-border p-4">
        <input
          type="text"
          placeholder="输入消息..."
          className="w-full px-4 py-2 border border-border rounded-lg"
        />
      </div>
    </div>
  );
}

/**
 * 示例：消息时间戳的不同用法
 */
export function TimestampExample() {
  const now = Date.now();

  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="font-semibold mb-2">相对时间（默认）</h3>
        <MessageTimestamp timestamp={now - 60000} />
        {/* 显示: "1分钟前" */}
      </div>

      <div>
        <h3 className="font-semibold mb-2">完整时间</h3>
        <MessageTimestamp timestamp={now} showFullTime={true} />
        {/* 显示: "今天 14:30:00" */}
      </div>

      <div>
        <h3 className="font-semibold mb-2">使用 Date 对象</h3>
        <MessageTimestamp timestamp={new Date()} />
      </div>

      <div>
        <h3 className="font-semibold mb-2">自定义刷新间隔（5秒）</h3>
        <MessageTimestamp timestamp={now - 30000} refreshInterval={5000} />
      </div>
    </div>
  );
}

/**
 * 示例：消息操作按钮
 */
export function ActionsExample() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="font-semibold mb-2">助手消息操作</h3>
        <div className="inline-flex border border-border rounded-lg p-2">
          <MessageActions
            messageType="assistant"
            content="这是一条助手消息"
            onCopy={() => console.log('复制')}
            onRegenerate={() => console.log('重新生成')}
          />
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">用户消息操作</h3>
        <div className="inline-flex border border-border rounded-lg p-2">
          <MessageActions
            messageType="user"
            content="这是一条用户消息"
            onCopy={() => console.log('复制')}
            onEdit={() => console.log('编辑')}
            onDelete={() => console.log('删除')}
          />
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">悬停显示</h3>
        <div className="group border border-border rounded-lg p-4">
          <p className="mb-2">悬停此区域查看操作按钮</p>
          <MessageActions
            messageType="assistant"
            content="消息内容"
            onCopy={() => console.log('复制')}
            showOnHover={true}
          />
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">正在生成中</h3>
        <div className="inline-flex border border-border rounded-lg p-2">
          <MessageActions
            messageType="assistant"
            content="消息内容"
            isGenerating={true}
            onRegenerate={() => console.log('重新生成')}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 示例：不同状态的消息卡片
 */
export function MessageStatesExample() {
  return (
    <div className="space-y-6 p-6">
      {/* 正常消息 */}
      <MessageCard
        message={{
          id: '1',
          role: 'assistant',
          content: '这是一条正常的消息',
          timestamp: Date.now(),
        }}
      />

      {/* 正在发送 */}
      <MessageCard
        message={{
          id: '2',
          role: 'user',
          content: '这条消息正在发送...',
          timestamp: Date.now(),
          status: 'sending',
        }}
      />

      {/* 发送失败 */}
      <MessageCard
        message={{
          id: '3',
          role: 'user',
          content: '这条消息发送失败',
          timestamp: Date.now(),
          status: 'error',
        }}
        onRetry={(id) => console.log('重试:', id)}
      />

      {/* 包含思考过程 */}
      <MessageCard
        message={{
          id: '4',
          role: 'assistant',
          content: '经过思考后的回答',
          timestamp: Date.now(),
          thinkingContent: '让我思考一下这个问题...\n分析用户的需求...\n制定解决方案...',
        }}
      />

      {/* 包含工具调用 */}
      <MessageCard
        message={{
          id: '5',
          role: 'assistant',
          content: '已创建文件',
          timestamp: Date.now(),
          toolCalls: [
            {
              id: 'call_1',
              name: 'create_file',
              status: 'success',
              input: { path: 'test.ts', content: 'console.log("Hello")' },
              output: '文件创建成功',
              duration: 120,
            },
          ],
        }}
      />

      {/* 包含统计信息 */}
      <MessageCard
        message={{
          id: '6',
          role: 'assistant',
          content: '这条消息包含统计信息',
          timestamp: Date.now(),
          duration: 2500,
          tokenCount: 350,
          cost: 0.0025,
        }}
      />
    </div>
  );
}

/**
 * 示例：国际化切换
 */
export function I18nExample() {
  const { i18n } = useTranslation();
  const [currentLang, setCurrentLang] = useState(i18n.language);
  const supportedLanguages = Object.keys(SUPPORTED_LANGUAGES) as SupportedLanguage[];

  const switchLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLang(lang);
  };

  return (
    <div className="space-y-6 p-6">
      {/* 语言切换器 */}
      <div className="flex gap-2">
        {supportedLanguages.map((lang) => (
          <button
            key={lang}
            onClick={() => switchLanguage(lang)}
            className={cn(
              'px-4 py-2 rounded',
              currentLang === lang ? 'bg-primary text-primary-foreground' : 'bg-secondary'
            )}
          >
            {SUPPORTED_LANGUAGES[lang].nativeName}
          </button>
        ))}
      </div>

      {/* 示例消息 */}
      <MessageCard
        message={{
          id: '1',
          role: 'assistant',
          content: '这是一条测试消息',
          timestamp: Date.now() - 300000, // 5分钟前
          tokenCount: 100,
        }}
        onCopy={() => console.log('复制')}
        onRegenerate={() => console.log('重新生成')}
      />
    </div>
  );
}

// 导入必要的类型和组件
import { MessageTimestamp, MessageActions } from '@/ui/components/chat';
import { useTranslation } from 'react-i18next';
import { cn } from '@/ui/lib/utils';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/ui/i18n/config';
