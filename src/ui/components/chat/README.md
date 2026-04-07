# 对话界面组件使用指南

## 概述

本目录包含完整的对话界面组件，支持国际化、时间戳格式化、消息操作等功能。

## 核心组件

### MessageCard - 消息卡片

完整的消息展示组件，包含所有功能。

```tsx
import { MessageCard } from '@/ui/components/chat';

function ChatView() {
  return (
    <MessageCard
      message={{
        id: '1',
        role: 'assistant',
        content: '这是一条消息',
        timestamp: Date.now(),
        tokenCount: 150,
        cost: 0.0012,
      }}
      onCopy={(content) => console.log('复制:', content)}
      onRegenerate={(id) => console.log('重新生成:', id)}
      onDelete={(id) => console.log('删除:', id)}
    />
  );
}
```

### MessageTimestamp - 时间戳

智能时间显示，自动刷新，支持国际化。

```tsx
import { MessageTimestamp } from '@/ui/components/chat';

// 基础用法
<MessageTimestamp timestamp={Date.now()} />

// 显示完整时间
<MessageTimestamp timestamp={Date.now()} showFullTime={true} />

// 自定义刷新间隔
<MessageTimestamp timestamp={Date.now()} refreshInterval={5000} />
```

特性：
- 相对时间显示（刚刚、5分钟前、昨天等）
- 悬停显示完整时间
- 自动刷新（根据时间差智能调整刷新间隔）
- 完整国际化支持

### MessageActions - 消息操作

提供复制、重试、编辑、删除等操作。

```tsx
import { MessageActions } from '@/ui/components/chat';

// 助手消息操作
<MessageActions
  messageType="assistant"
  content="消息内容"
  onCopy={() => console.log('已复制')}
  onRegenerate={() => console.log('重新生成')}
  showOnHover={true}
/>

// 用户消息操作
<MessageActions
  messageType="user"
  content="消息内容"
  onEdit={() => console.log('编辑')}
  onDelete={() => console.log('删除')}
/>
```

特性：
- 自动根据消息类型显示对应操作
- 复制带成功状态反馈
- 悬停显示支持
- 完整无障碍支持（ARIA 标签）

## 时间格式化工具

### 导入

```tsx
import {
  formatRelativeTime,
  formatFullDateTime,
  formatSmartDateTime,
  formatDuration,
  isToday,
  isYesterday,
} from '@/ui/lib';
```

### 使用示例

```tsx
// 相对时间
formatRelativeTime(Date.now() - 60000, 'zh-CN'); // "1分钟前"
formatRelativeTime(Date.now() - 60000, 'en-US'); // "1 minute ago"

// 智能日期时间
formatSmartDateTime(Date.now(), 'zh-CN'); // "今天 14:30:00"
formatSmartDateTime(Date.now() - 86400000, 'zh-CN'); // "昨天 14:30:00"

// 持续时间
formatDuration(125000, 'zh-CN'); // "2分5秒"
formatDuration(125000, 'en-US'); // "2m 5s"

// 判断函数
isToday(Date.now()); // true
isYesterday(Date.now() - 86400000); // true
```

## 国际化配置

### 添加新的翻译键

1. 在 `/src/ui/i18n/locales/zh.json` 中添加中文翻译
2. 在 `/src/ui/i18n/locales/en.json` 中添加英文翻译

```json
// zh.json
{
  "chat": {
    "newKey": "新文案"
  }
}

// en.json
{
  "chat": {
    "newKey": "New text"
  }
}
```

### 在组件中使用翻译

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();

  return <div>{t('chat.newKey')}</div>;
}
```

### 带参数的翻译

```json
{
  "time": {
    "minutesAgo": "{{count}} 分钟前"
  }
}
```

```tsx
t('time.minutesAgo', { count: 5 }); // "5 分钟前"
```

## 测试

### 运行国际化测试

```bash
npm test src/ui/i18n/__tests__/i18n.test.ts
```

这个测试会验证：
- 所有必需的翻译键存在
- 中英文配置结构一致
- 没有空的翻译值
- 对话和时间相关的文案完整

## 最佳实践

### 1. 不要硬编码文本

❌ 错误
```tsx
<button>复制</button>
```

✅ 正确
```tsx
const { t } = useTranslation();
<button>{t('chat.copy')}</button>
```

### 2. 使用相对时间而非绝对时间

对于消息时间戳，优先使用相对时间，完整时间放在悬停提示中。

```tsx
<MessageTimestamp timestamp={message.timestamp} />
```

### 3. 提供操作反馈

所有用户操作都应该有视觉反馈。

```tsx
<MessageActions
  onCopy={() => {
    // 显示"已复制"状态
  }}
/>
```

### 4. 考虑无障碍

所有交互元素都应该有适当的 ARIA 标签。

```tsx
<button aria-label={t('chat.copy')}>
  <CopyIcon />
</button>
```

## 性能优化

### 1. 时间戳自动刷新

MessageTimestamp 组件会根据时间差智能调整刷新间隔：
- 1分钟内：每10秒刷新
- 1小时内：每分钟刷新
- 24小时内：每5分钟刷新
- 超过24小时：每小时刷新

### 2. 使用 useMemo 缓存格式化结果

```tsx
const formattedTime = useMemo(
  () => formatRelativeTime(timestamp, locale),
  [timestamp, locale]
);
```

### 3. 避免不必要的重新渲染

使用 React.memo 包裹纯展示组件。

```tsx
export const MessageTimestamp = React.memo(function MessageTimestamp(props) {
  // ...
});
```

## 故障排除

### 翻译不显示

1. 检查翻译键是否存在于两个语言文件中
2. 运行测试验证配置完整性
3. 检查 i18next 是否正确初始化

### 时间格式不正确

1. 确认传入的 timestamp 是毫秒数
2. 检查 locale 参数是否正确
3. 验证浏览器的 Intl API 支持

### 消息操作不工作

1. 确认回调函数已正确传递
2. 检查 messageType 是否匹配
3. 验证按钮没有被禁用

## 扩展

### 添加新的消息操作

1. 在 MessageActions 组件中添加新按钮
2. 在 MessageActionsProps 中添加对应的回调
3. 添加相应的国际化键
4. 更新类型定义

### 支持新的时间格式

1. 在 `/src/ui/lib/time.ts` 中添加新的格式化函数
2. 导出该函数
3. 在组件中使用
4. 添加单元测试

## 相关文件

- `/src/ui/components/chat/MessageCard.tsx` - 消息卡片组件
- `/src/ui/components/chat/MessageTimestamp.tsx` - 时间戳组件
- `/src/ui/components/chat/MessageActions.tsx` - 消息操作组件
- `/src/ui/lib/time.ts` - 时间格式化工具
- `/src/ui/i18n/locales/zh.json` - 中文翻译
- `/src/ui/i18n/locales/en.json` - 英文翻译
- `/src/ui/i18n/__tests__/i18n.test.ts` - 国际化测试
