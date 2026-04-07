/**
 * 测试数据和常量
 */

export const TEST_USER = {
  email: 'test@example.com',
  password: 'Test@123456',
}

export const TEST_WORKSPACE = {
  path: '/tmp/test-workspace',
  files: [
    'package.json',
    'README.md',
    'src/index.ts',
    'src/utils/helper.ts',
  ],
}

export const TEST_MODELS = [
  {
    id: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    provider: 'Anthropic',
    note: '最强大的模型，适合复杂推理任务。上下文窗口 200K tokens。',
  },
  {
    id: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    note: '平衡性能和成本的模型，适合日常开发任务。',
  },
]

export const TEST_PERIOD_CARDS = [
  {
    id: 'monthly-basic',
    name: '月卡基础版',
    description: '每日 100 积分，适合轻度使用。有效期 30 天。',
    priceCents: 2900,
    priceYuan: '29.00',
    dailyCredits: 100,
    periodDays: 30,
  },
  {
    id: 'monthly-pro',
    name: '月卡专业版',
    description: '每日 300 积分，适合中度使用。有效期 30 天。',
    priceCents: 7900,
    priceYuan: '79.00',
    dailyCredits: 300,
    periodDays: 30,
  },
]

export const TIMEOUTS = {
  SHORT: 5000,
  MEDIUM: 10000,
  LONG: 30000,
  TASK_EXECUTION: 60000,
}

export const SELECTORS = {
  // 输入框
  promptInput: 'textarea[data-prompt-input]',
  sendButton: 'button[aria-label*="发送"]',
  stopButton: 'button[aria-label*="停止"]',

  // 文件浏览器
  fileExplorer: '[data-testid="file-explorer"]',
  fileItem: '[data-testid="file-item"]',
  fileOpenButton: '[data-testid="file-open"]',
  fileCopyButton: '[data-testid="file-copy-name"]',

  // 模型选择器
  modelSelector: '[data-tour="model-selector"]',
  modelOption: '[data-testid="model-option"]',
  modelNote: '[data-testid="model-note"]',

  // 期卡
  periodCardSection: '[data-testid="period-card-section"]',
  periodCardPlan: '[data-testid="period-card-plan"]',
  periodCardDescription: '[data-testid="period-card-description"]',
}
