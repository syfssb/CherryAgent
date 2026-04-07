import { useCallback, useEffect, useRef } from 'react';
import { driver, type DriveStep, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './onboarding.css';
import { useTranslation } from 'react-i18next';

const ONBOARDING_KEY = 'onboarding-tour-version';
const ONBOARDING_VERSION = '12';
const TOUR_START_DELAY_MS = 1500;

function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === ONBOARDING_VERSION;
  } catch {
    return false;
  }
}

function markOnboardingCompleted(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, ONBOARDING_VERSION);
  } catch {
    // ignore storage errors
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_KEY);
    localStorage.removeItem('onboarding-completed');
  } catch {
    // ignore storage errors
  }
}

// ─── 10-step guided tour ─────────────────────────────────────────────────────
// 预留 data-tour 属性（当前未引用）：
// - data-tour="balance"          → BalanceDisplay.tsx
// - data-tour="permission-mode"  → PermissionModeSelector.tsx
// - data-tour="skill-selector"   → SkillSelector.tsx

// SVG icon paths for tour step titles (Lucide-style, 24x24 viewBox)
const ICONS = {
  // Sparkles — 欢迎
  sparkles: '<svg viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>',
  // Plus-circle — 新建任务
  plusCircle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>',
  // Folder — 工作区
  folder: '<svg viewBox="0 0 24 24"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-1L9 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></svg>',
  // Cpu — 模型选择
  cpu: '<svg viewBox="0 0 24 24"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>',
  // MessageSquare — 输入
  message: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  // Send — 发送
  send: '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  // Layers — 多任务
  layers: '<svg viewBox="0 0 24 24"><path d="m12.8 19.7-.8.5-.8-.5C6 16.5 2 13.3 2 9.5 2 6.7 4.2 5 7 5c1.7 0 3.6.8 5 2.5C13.4 5.8 15.3 5 17 5c2.8 0 5 1.7 5 4.5 0 3.8-4 7-9.2 10.2z" stroke="none" fill="currentColor"/></svg>',
  // LayoutList — 侧边栏
  layoutList: '<svg viewBox="0 0 24 24"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><path d="M14 4h7"/><path d="M14 9h7"/><path d="M14 15h7"/><path d="M14 20h7"/></svg>',
  // Compass — 导航
  compass: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none"/></svg>',
  // User — 个人中心
  user: '<svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
} as const;

/** 生成带图标的 title HTML */
function iconTitle(icon: string, text: string): string {
  return `<span class="tour-icon">${icon}</span>${text}`;
}

function buildSteps(t: (key: string, fallback: string) => string): DriveStep[] {
  return [
    // ① 欢迎 — 产品价值
    {
      popover: {
        title: iconTitle(ICONS.sparkles, t(
          'onboarding.welcome.title',
          '欢迎使用 Cherry Agent'
        )),
        description: t(
          'onboarding.welcome.desc',
          '你的 AI 工作伙伴。它能帮你<b>整理文件</b>、<b>处理数据</b>、<b>创作内容</b>、<b>编写代码</b>——像一个全能助手坐在你旁边。<br/><br/>接下来带你快速上手，了解核心功能。'
        ),
        side: 'over',
        align: 'center',
      },
    },

    // ② 新建任务
    {
      element: '[data-tour="new-task"]',
      popover: {
        title: iconTitle(ICONS.plusCircle, t(
          'onboarding.newTask.title',
          '第一步：新建任务'
        )),
        description: t(
          'onboarding.newTask.desc',
          '点击这里开始一个新任务。每个任务是一个独立对话，AI 会记住整个对话上下文。<br/><br/>你可以同时开多个任务，互不干扰。'
        ),
        side: 'right',
        align: 'start',
      },
    },

    // ③ 选择工作区
    {
      element: '[data-tour="workspace-selector"]',
      popover: {
        title: iconTitle(ICONS.folder, t(
          'onboarding.workspace.title',
          '选择工作区'
        )),
        description: t(
          'onboarding.workspace.desc',
          '<b>工作区就是 AI 的工作文件夹。</b>AI 只能在这个文件夹里读写文件，不会碰其他地方。<br/><br/>比如你要整理下载文件夹，就选「下载」；要做项目，就选项目文件夹。'
        ),
        side: 'top',
        align: 'start',
      },
    },

    // ④ 选择模型
    {
      element: '[data-tour="model-selector"]',
      popover: {
        title: iconTitle(ICONS.cpu, t(
          'onboarding.model.title',
          '选择 AI 模型'
        )),
        description: t(
          'onboarding.model.desc',
          '三种模型适合不同场景：<br/><br/>• <b>Haiku</b> — 快速简单任务，最省积分<br/>• <b>Sonnet</b> — 日常工作场景，性价比最高<br/>• <b>Opus</b> — 最全面强大，价格稍高<br/><br/>根据任务难度选择，随时可切换。'
        ),
        side: 'bottom',
        align: 'center',
      },
    },

    // ⑤ 输入任务要求
    {
      element: '[data-tour="prompt-input"]',
      popover: {
        title: iconTitle(ICONS.message, t(
          'onboarding.input.title',
          '输入你的任务'
        )),
        description: t(
          'onboarding.input.desc',
          '用自然语言描述你想做的事情。说得越具体，AI 理解越准确。<br/><br/>好的示例：<br/>「帮我把这个文件夹里的照片按年份分类，每个年份建一个子文件夹」'
        ),
        side: 'top',
        align: 'center',
      },
    },

    // ⑥ 发送按钮
    {
      element: '[data-tour="send-button"]',
      popover: {
        title: iconTitle(ICONS.send, t(
          'onboarding.send.title',
          '点击发送'
        )),
        description: t(
          'onboarding.send.desc',
          '写好任务后，点击这个按钮发送（或按 <b>Enter</b>）。<br/><br/>AI 开始工作后，这个按钮会变成<b>停止按钮</b>，随时可以中断。'
        ),
        side: 'top',
        align: 'end',
      },
    },

    // ⑦ 多任务并行
    {
      element: '[data-tour="new-task"]',
      popover: {
        title: iconTitle(ICONS.layers, t(
          'onboarding.multitask.title',
          '多任务同时跑'
        )),
        description: t(
          'onboarding.multitask.desc',
          '一个任务在运行时，你可以点「新建任务」再开一个！<br/><br/>多个 AI 任务可以<b>同时并行执行</b>，互不影响。比如一边整理文件，一边分析数据。'
        ),
        side: 'right',
        align: 'start',
      },
    },

    // ⑧ 侧边栏 — 按工作区管理（align: center 让高亮覆盖整个侧边栏）
    {
      element: '[data-tour="sidebar"]',
      popover: {
        title: iconTitle(ICONS.layoutList, t(
          'onboarding.sidebar.title',
          '任务管理'
        )),
        description: t(
          'onboarding.sidebar.desc',
          '所有任务按<b>工作区分组</b>展示。同一个文件夹下的任务自动归到一起。<br/><br/>支持搜索、置顶、归档，任务再多也不乱。'
        ),
        side: 'right',
        align: 'center',
      },
    },

    // ⑨ 左下角菜单
    {
      element: '[data-tour="bottom-nav"]',
      popover: {
        title: iconTitle(ICONS.compass, t(
          'onboarding.bottomNav.title',
          '快捷导航'
        )),
        description: t(
          'onboarding.bottomNav.desc',
          '底部三个快捷入口：<br/><br/>• <b>模型价格</b> — 查看各模型的积分消耗<br/>• <b>推荐有奖</b> — 邀请好友，双方获得积分奖励<br/>• <b>快捷键</b> — 查看所有键盘快捷操作'
        ),
        side: 'top',
        align: 'center',
      },
    },

    // ⑩ 右上角头像
    {
      element: '[data-tour="user-menu"]',
      popover: {
        title: iconTitle(ICONS.user, t(
          'onboarding.userMenu.title',
          '个人中心'
        )),
        description: t(
          'onboarding.userMenu.desc',
          '点击头像进入个人中心：<br/><br/>• <b>充值</b> — 购买积分<br/>• <b>设置</b> — 头像、主题、记忆、技能市场、数据同步<br/>• <b>余额</b> — 快速查看剩余积分'
        ),
        side: 'bottom',
        align: 'end',
      },
    },
  ];
}

function filterAvailableSteps(steps: DriveStep[]): DriveStep[] {
  return steps.filter((step) => {
    if (!step.element) return true;
    return document.querySelector(step.element as string) !== null;
  });
}

/** 引导完成后聚焦输入框 */
function focusPromptInput(): void {
  setTimeout(() => {
    const input = document.querySelector(
      '[data-prompt-input]'
    ) as HTMLTextAreaElement;
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, 200);
}

export function useOnboardingTour() {
  const { t } = useTranslation();
  const driverRef = useRef<Driver | null>(null);

  const startTour = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy();
    }

    const steps = buildSteps(t);
    const availableSteps = filterAvailableSteps(steps);

    if (availableSteps.length === 0) return;

    const driverInstance = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      stagePadding: 10,
      stageRadius: 14,
      popoverOffset: 14,
      progressText: '{{current}} / {{total}}',
      nextBtnText: t('onboarding.next', '下一步'),
      prevBtnText: t('onboarding.prev', '上一步'),
      doneBtnText: t('onboarding.done', '开始使用'),
      onDestroyed: () => {
        markOnboardingCompleted();
        focusPromptInput();
      },
      steps: availableSteps,
    });

    driverRef.current = driverInstance;
    driverInstance.drive();
  }, [t]);

  useEffect(() => {
    if (isOnboardingCompleted()) return;

    const timer = setTimeout(() => {
      startTour();
    }, TOUR_START_DELAY_MS);

    return () => {
      clearTimeout(timer);
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
    };
  }, [startTour]);

  useEffect(() => {
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
    };
  }, []);

  return { startTour, resetOnboarding };
}
