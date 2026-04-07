import { useCallback, useMemo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAppStore } from "../../store/useAppStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useSkillStore } from "../../store/useSkillStore";
import { getSkillDisplayName, getSkillDescription } from "../../utils/skillI18n";
import { TaskIconMap, type TaskIconId } from "./TaskIcons";
import cherryIcon from "../../assets/cherry-icon.png";
import {
  FolderOpen,
  BarChart3,
  FileText,
  Wand2,
  Sparkles,
  ArrowRight,
  Lightbulb,
  Brain,
  ListChecks,
  Puzzle,
  Search,
  FolderKanban,
  Zap,
  ChevronRight,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskExample {
  id: string;
  icon: TaskIconId;
  title: string;
  description: string;
  prompt: string;
  category: string;
  gradient: string;
  isSkill?: boolean;
  skillId?: string;
}

interface NewWelcomeGuideProps {
  onTaskSelect?: (prompt: string) => void;
  onLoginRequired?: () => void;
}

// ─── Capability definitions ──────────────────────────────────────────────────

interface Capability {
  id: string;
  icon: typeof FolderOpen;
  title: string;
  description: string;
  examples: string[];
  accentColor: string;
}

function getCapabilities(t: TFunction): Capability[] {
  return [
    {
      id: "file-automation",
      icon: FolderOpen,
      title: t("welcome.capabilities.fileAutomation.title", "文件自动化"),
      description: t(
        "welcome.capabilities.fileAutomation.desc",
        "批量整理、重命名、分类文件，自动检测重复并释放空间"
      ),
      examples: [
        t("welcome.capabilities.fileAutomation.ex1", "整理下载文件夹，按类型自动分类"),
        t("welcome.capabilities.fileAutomation.ex2", "按拍摄日期批量重命名照片"),
        t("welcome.capabilities.fileAutomation.ex3", "检测并清理重复文件"),
      ],
      accentColor: "#ae5630",
    },
    {
      id: "data-processing",
      icon: BarChart3,
      title: t("welcome.capabilities.dataProcessing.title", "数据处理"),
      description: t(
        "welcome.capabilities.dataProcessing.desc",
        "Excel 清洗、发票识别、数据合并，秒出分析报表"
      ),
      examples: [
        t("welcome.capabilities.dataProcessing.ex1", "处理发票照片，提取数据生成报表"),
        t("welcome.capabilities.dataProcessing.ex2", "清洗 Excel 数据，去重修复格式"),
        t("welcome.capabilities.dataProcessing.ex3", "合并多个 CSV 文件并统一格式"),
      ],
      accentColor: "#788c5d",
    },
    {
      id: "content-creation",
      icon: FileText,
      title: t("welcome.capabilities.contentCreation.title", "内容创作"),
      description: t(
        "welcome.capabilities.contentCreation.desc",
        "文档撰写、会议纪要、社交媒体文案，一句话生成专业内容"
      ),
      examples: [
        t("welcome.capabilities.contentCreation.ex1", "生成 SEO 优化文章"),
        t("welcome.capabilities.contentCreation.ex2", "处理会议录音，提取待办事项"),
        t("welcome.capabilities.contentCreation.ex3", "生成多平台社交媒体内容"),
      ],
      accentColor: "#2563EB",
    },
    {
      id: "smart-assistant",
      icon: Wand2,
      title: t("welcome.capabilities.smartAssistant.title", "智能助手"),
      description: t(
        "welcome.capabilities.smartAssistant.desc",
        "项目规划、学习计划、投资分析，复杂任务一步到位"
      ),
      examples: [
        t("welcome.capabilities.smartAssistant.ex1", "制定详细的项目执行计划"),
        t("welcome.capabilities.smartAssistant.ex2", "分析投资组合表现"),
        t("welcome.capabilities.smartAssistant.ex3", "生成个性化学习路径"),
      ],
      accentColor: "#4d8078",
    },
  ];
}

// ─── Quick-start prompt cards ────────────────────────────────────────────────

interface QuickPrompt {
  id: string;
  icon: TaskIconId;
  label: string;
  prompt: string;
  preview: string;
}

function getQuickPrompts(t: TFunction): QuickPrompt[] {
  return [
    {
      id: "qp-organize",
      icon: "organize-downloads",
      label: t("welcome.quickPrompts.organize.label", "整理文件"),
      prompt: t(
        "welcome.quickPrompts.organize.prompt",
        "帮我整理下载文件夹，自动分类、重命名并检测重复文件"
      ),
      preview: t(
        "welcome.quickPrompts.organize.preview",
        "我会扫描文件夹，按类型分类并生成报告..."
      ),
    },
    {
      id: "qp-invoice",
      icon: "invoice-processing",
      label: t("welcome.quickPrompts.invoice.label", "处理发票"),
      prompt: t(
        "welcome.quickPrompts.invoice.prompt",
        "帮我处理这些发票照片，提取数据并生成Excel报表"
      ),
      preview: t(
        "welcome.quickPrompts.invoice.preview",
        "我会 OCR 识别发票内容，提取关键数据..."
      ),
    },
    {
      id: "qp-research",
      icon: "research-summary",
      label: t("welcome.quickPrompts.research.label", "文献综述"),
      prompt: t(
        "welcome.quickPrompts.research.prompt",
        "帮我分析这些研究论文并生成文献综述"
      ),
      preview: t(
        "welcome.quickPrompts.research.preview",
        "我会逐篇分析论文，提取关键观点..."
      ),
    },
    {
      id: "qp-project",
      icon: "project-planning",
      label: t("welcome.quickPrompts.project.label", "项目规划"),
      prompt: t(
        "welcome.quickPrompts.project.prompt",
        "帮我为这个项目制定详细的执行计划"
      ),
      preview: t(
        "welcome.quickPrompts.project.preview",
        "我会生成时间线、任务分配和里程碑..."
      ),
    },
  ];
}

// ─── Pro tips (高质量使用技巧) ────────────────────────────────────────────

interface ProTip {
  id: string;
  icon: typeof Lightbulb;
  title: string;
  description: string;
}

function getProTips(t: TFunction): ProTip[] {
  return [
    {
      id: "tip-memory",
      icon: Brain,
      title: t("welcome.proTips.memory.title", "用「记忆」存你的偏好"),
      description: t(
        "welcome.proTips.memory.desc",
        "点击右上角头像 → 设置 → 记忆，写入你的习惯和偏好，AI 每次对话都会读取，不用重复说"
      ),
    },
    {
      id: "tip-stepwise",
      icon: ListChecks,
      title: t("welcome.proTips.stepwise.title", "复杂任务分步走"),
      description: t(
        "welcome.proTips.stepwise.desc",
        "先说「只做第一步，读完告诉我你读到了什么」，确认理解正确再继续，出了问题可以早期纠偏"
      ),
    },
    {
      id: "tip-skill-creator",
      icon: Puzzle,
      title: t("welcome.proTips.skillCreator.title", "把好用的流程变成 Skill"),
      description: t(
        "welcome.proTips.skillCreator.desc",
        "直接说「用 Skill Creator 帮我创建一个……的技能」，反复使用你的最佳工作流"
      ),
    },
    {
      id: "tip-search-combo",
      icon: Search,
      title: t("welcome.proTips.searchCombo.title", "搜索+分析连着用"),
      description: t(
        "welcome.proTips.searchCombo.desc",
        "一次性说清楚：搜索 5 个竞品的官网和评测，搜完了直接给我对比表。省去中间来回"
      ),
    },
    {
      id: "tip-workspace",
      icon: FolderKanban,
      title: t("welcome.proTips.workspace.title", "用工作区管理多个项目"),
      description: t(
        "welcome.proTips.workspace.desc",
        "做 A 项目时选 A 文件夹，做 B 时切换到 B。AI 生成的文件自动归位，项目越多越值钱"
      ),
    },
  ];
}

// ─── Skill → TaskExample conversion (preserved from original) ────────────────

const skillIconMap: Record<string, TaskIconId> = {
  pdf: "pdf-to-word",
  docx: "write-article",
  xlsx: "excel-analysis",
  pptx: "ppt-create",
  "frontend-design": "write-article",
  "file-organizer": "organize-downloads",
  "humanizer-zh": "polish-text",
  "video-downloader": "video-editing",
  "agent-browser": "web-scraping",
  "file-text": "pdf-to-word",
  palette: "write-article",
  table: "excel-analysis",
};

function getSkillIcon(iconOrName: string): TaskIconId {
  return skillIconMap[iconOrName.toLowerCase()] || "write-article";
}

function getSkillGradient(_category: string): string {
  // Skill 卡片使用胶囊样式，gradient 不再用于渲染，保留接口兼容
  return "";
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function NewWelcomeGuide({
  onTaskSelect,
  onLoginRequired,
}: NewWelcomeGuideProps) {
  const { t } = useTranslation();
  const setPrompt = useAppStore((state) => state.setPrompt);
  const cwd = useAppStore((state) => state.cwd);
  const setShowStartModal = useAppStore((state) => state.setShowStartModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [expandedCapability, setExpandedCapability] = useState<string | null>(
    null
  );
  const [fadeIn, setFadeIn] = useState(false);

  // 获取 skills
  const skills = useSkillStore((s) => s.skills);
  const fetchSkills = useSkillStore((s) => s.fetchSkills);
  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  // 入场动画 + 强制滚动到顶部
  useEffect(() => {
    const timer = setTimeout(() => setFadeIn(true), 50);
    // 欢迎页必须显示在顶部，覆盖聊天界面的自动滚底行为
    const scrollTimer = requestAnimationFrame(() => {
      const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) viewport.scrollTo({ top: 0, behavior: 'auto' });
    });
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(scrollTimer);
    };
  }, []);

  // 数据准备
  const capabilities = useMemo(() => getCapabilities(t), [t]);
  const quickPrompts = useMemo(() => getQuickPrompts(t), [t]);
  const proTips = useMemo(() => getProTips(t), [t]);

  // 已安装技能卡片（保留兼容性）
  const skillCards = useMemo((): TaskExample[] => {
    return skills
      .filter((skill) => skill.source === "builtin" && skill.enabled)
      .map((skill) => {
        const localizedSkillName = getSkillDisplayName(skill.name, t);
        const localizedSkillDescription = getSkillDescription(
          skill.name,
          skill.description || "",
          t
        );
        return {
          id: `skill-${skill.id}`,
          icon: getSkillIcon(skill.icon || skill.name),
          title: localizedSkillName,
          description:
            localizedSkillDescription ||
            t("welcome.skills.defaultDescription", "专业技能工具"),
          prompt: t(
            "welcome.skills.promptTemplate",
            "使用 {{skillName}} 技能帮我",
            { skillName: localizedSkillName }
          ),
          category: "preset-skills",
          gradient: getSkillGradient(skill.category),
          isSkill: true,
          skillId: skill.id,
        };
      });
  }, [skills, t]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handlePromptClick = useCallback(
    (prompt: string) => {
      if (!isAuthenticated) {
        onLoginRequired?.();
        return;
      }
      setPrompt(prompt);
      if (cwd.trim()) {
        setShowStartModal(false);
      } else {
        setShowStartModal(true);
      }
      onTaskSelect?.(prompt);
      setTimeout(() => {
        const input = document.querySelector(
          "[data-prompt-input]"
        ) as HTMLTextAreaElement;
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 100);
    },
    [
      isAuthenticated,
      setPrompt,
      cwd,
      setShowStartModal,
      onTaskSelect,
      onLoginRequired,
    ]
  );

  const handleCapabilityToggle = useCallback((id: string) => {
    setExpandedCapability((prev) => (prev === id ? null : id));
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className={`flex flex-col items-center py-6 px-4 transition-all duration-500 ${
        fadeIn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {/* ── Section 1: Hero ── */}
      <div className="text-center mb-8 max-w-lg">
        {/* App icon */}
        <div className="mb-5 inline-flex items-center justify-center">
          <div className="relative h-16 w-16 rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.15)] welcome-icon-float cursor-default">
            <img
              src={cherryIcon}
              alt="Cherry Agent"
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-[28px] font-bold font-sans text-[#141413] dark:text-white mb-3 tracking-tight leading-tight">
          {t("welcome.hero.title", "你的 AI 工作助手")}
        </h1>

        {/* Sub-headline — value proposition */}
        <p className="text-[14px] text-[#87867f] dark:text-white/50 leading-relaxed max-w-md mx-auto">
          {t(
            "welcome.hero.subtitle",
            "告诉 Cherry Agent 你想做什么，它会自动执行文件操作、数据处理、内容创作等复杂任务"
          )}
        </p>
      </div>

      {/* ── Section 2: Core Capabilities ── */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-[#ae5630]" />
          <h2 className="text-[13px] font-semibold text-[#141413] dark:text-white/80 tracking-wide uppercase">
            {t("welcome.capabilities.heading", "核心能力")}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {capabilities.map((cap, index) => {
            const Icon = cap.icon;
            const isExpanded = expandedCapability === cap.id;

            return (
              <button
                key={cap.id}
                onClick={() => handleCapabilityToggle(cap.id)}
                className={`group relative flex flex-col items-start rounded-2xl border bg-white dark:bg-white/[0.05] p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630]/50 focus-visible:ring-offset-2 ${
                  isExpanded
                    ? "border-[#ae563040] dark:border-[#ae563050] shadow-[0_2px_12px_rgba(174,86,48,0.08)]"
                    : "border-[#1414131a] dark:border-white/[0.08] hover:border-[#14141333] dark:hover:border-white/[0.14]"
                }`}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {/* Header row */}
                <div className="flex items-center gap-3 w-full mb-2">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
                    style={{ backgroundColor: `${cap.accentColor}12` }}
                  >
                    <Icon
                      className="h-[18px] w-[18px]"
                      style={{ color: cap.accentColor }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-semibold text-[#141413] dark:text-white/90 leading-snug">
                      {cap.title}
                    </h3>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 text-[#b0aea5] dark:text-white/25 shrink-0 transition-transform duration-200 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                </div>

                {/* Description */}
                <p className="text-[12px] text-[#87867f] dark:text-white/40 leading-relaxed pl-12">
                  {cap.description}
                </p>

                {/* Expanded: example list */}
                {isExpanded && (
                  <div className="mt-3 pl-12 space-y-1.5" style={{ animation: 'fadeIn 200ms ease-out' }}>
                    {cap.examples.map((ex, i) => (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePromptClick(ex);
                        }}
                        className="flex items-center gap-2 w-full text-left group/ex rounded-lg px-2.5 py-1.5 -ml-2.5 transition-colors hover:bg-[#f0eee6] dark:hover:bg-white/[0.06]"
                      >
                        <ArrowRight className="h-3 w-3 text-[#b0aea5] dark:text-white/25 shrink-0 group-hover/ex:text-[#ae5630] transition-colors" />
                        <span className="text-[12px] text-[#5e5d59] dark:text-white/55 group-hover/ex:text-[#141413] dark:group-hover/ex:text-white/80 transition-colors">
                          {ex}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: Quick Start Prompts ── */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center gap-2 mb-4">
          <ArrowRight className="h-4 w-4 text-[#ae5630]" />
          <h2 className="text-[13px] font-semibold text-[#141413] dark:text-white/80 tracking-wide uppercase">
            {t("welcome.quickStart.heading", "快速开始")}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {quickPrompts.map((qp) => {
            const IconComponent = TaskIconMap[qp.icon];

            return (
              <button
                key={qp.id}
                onClick={() => handlePromptClick(qp.prompt)}
                className="group relative flex items-start gap-3 rounded-2xl border border-[#1414131a] dark:border-white/[0.08] bg-white dark:bg-white/[0.05] p-4 text-left transition-all duration-200 hover:border-[#14141333] dark:hover:border-white/[0.14] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae5630]/50 focus-visible:ring-offset-2"
              >
                {/* Icon */}
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1414130d] dark:bg-white/[0.1] shrink-0">
                  <IconComponent className="h-[18px] w-[18px] text-[#141413]/55 dark:text-white/65" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-semibold text-[#141413] dark:text-white/90 leading-snug mb-1">
                    {qp.label}
                  </h3>
                  {/* AI preview — shows what will happen */}
                  <p className="text-[12px] text-[#b0aea5] dark:text-white/30 leading-relaxed italic">
                    {qp.preview}
                  </p>
                </div>

                {/* Arrow indicator — pure CSS hover */}
                <div className="absolute top-4 right-4 opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                  <ArrowRight className="h-4 w-4 text-[#ae5630]" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Section 3.5: Installed Skills (if any) ── */}
      {skillCards.length > 0 && (
        <div className="w-full max-w-2xl mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-[#ae5630]" />
            <h2 className="text-[13px] font-semibold text-[#141413] dark:text-white/80 tracking-wide uppercase">
              {t("welcome.skills.heading", "已安装技能")}
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {skillCards.map((skill) => {
              const IconComponent = TaskIconMap[skill.icon];
              return (
                <button
                  key={skill.id}
                  onClick={() => handlePromptClick(skill.prompt)}
                  className="flex items-center gap-2 rounded-full border border-[#1414131a] dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3.5 py-2 text-left transition-all duration-200 hover:border-[#14141333] dark:hover:border-white/[0.14] hover:shadow-[0_1px_4px_rgba(0,0,0,0.04)] active:scale-[0.98]"
                >
                  <IconComponent className="h-4 w-4 text-[#141413]/50 dark:text-white/50" />
                  <span className="text-[12px] font-medium text-[#141413] dark:text-white/75">
                    {skill.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 4: Pro Tips ── */}
      <div className="w-full max-w-2xl mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="h-4 w-4 text-[#ae5630]" />
          <h2 className="text-[13px] font-semibold text-[#141413] dark:text-white/80 tracking-wide uppercase">
            {t("welcome.proTips.heading", "进阶技巧")}
          </h2>
        </div>

        <div className="space-y-2.5">
          {proTips.map((tip) => {
            const TipIcon = tip.icon;
            return (
              <div
                key={tip.id}
                className="flex items-start gap-3.5 rounded-2xl border border-[#1414130d] dark:border-white/[0.05] bg-white dark:bg-white/[0.03] px-4 py-3.5 transition-colors hover:bg-[#faf9f5] dark:hover:bg-white/[0.05]"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ae563008] dark:bg-[#ae563020] shrink-0 mt-0.5">
                  <TipIcon className="h-4 w-4 text-[#ae5630]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-semibold text-[#141413] dark:text-white/85 leading-snug mb-0.5">
                    {tip.title}
                  </h4>
                  <p className="text-[12px] text-[#87867f] dark:text-white/40 leading-relaxed">
                    {tip.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 5: Login Prompt (unauthenticated) ── */}
      {!isAuthenticated && (
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl border border-[#ae563020] dark:border-[#ae563030] bg-[#ae56300a] dark:bg-[#ae563015] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ae563015] dark:bg-[#ae563025] flex-shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-[#ae5630]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
              </div>
              <div className="flex-1 space-y-0.5">
                <p className="text-[13px] font-medium text-[#141413] dark:text-white/85">
                  {t("welcome.loginPrompt.title", "登录后开始使用")}
                </p>
                <p className="text-[12px] text-[#87867f] dark:text-white/40">
                  {t(
                    "welcome.loginPrompt.description",
                    "点击任意任务卡片将引导你完成登录"
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
