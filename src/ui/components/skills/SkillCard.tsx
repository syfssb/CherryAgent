import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { getSkillDisplayName, getSkillDescription } from '../../utils/skillI18n';
import { cn } from '@/ui/lib/utils';
import {
  type Skill,
  type SkillCategory,
  type SkillSource,
  getCategoryLabel,
  getSourceLabel,
} from '@/ui/store/useSkillStore';

// ============================================================================
// Props
// ============================================================================

export interface SkillCardProps {
  skill: Skill;
  onClick?: () => void;
  onToggle?: () => void;
  onApply?: () => void;
  toggling?: boolean;
  className?: string;
}

// ============================================================================
// Category color system
// ============================================================================

interface CategoryColor {
  iconBg: string;
  iconColor: string;
  dot: string;
}

const CATEGORY_COLORS: Record<SkillCategory, CategoryColor> = {
  development: {
    iconBg: 'rgba(59, 130, 246, 0.08)',
    iconColor: 'rgb(59, 130, 246)',
    dot: 'rgb(59, 130, 246)',
  },
  writing: {
    iconBg: 'rgba(139, 92, 246, 0.08)',
    iconColor: 'rgb(139, 92, 246)',
    dot: 'rgb(139, 92, 246)',
  },
  analysis: {
    iconBg: 'rgba(6, 182, 212, 0.08)',
    iconColor: 'rgb(6, 182, 212)',
    dot: 'rgb(6, 182, 212)',
  },
  automation: {
    iconBg: 'rgba(217, 119, 87, 0.08)',
    iconColor: 'rgb(217, 119, 87)',
    dot: 'rgb(217, 119, 87)',
  },
  communication: {
    iconBg: 'rgba(16, 185, 129, 0.08)',
    iconColor: 'rgb(16, 185, 129)',
    dot: 'rgb(16, 185, 129)',
  },
  other: {
    iconBg: 'rgba(107, 114, 128, 0.08)',
    iconColor: 'rgb(107, 114, 128)',
    dot: 'rgb(107, 114, 128)',
  },
};

function getCategoryColor(category: SkillCategory): CategoryColor {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
}

const SOURCE_DOT_COLORS: Record<SkillSource, string> = {
  builtin: 'rgb(217, 119, 87)',
  custom: 'rgb(245, 158, 11)',
  imported: 'rgb(16, 185, 129)',
};

// ============================================================================
// Icons (SVG components)
// ============================================================================

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}

function MessageCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function RefreshCwIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function CheckSquareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function BugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m8 2 1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  );
}

function RepeatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function PenToolIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z" />
      <path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18" />
      <path d="m2.3 2.3 7.286 7.286" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </svg>
  );
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <rect width="6" height="6" x="9" y="9" rx="1" />
      <path d="M15 2v2" /><path d="M15 20v2" />
      <path d="M2 15h2" /><path d="M2 9h2" />
      <path d="M20 15h2" /><path d="M20 9h2" />
      <path d="M9 2v2" /><path d="M9 20v2" />
    </svg>
  );
}

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

function BoxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function BookmarkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function PresentationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h20" /><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
      <path d="m7 21 5-5 5 5" />
    </svg>
  );
}

function TableIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" /><rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" /><path d="M3 15h18" />
    </svg>
  );
}

// ============================================================================
// Icon map
// ============================================================================

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  'code': CodeIcon,
  'file-text': FileTextIcon,
  'message-circle': MessageCircleIcon,
  'zap': ZapIcon,
  'refresh-cw': RefreshCwIcon,
  'check-square': CheckSquareIcon,
  'bug': BugIcon,
  'repeat': RepeatIcon,
  'pen-tool': PenToolIcon,
  'bar-chart-2': BarChartIcon,
  'cpu': CpuIcon,
  'palette': PaletteIcon,
  'box': BoxIcon,
  'terminal': TerminalIcon,
  'database': DatabaseIcon,
  'globe': GlobeIcon,
  'lock': LockIcon,
  'settings': SettingsIcon,
  'star': StarIcon,
  'heart': HeartIcon,
  'bookmark': BookmarkIcon,
  'folder': FolderIcon,
  'download': DownloadIcon,
  'presentation': PresentationIcon,
  'table': TableIcon,
};

export function getSkillIcon(iconName: string): React.FC<{ className?: string }> {
  return iconMap[iconName] ?? BoxIcon;
}

// ============================================================================
// Toggle Switch
// ============================================================================

function Toggle({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onCheckedChange();
      }}
      className={cn(
        'relative inline-flex h-[22px] w-[40px] flex-shrink-0 cursor-pointer rounded-full',
        'transition-all duration-300 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2',
        checked
          ? 'bg-accent shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]'
          : 'bg-ink-400/25',
        disabled && 'cursor-not-allowed opacity-40'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white',
          'shadow-sm ring-0 transition-transform duration-300 ease-out mt-[2px]',
          checked ? 'translate-x-[20px] ml-0' : 'translate-x-[2px]'
        )}
      />
    </button>
  );
}

// ============================================================================
// SkillCard
// ============================================================================

export function SkillCard({
  skill,
  onClick,
  onToggle,
  onApply,
  toggling,
  className,
}: SkillCardProps) {
  const { t } = useTranslation();
  const IconComponent = getSkillIcon(skill.icon ?? 'box');
  const catColor = getCategoryColor(skill.category);
  const sourceDotColor = SOURCE_DOT_COLORS[skill.source] ?? SOURCE_DOT_COLORS.builtin;

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-surface cursor-pointer',
        'transition-all duration-300 ease-out',
        'border-ink-400/12',
        'hover:border-accent/25 hover:shadow-elevated hover:-translate-y-[2px]',
        !skill.enabled && 'opacity-45 grayscale hover:opacity-60 hover:grayscale-[50%]',
        className
      )}
      onClick={onClick}
    >
      {/* Header: icon + toggle */}
      <div className="flex items-start justify-between p-4 pb-0">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105 [&>svg]:text-[var(--icon-color)]"
          style={{ backgroundColor: catColor.iconBg, '--icon-color': catColor.iconColor } as React.CSSProperties}
        >
          <IconComponent className="h-5 w-5" />
        </div>
        <Toggle
          checked={skill.enabled}
          onCheckedChange={() => onToggle?.()}
          disabled={toggling}
        />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-3 pb-4">
        <h3 className="font-semibold text-[15px] leading-tight text-ink-900 truncate mb-1.5">
          {getSkillDisplayName(skill.name, t)}
        </h3>
        <p className="text-[13px] leading-[1.5] text-muted line-clamp-2 min-h-[40px]">
          {getSkillDescription(skill.name, skill.description, t)}
        </p>
      </div>

      {/* Footer: source + category + apply button */}
      <div className="flex items-center justify-between px-4 pb-3.5">
        <div className="flex items-center gap-1.5 text-[12px] text-ink-500">
          <span
            className="w-[6px] h-[6px] rounded-full flex-shrink-0"
            style={{ backgroundColor: sourceDotColor }}
          />
          <span>{getSourceLabel(skill.source, t)}</span>
          <span className="text-ink-400/40 mx-0.5">/</span>
          <span>{getCategoryLabel(skill.category, t)}</span>
        </div>
        {onApply && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onApply(); }}
            className="text-[11px] font-medium text-accent hover:text-accent-hover px-2 py-0.5 rounded-md hover:bg-accent/8 transition-colors shrink-0"
          >
            {t('skill.applySkill', '应用')}
          </button>
        )}
      </div>
    </div>
  );
}

export default SkillCard;
