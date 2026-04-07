import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import { useAuthStore } from "../../store/useAuthStore";
import { TaskIconMap, type TaskIconId } from "./TaskIcons";
import { formatShortcut } from "../../utils/platform";

interface TaskExample {
  id: string;
  icon: TaskIconId;
  title: string;
  description: string;
  prompt: string;
  category: string;
  gradient: string;
}

// 将 taskExamples 改为函数，以便使用 t() 函数
const getTaskExamples = (t: (key: string, fallback?: string) => string): TaskExample[] => [
  // 文件管理 - 展示大规模处理能力
  {
    id: "organize-downloads",
    icon: "batch-process",
    title: t("chat.welcome.tasks.organizeDownloads.title", "整理500+文件 · 5分钟"),
    description: t("chat.welcome.tasks.organizeDownloads.description", "自动分类、重命名、检测重复，2-3小时工作量压缩到5分钟"),
    prompt: t("chat.welcome.tasks.organizeDownloads.prompt", "帮我整理下载文件夹，自动分类、重命名并检测重复文件"),
    category: "automation",
    gradient: "from-violet-500/10 to-purple-500/10",
  },

  // 数据提取 - 展示OCR和格式转换能力
  {
    id: "invoice-processing",
    icon: "extract-info",
    title: t("chat.welcome.tasks.invoiceProcessing.title", "处理45张发票 · 10分钟"),
    description: t("chat.welcome.tasks.invoiceProcessing.description", "OCR识别、数据提取、生成Excel报表，半天工作量压缩到10分钟"),
    prompt: t("chat.welcome.tasks.invoiceProcessing.prompt", "帮我处理这些发票照片，提取数据并生成Excel报表"),
    category: "data",
    gradient: "from-amber-500/10 to-yellow-500/10",
  },

  // 数据清洗 - 展示大规模数据处理
  {
    id: "data-cleaning",
    icon: "excel-analysis",
    title: t("chat.welcome.tasks.dataCleaning.title", "清洗10000+条数据 · 30分钟"),
    description: t("chat.welcome.tasks.dataCleaning.description", "去重、格式统一、异常值处理，2天工作量压缩到30分钟"),
    prompt: t("chat.welcome.tasks.dataCleaning.prompt", "帮我清洗这个Excel文件中的数据，去重并修复格式问题"),
    category: "data",
    gradient: "from-green-500/10 to-emerald-500/10",
  },

  // 反馈分析 - 展示文本分析和洞察能力
  {
    id: "feedback-analysis",
    icon: "research",
    title: t("chat.welcome.tasks.feedbackAnalysis.title", "分析230条反馈 · 1天"),
    description: t("chat.welcome.tasks.feedbackAnalysis.description", "情感分析、智能分类、生成洞察报告，1周工作量压缩到1天"),
    prompt: t("chat.welcome.tasks.feedbackAnalysis.prompt", "帮我分析这些客户反馈，进行情感分析并生成报告"),
    category: "research",
    gradient: "from-sky-500/10 to-blue-500/10",
  },

  // 文档整理 - 展示知识管理能力
  {
    id: "doc-organization",
    icon: "summarize",
    title: t("chat.welcome.tasks.docOrganization.title", "整理3个月文档 · 20分钟"),
    description: t("chat.welcome.tasks.docOrganization.description", "按类型分类、统一命名、创建索引，1天工作量压缩到20分钟"),
    prompt: t("chat.welcome.tasks.docOrganization.prompt", "帮我整理项目文档，按类型分类并创建索引"),
    category: "automation",
    gradient: "from-rose-500/10 to-pink-500/10",
  },

  // 会议纪要 - 展示音频处理和内容生成
  {
    id: "meeting-minutes",
    icon: "write-article",
    title: t("chat.welcome.tasks.meetingMinutes.title", "处理5个会议录音 · 25分钟"),
    description: t("chat.welcome.tasks.meetingMinutes.description", "语音转文字、提取要点、生成待办，5小时工作量压缩到25分钟"),
    prompt: t("chat.welcome.tasks.meetingMinutes.prompt", "帮我处理这些会议录音，生成纪要并提取待办事项"),
    category: "content",
    gradient: "from-orange-500/10 to-red-500/10",
  },
];

interface WelcomeGuideProps {
  onTaskSelect?: (prompt: string) => void;
  onLoginRequired?: () => void;
}

export function WelcomeGuide({ onTaskSelect, onLoginRequired }: WelcomeGuideProps) {
  const { t } = useTranslation();
  const setPrompt = useAppStore((state) => state.setPrompt);
  const cwd = useAppStore((state) => state.cwd);
  const setShowStartModal = useAppStore((state) => state.setShowStartModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const pasteShortcut = formatShortcut(["Mod", "V"], { useSymbol: true, separator: " + " });

  // 获取任务示例列表
  const taskExamples = getTaskExamples(t);

  const handleTaskClick = useCallback(
    (task: TaskExample) => {
      // 未登录状态：提示登录
      if (!isAuthenticated) {
        onLoginRequired?.();
        return;
      }

      // 已登录状态：有工作目录则直接填充输入框；没有目录再弹新建任务窗口
      setPrompt(task.prompt);
      if (cwd.trim()) {
        setShowStartModal(false);
      } else {
        setShowStartModal(true);
      }
      onTaskSelect?.(task.prompt);

      // 聚焦到输入框
      setTimeout(() => {
        const input = document.querySelector('[data-prompt-input]') as HTMLTextAreaElement;
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 100);
    },
    [isAuthenticated, setPrompt, cwd, setShowStartModal, onTaskSelect, onLoginRequired]
  );

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 animate-fade-in">
      {/* 标题区域 - 采用现代化设计 */}
      <div className="text-center mb-12 max-w-2xl">
        <div className="mb-6 relative inline-block">
          {/* 发光效果背景 */}
          <div className="absolute inset-0 bg-gradient-to-r from-accent/20 via-accent/30 to-accent/20 blur-2xl rounded-full" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-accent/10 to-accent/5 backdrop-blur-sm border border-accent/20 shadow-lg">
            <svg
              viewBox="0 0 24 24"
              className="h-10 w-10 text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-ink-700 mb-3 tracking-tight">
          {t("welcome.title", "Cherry Agent 能帮你做什么？")}
        </h1>
        <p className="text-base text-muted leading-relaxed">
          {t("welcome.subtitle", "点击下方任务卡片快速开始，或直接输入你的需求")}
        </p>
      </div>

      {/* 任务卡片网格 - 现代化玻璃态设计 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-6xl w-full mb-12">
        {taskExamples.map((task, index) => (
          <button
            key={task.id}
            onClick={() => handleTaskClick(task)}
            onMouseEnter={() => setHoveredCard(task.id)}
            onMouseLeave={() => setHoveredCard(null)}
            className="group relative flex flex-col items-start gap-3 rounded-2xl border border-ink-900/10 bg-surface/80 backdrop-blur-sm p-5 text-left transition-all duration-300 hover:border-accent/40 hover:shadow-xl hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
            style={{
              animationDelay: `${index * 50}ms`,
            }}
          >
            {/* 渐变背景 */}
            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${task.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

            {/* 图标容器 */}
            <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm">
              {(() => {
                const IconComponent = TaskIconMap[task.icon];
                return <IconComponent className="h-7 w-7 text-accent" />;
              })()}
            </div>

            {/* 内容 */}
            <div className="relative z-10 flex-1 space-y-1.5">
              <h3 className="text-sm font-semibold text-ink-700 group-hover:text-accent transition-colors duration-300">
                {task.title}
              </h3>
              <p className="text-xs text-muted leading-relaxed line-clamp-2">
                {task.description}
              </p>
            </div>

            {/* 悬停箭头指示器 */}
            <div className={`absolute top-4 right-4 transition-all duration-300 ${
              hoveredCard === task.id ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
            }`}>
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* 底部提示 - 简洁现代 */}
      <div className="flex flex-col items-center gap-4 text-xs text-muted max-w-2xl">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2">
            <kbd className="rounded-md bg-ink-900/5 px-2.5 py-1.5 text-[11px] font-medium border border-ink-900/10 shadow-sm">
              Enter
            </kbd>
            <span>{t("welcome.sendHint", "发送消息")}</span>
          </span>
          <span className="flex items-center gap-2">
            <kbd className="rounded-md bg-ink-900/5 px-2.5 py-1.5 text-[11px] font-medium border border-ink-900/10 shadow-sm">
              {pasteShortcut}
            </kbd>
            <span>{t("welcome.pasteHint", "粘贴图片")}</span>
          </span>
        </div>
        <p className="text-center leading-relaxed opacity-75">
          {t("welcome.hint", "Cherry Agent 支持处理文档、数据分析、内容创作等多种任务")}
        </p>
      </div>

      {/* 未登录提示浮层 */}
      {!isAuthenticated && (
        <div className="mt-8 rounded-xl border border-accent/20 bg-accent/5 backdrop-blur-sm px-6 py-4 max-w-md">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 flex-shrink-0">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-ink-700">
                {t("welcome.loginRequired", "登录后开始使用")}
              </p>
              <p className="text-xs text-muted">
                {t("welcome.loginHint", "点击任意任务卡片将引导你完成登录")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
