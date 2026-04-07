import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Play,
  Settings,
  Coins,
  Users,
  Keyboard,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Check,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Step {
  title: string;
  description: string;
  tip?: string;
  screenshot: string;
}

interface Chapter {
  id: string;
  icon: React.ElementType;
  label: string;
  num: string;
  title: string;
  subtitle: string;
  steps: Step[];
}

interface ShortcutGroup {
  group: string;
  items: { key: string; desc: string }[];
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function ShortcutsLayout({ shortcuts }: { shortcuts: ShortcutGroup[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {shortcuts.map((group, gi) => (
        <motion.div
          key={group.group}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: gi * 0.08, duration: 0.4 }}
          className="bg-white dark:bg-carbon-850 border border-gray-200 dark:border-carbon-700 rounded-2xl p-6 hover:border-gray-300 dark:hover:border-carbon-600 transition-colors"
        >
          <p className="text-[10px] font-mono text-accent-green uppercase tracking-[0.18em] mb-5">
            {group.group}
          </p>
          <div className="space-y-3.5">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600 dark:text-sage-300">{item.desc}</span>
                <kbd className="shrink-0 px-2.5 py-1 bg-gray-100 dark:bg-carbon-900 border border-gray-200 dark:border-carbon-600 rounded-lg text-[11px] text-gray-500 dark:text-sage-300 font-mono whitespace-nowrap shadow-inner">
                  {item.key}
                </kbd>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

interface ScreenshotPanelProps {
  step: Step;
  totalSteps: number;
  activeStep: number;
  animKey: string;
}

function ScreenshotPanel({ step, totalSteps, activeStep, animKey }: ScreenshotPanelProps) {
  return (
    <div className="relative">
      {/* Green ambient glow */}
      <div className="absolute -inset-6 bg-accent-green/8 blur-3xl rounded-3xl pointer-events-none" />

      <AnimatePresence mode="wait">
        <motion.div
          key={animKey}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="relative bg-white dark:bg-carbon-850 rounded-2xl border border-gray-200 dark:border-carbon-700 overflow-hidden shadow-xl"
        >
          {/* macOS window chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 dark:bg-carbon-900 border-b border-gray-200 dark:border-carbon-700">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
            <span className="ml-3 text-xs text-gray-400 dark:text-sage-500 font-mono">Cherry Agent</span>
          </div>
          <img
            src={step.screenshot}
            alt={step.title}
            className="w-full h-auto block"
            loading="lazy"
          />
        </motion.div>
      </AnimatePresence>

      {/* Step progress dots */}
      {totalSteps > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === activeStep
                  ? 'w-5 h-1.5 bg-accent-green'
                  : i < activeStep
                  ? 'w-1.5 h-1.5 bg-accent-green/40'
                  : 'w-1.5 h-1.5 bg-gray-300 dark:bg-carbon-600'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export default function UserGuide() {
  const { t } = useTranslation();
  const [activeChapter, setActiveChapter] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  const CHAPTERS: Chapter[] = [
    {
      id: 'what',
      icon: BookOpen,
      label: t('userGuide.chapters.what.label'),
      num: t('userGuide.chapters.what.num'),
      title: t('userGuide.chapters.what.title'),
      subtitle: t('userGuide.chapters.what.subtitle'),
      steps: [
        {
          title: t('userGuide.chapters.what.steps.s1.title'),
          description: t('userGuide.chapters.what.steps.s1.description'),
          screenshot: '/guide/guide-main.png',
        },
        {
          title: t('userGuide.chapters.what.steps.s2.title'),
          description: t('userGuide.chapters.what.steps.s2.description'),
          screenshot: '/guide/guide-main.png',
        },
      ],
    },
    {
      id: 'first-task',
      icon: Play,
      label: t('userGuide.chapters.firstTask.label'),
      num: t('userGuide.chapters.firstTask.num'),
      title: t('userGuide.chapters.firstTask.title'),
      subtitle: t('userGuide.chapters.firstTask.subtitle'),
      steps: [
        {
          title: t('userGuide.chapters.firstTask.steps.s1.title'),
          description: t('userGuide.chapters.firstTask.steps.s1.description'),
          screenshot: '/guide/guide-main.png',
        },
        {
          title: t('userGuide.chapters.firstTask.steps.s2.title'),
          description: t('userGuide.chapters.firstTask.steps.s2.description'),
          screenshot: '/guide/guide-main.png',
        },
        {
          title: t('userGuide.chapters.firstTask.steps.s3.title'),
          description: t('userGuide.chapters.firstTask.steps.s3.description'),
          tip: t('userGuide.chapters.firstTask.steps.s3.tip'),
          screenshot: '/guide/guide-new-session.png',
        },
        {
          title: t('userGuide.chapters.firstTask.steps.s4.title'),
          description: t('userGuide.chapters.firstTask.steps.s4.description'),
          screenshot: '/guide/guide-new-session.png',
        },
        {
          title: t('userGuide.chapters.firstTask.steps.s5.title'),
          description: t('userGuide.chapters.firstTask.steps.s5.description'),
          screenshot: '/guide/guide-conversation.png',
        },
      ],
    },
    {
      id: 'settings',
      icon: Settings,
      label: t('userGuide.chapters.settings.label'),
      num: t('userGuide.chapters.settings.num'),
      title: t('userGuide.chapters.settings.title'),
      subtitle: t('userGuide.chapters.settings.subtitle'),
      steps: [
        {
          title: t('userGuide.chapters.settings.steps.s1.title'),
          description: t('userGuide.chapters.settings.steps.s1.description'),
          screenshot: '/guide/guide-settings-memory.png',
        },
        {
          title: t('userGuide.chapters.settings.steps.s2.title'),
          description: t('userGuide.chapters.settings.steps.s2.description'),
          screenshot: '/guide/guide-settings-skills.png',
        },
        {
          title: t('userGuide.chapters.settings.steps.s3.title'),
          description: t('userGuide.chapters.settings.steps.s3.description'),
          screenshot: '/guide/guide-settings-appearance.png',
        },
        {
          title: t('userGuide.chapters.settings.steps.s4.title'),
          description: t('userGuide.chapters.settings.steps.s4.description'),
          screenshot: '/guide/guide-settings-sync.png',
        },
      ],
    },
    {
      id: 'billing',
      icon: Coins,
      label: t('userGuide.chapters.billing.label'),
      num: t('userGuide.chapters.billing.num'),
      title: t('userGuide.chapters.billing.title'),
      subtitle: t('userGuide.chapters.billing.subtitle'),
      steps: [
        {
          title: t('userGuide.chapters.billing.steps.s1.title'),
          description: t('userGuide.chapters.billing.steps.s1.description'),
          screenshot: '/guide/guide-billing-plans.png',
        },
        {
          title: t('userGuide.chapters.billing.steps.s2.title'),
          description: t('userGuide.chapters.billing.steps.s2.description'),
          screenshot: '/guide/guide-checkin.png',
        },
        {
          title: t('userGuide.chapters.billing.steps.s3.title'),
          description: t('userGuide.chapters.billing.steps.s3.description'),
          screenshot: '/guide/guide-billing-plans.png',
        },
        {
          title: t('userGuide.chapters.billing.steps.s4.title'),
          description: t('userGuide.chapters.billing.steps.s4.description'),
          screenshot: '/guide/guide-billing-points.png',
        },
      ],
    },
    {
      id: 'referral',
      icon: Users,
      label: t('userGuide.chapters.referral.label'),
      num: t('userGuide.chapters.referral.num'),
      title: t('userGuide.chapters.referral.title'),
      subtitle: t('userGuide.chapters.referral.subtitle'),
      steps: [
        {
          title: t('userGuide.chapters.referral.steps.s1.title'),
          description: t('userGuide.chapters.referral.steps.s1.description'),
          screenshot: '/guide/guide-referral.png',
        },
        {
          title: t('userGuide.chapters.referral.steps.s2.title'),
          description: t('userGuide.chapters.referral.steps.s2.description'),
          screenshot: '/guide/guide-referral.png',
        },
      ],
    },
    {
      id: 'shortcuts',
      icon: Keyboard,
      label: t('userGuide.chapters.shortcuts.label'),
      num: t('userGuide.chapters.shortcuts.num'),
      title: t('userGuide.chapters.shortcuts.title'),
      subtitle: t('userGuide.chapters.shortcuts.subtitle'),
      steps: [],
    },
  ];

  const SHORTCUTS: ShortcutGroup[] = [
    {
      group: t('userGuide.shortcutGroups.navigation.title'),
      items: [
        { key: '⌘ 1', desc: t('userGuide.shortcutGroups.navigation.items.chat') },
        { key: '⌘ 2', desc: t('userGuide.shortcutGroups.navigation.items.skills') },
        { key: '⌘ 3', desc: t('userGuide.shortcutGroups.navigation.items.memory') },
        { key: '⌘ 4', desc: t('userGuide.shortcutGroups.navigation.items.usage') },
        { key: '⌘ 5', desc: t('userGuide.shortcutGroups.navigation.items.settings') },
      ],
    },
    {
      group: t('userGuide.shortcutGroups.session.title'),
      items: [
        { key: '⌘ N', desc: t('userGuide.shortcutGroups.session.items.new') },
        { key: '⌘ [', desc: t('userGuide.shortcutGroups.session.items.prev') },
        { key: '⌘ ]', desc: t('userGuide.shortcutGroups.session.items.next') },
        { key: '⌘ W', desc: t('userGuide.shortcutGroups.session.items.close') },
      ],
    },
    {
      group: t('userGuide.shortcutGroups.input.title'),
      items: [
        { key: 'Enter', desc: t('userGuide.shortcutGroups.input.items.send') },
        { key: 'Shift + Enter', desc: t('userGuide.shortcutGroups.input.items.newline') },
        { key: '⌘ V', desc: t('userGuide.shortcutGroups.input.items.paste') },
      ],
    },
  ];

  const chapter = CHAPTERS[activeChapter];
  const step = chapter.steps[activeStep];

  const handleChapterChange = (index: number) => {
    setActiveChapter(index);
    setActiveStep(0);
  };

  return (
    <section id="user-guide" className="py-20 md:py-32">
      <div className="max-w-7xl mx-auto px-6">

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <p className="text-[11px] font-mono text-accent-green uppercase tracking-[0.22em] mb-4">
            {t('userGuide.sectionLabel')}
          </p>
          <h2 className="text-2xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {t('userGuide.title')}
          </h2>
          <p className="text-gray-500 dark:text-sage-400 max-w-md mx-auto text-sm leading-relaxed">
            {t('userGuide.subtitle')}
          </p>
        </motion.div>

        {/* Chapter tab bar — sliding pill */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex justify-center mb-10"
        >
          <div className="relative flex p-1 bg-gray-100 dark:bg-carbon-900 border border-gray-200 dark:border-carbon-700 rounded-2xl overflow-x-auto max-w-full">
            {CHAPTERS.map((ch, i) => {
              const Icon = ch.icon;
              const isActive = activeChapter === i;
              return (
                <button
                  key={ch.id}
                  onClick={() => handleChapterChange(i)}
                  className="relative z-10 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors duration-200"
                >
                  {/* Sliding background pill */}
                  {isActive && (
                    <motion.div
                      layoutId="chapter-tab-pill"
                      className="absolute inset-0 bg-accent-green rounded-xl"
                      transition={{ type: 'spring', bounce: 0.18, duration: 0.5 }}
                    />
                  )}
                  <Icon
                    size={13}
                    className={`relative z-10 transition-colors ${
                      isActive ? 'text-[#0F0F0F]' : 'text-gray-400 dark:text-sage-500'
                    }`}
                  />
                  <span
                    className={`relative z-10 transition-colors ${
                      isActive
                        ? 'text-[#0F0F0F] font-semibold'
                        : 'text-gray-600 dark:text-sage-400'
                    }`}
                  >
                    {ch.label}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Chapter content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeChapter}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Chapter header with large decorative number */}
            <div className="relative mb-10 pl-1">
              <span
                className="absolute -top-3 -left-2 text-[80px] md:text-[100px] font-black leading-none select-none pointer-events-none text-gray-200 dark:text-carbon-700"
                style={{ opacity: 0.6 }}
              >
                {chapter.num}
              </span>
              <div className="relative">
                <p className="text-[10px] font-mono text-accent-green uppercase tracking-[0.2em] mb-2">
                  {chapter.label}
                </p>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                  {chapter.title}
                </h3>
                <p className="text-gray-500 dark:text-sage-400 mt-1.5 text-sm">{chapter.subtitle}</p>
              </div>
            </div>

            {/* Shortcuts: special layout */}
            {chapter.id === 'shortcuts' ? (
              <ShortcutsLayout shortcuts={SHORTCUTS} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-start">

                {/* Left: step timeline */}
                <div className="lg:col-span-2">
                  <div className="relative">
                    {/* Vertical connector line */}
                    {chapter.steps.length > 1 && (
                      <div className="absolute left-3 top-5 bottom-5 w-px bg-gradient-to-b from-gray-300 dark:from-carbon-600 via-gray-200 dark:via-carbon-700 to-transparent" />
                    )}

                    <div className="space-y-1">
                      {chapter.steps.map((s, i) => {
                        const isActive = activeStep === i;
                        const isDone = i < activeStep;
                        return (
                          <button
                            key={i}
                            onClick={() => setActiveStep(i)}
                            className="relative w-full text-left group"
                          >
                            <div className="flex items-start gap-4 py-1.5">
                              {/* Circle badge */}
                              <span
                                className={`relative z-10 shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all duration-200 mt-1.5 ${
                                  isActive
                                    ? 'bg-accent-green border-accent-green text-[#0F0F0F] shadow-[0_0_12px_rgba(127,176,105,0.4)]'
                                    : isDone
                                    ? 'bg-accent-green/20 border-accent-green/50 text-accent-green'
                                    : 'bg-white dark:bg-carbon-900 border-gray-300 dark:border-carbon-600 text-gray-400 dark:text-sage-500 group-hover:border-gray-400 dark:group-hover:border-carbon-500'
                                }`}
                              >
                                {isDone ? <Check size={10} /> : i + 1}
                              </span>

                              {/* Content card */}
                              <div
                                className={`flex-1 min-w-0 p-3.5 rounded-xl border transition-all duration-200 ${
                                  isActive
                                    ? 'bg-white dark:bg-carbon-850 border-accent-green/40 shadow-sm'
                                    : 'bg-gray-50/60 dark:bg-carbon-900/50 border-transparent group-hover:border-gray-200 dark:group-hover:border-carbon-700 group-hover:bg-gray-50 dark:group-hover:bg-carbon-900'
                                }`}
                              >
                                <p
                                  className={`font-medium text-sm leading-snug transition-colors ${
                                    isActive
                                      ? 'text-gray-900 dark:text-white'
                                      : isDone
                                      ? 'text-gray-400 dark:text-sage-400 line-through decoration-gray-300 dark:decoration-carbon-600'
                                      : 'text-gray-700 dark:text-sage-300 group-hover:text-gray-900 dark:group-hover:text-white'
                                  }`}
                                >
                                  {s.title}
                                </p>

                                {/* Expanded content */}
                                {isActive && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                                    className="overflow-hidden"
                                  >
                                    <p className="mt-2.5 text-sm text-gray-600 dark:text-sage-400 leading-relaxed whitespace-pre-line">
                                      {s.description}
                                    </p>

                                    {/* Tip callout */}
                                    {s.tip && (
                                      <div className="mt-3.5 flex gap-2.5 p-3 bg-accent-green/8 border border-accent-green/25 rounded-xl">
                                        <AlertCircle
                                          size={13}
                                          className="text-accent-green shrink-0 mt-0.5"
                                        />
                                        <p className="text-xs text-accent-green/90 leading-relaxed">
                                          {s.tip}
                                        </p>
                                      </div>
                                    )}

                                    {/* Next step CTA */}
                                    {activeStep < chapter.steps.length - 1 && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveStep(activeStep + 1);
                                        }}
                                        className="mt-4 flex items-center gap-1 text-xs text-gray-400 dark:text-sage-500 hover:text-accent-green transition-colors"
                                      >
                                        {t('userGuide.nextStep')}
                                        <ChevronRight size={12} />
                                      </button>
                                    )}
                                  </motion.div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right: screenshot with glow + progress */}
                {step && (
                  <div className="lg:col-span-3">
                    <ScreenshotPanel
                      step={step}
                      totalSteps={chapter.steps.length}
                      activeStep={activeStep}
                      animKey={step.screenshot}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Chapter prev / next navigation ── */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-gray-200 dark:border-carbon-700">
              <button
                onClick={() => handleChapterChange(activeChapter - 1)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeChapter === 0
                    ? 'invisible'
                    : 'text-gray-600 dark:text-sage-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-carbon-900'
                }`}
              >
                <ChevronLeft size={15} />
                {activeChapter > 0 && CHAPTERS[activeChapter - 1].label}
              </button>

              {/* Chapter dots */}
              <div className="flex items-center gap-1.5">
                {CHAPTERS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => handleChapterChange(i)}
                    className={`rounded-full transition-all duration-300 ${
                      i === activeChapter
                        ? 'w-5 h-1.5 bg-accent-green'
                        : 'w-1.5 h-1.5 bg-gray-300 dark:bg-carbon-600 hover:bg-gray-400 dark:hover:bg-carbon-500'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={() => handleChapterChange(activeChapter + 1)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeChapter === CHAPTERS.length - 1
                    ? 'invisible'
                    : 'text-gray-600 dark:text-sage-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-carbon-900'
                }`}
              >
                {activeChapter < CHAPTERS.length - 1 && CHAPTERS[activeChapter + 1].label}
                <ChevronRight size={15} />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
