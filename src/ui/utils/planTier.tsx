/**
 * 套餐等级工具 — 从套餐名推断等级、清理名称、渲染等级图标
 *
 * 复用于：RechargeModal, UserMenu, BalanceDisplay, ActivePeriodCard, PeriodCardSection
 */

/** 清理套餐名中的 emoji */
export function cleanPlanName(name: string): string {
  return name.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
}

/** 从套餐名推断等级 */
export function inferPlanTier(name: string): 'max' | 'pro' | 'plus' | 'basic' {
  const lower = name.toLowerCase();
  if (lower.includes('max') || lower.includes('ultimate') || lower.includes('enterprise')) return 'max';
  if (lower.includes('pro') || lower.includes('premium') || lower.includes('professional')) return 'pro';
  if (lower.includes('plus') || lower.includes('standard') || lower.includes('starter')) return 'plus';
  const crownCount = (name.match(/👑/g) || []).length;
  if (crownCount >= 3) return 'max';
  if (crownCount >= 2) return 'pro';
  if (crownCount >= 1) return 'plus';
  return 'basic';
}

/**
 * 套餐等级图标 — 游戏化段位设计
 * Max: 皇冠+宝石  Pro: 盾牌+星  Plus: 徽章+箭头  Basic: 圆环
 */
export function PlanTierIcon({ tier, className }: { tier: 'max' | 'pro' | 'plus' | 'basic'; className?: string }) {
  const size = className || 'w-5 h-5';

  if (tier === 'max') {
    return (
      <svg className={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="11" fill="#B8860B" fillOpacity="0.1" />
        <path d="M3.5 16L5 8L8.5 11L12 5L15.5 11L19 8L20.5 16H3.5Z" fill="#B8860B" />
        <path d="M4.5 15L5.5 9.5L8.5 12L12 6.5L15.5 12L18.5 9.5L19.5 15H4.5Z" fill="#D4A017" fillOpacity="0.55" />
        <circle cx="12" cy="12.5" r="2" fill="#ae5630" />
        <circle cx="11.3" cy="11.8" r="0.7" fill="white" fillOpacity="0.6" />
        <rect x="4" y="16" width="16" height="2.5" rx="1.25" fill="#B8860B" />
        <rect x="4" y="16" width="16" height="1.2" rx="0.6" fill="#D4A017" fillOpacity="0.45" />
      </svg>
    );
  }

  if (tier === 'pro') {
    return (
      <svg className={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 1.5L3.5 5.5V11.5C3.5 17 7.2 21.2 12 22.5C16.8 21.2 20.5 17 20.5 11.5V5.5L12 1.5Z" className="fill-[#ae5630] dark:fill-[#d97757]" fillOpacity="0.1" />
        <path d="M12 3L5 6.5V11.5C5 16 8 19.5 12 20.8C16 19.5 19 16 19 11.5V6.5L12 3Z" className="fill-[#ae5630] dark:fill-[#d97757]" />
        <path d="M12 3L5 6.5V9L12 6L19 9V6.5L12 3Z" className="fill-[#c4633a] dark:fill-[#e08a60]" fillOpacity="0.7" />
        <path d="M12 7.5L13.4 10.7L16.8 11.1L14.3 13.4L14.9 16.8L12 15.2L9.1 16.8L9.7 13.4L7.2 11.1L10.6 10.7L12 7.5Z" fill="white" fillOpacity="0.92" />
      </svg>
    );
  }

  if (tier === 'plus') {
    return (
      <svg className={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 3L19 7.5V16.5L12 21L5 16.5V7.5L12 3Z" fill="#c9956b" />
        <path d="M12 3L19 7.5V10L12 5.5L5 10V7.5L12 3Z" fill="#d4a87d" fillOpacity="0.6" />
        <path d="M12 8L16 13H13.5V17H10.5V13H8L12 8Z" fill="white" fillOpacity="0.9" />
      </svg>
    );
  }

  return (
    <svg className={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="#b0aea5" strokeWidth="1.5" fill="#b0aea5" fillOpacity="0.08" />
      <circle cx="12" cy="12" r="3" fill="#b0aea5" fillOpacity="0.5" />
    </svg>
  );
}
