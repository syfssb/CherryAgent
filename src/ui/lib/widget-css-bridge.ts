/**
 * CSS 变量桥接 — Anthropic 设计系统 → widget iframe 内样式
 *
 * 设计原则（来自 Anthropic UI Skill）：
 * 1. 暖象牙色调，永远不用纯白/纯黑
 * 2. 边框使用透明度叠加（10%/20%），不用实色灰
 * 3. 三层微阴影（1.2%/2%/4% 不透明度）
 * 4. 内容文本用衬线体（Lora），UI 标签用无衬线体（DM Sans）
 * 5. 装饰色来自自然材质：Clay, Olive, Sky, Coral, Heather, Oat
 */

// ── 变量桥接 ──────────────────────────────────────────────────────────────────

export const WIDGET_CSS_BRIDGE = /* css */ `
/* ── Backgrounds (warm ivory, never pure white) ── */
--color-background-primary:   var(--color-surface, #ffffff);
--color-background-secondary: var(--color-surface-secondary, #f0eee6);
--color-background-tertiary:  var(--color-surface-tertiary, #e8e6dc);
--color-background-page:      var(--color-surface-cream, #faf9f5);

/* ── Text (warm near-black, never #000) ── */
--color-text-primary:         var(--color-ink-900, #141413);
--color-text-secondary:       var(--color-ink-600, #5e5d59);
--color-text-muted:           var(--color-muted, #87867f);
--color-text-subtle:          var(--color-muted-light, #b0aea5);

/* ── Borders (transparent overlays, never solid grays) ── */
--color-border-default:       rgba(20, 20, 19, 0.10);
--color-border-hover:         rgba(20, 20, 19, 0.20);
--color-border-tertiary:      rgba(20, 20, 19, 0.10);
--color-border-secondary:     rgba(20, 20, 19, 0.15);
--color-border-primary:       rgba(20, 20, 19, 0.30);

/* ── Accent (Anthropic product orange — constant across modes) ── */
--color-accent:               #ae5630;
--color-accent-hover:         #c4633a;
--color-cta:                  #c6613f;
--color-clay:                 #d97757;

/* ── Typography (serif for content, sans for UI) ── */
--font-serif: 'Lora', Georgia, Cambria, 'Times New Roman', serif;
--font-sans:  'DM Sans', 'Inter', system-ui, -apple-system, sans-serif;
--font-mono:  'JetBrains Mono', 'Fira Code', monospace;

/* ── Layout ── */
--radius-sm:  4px;
--radius-md:  8px;
--radius-lg:  16px;
--radius-full: 9999px;
--border-radius-md: 8px;
--border-radius-lg: 16px;

/* ── Shadows (three-layer micro-shadow — barely visible) ── */
--shadow-card: 0 2px 2px rgba(0,0,0,0.012), 0 4px 4px rgba(0,0,0,0.02), 0 16px 24px rgba(0,0,0,0.04);
--shadow-sm: 0 1px 3px rgba(0,0,0,0.08);

/* ── Anthropic decorative palette ── */
--color-clay:      #d97757;
--color-olive:     #788c5d;
--color-sky:       #6a9bcc;
--color-coral:     #ebcece;
--color-fig:       #c46686;
--color-heather:   #cbcadb;
--color-kraft:     #d4a27f;
--color-oat:       #e3dacc;
--color-cactus:    #bcd1ca;
--color-manilla:   #ebdbbc;

/* ── Chart palette (Anthropic decorative colors) ── */
--color-chart-1: #d97757;
--color-chart-2: #788c5d;
--color-chart-3: #6a9bcc;
--color-chart-4: #d4a27f;
--color-chart-5: #c46686;
--color-chart-6: #cbcadb;
`;

// ── 工具类 ────────────────────────────────────────────────────────────────────

const WIDGET_UTILITIES = /* css */ `
/* ── Layout ── */
.hidden { display: none; }
.block { display: block; }
.inline-block { display: inline-block; }
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.grid { display: grid; }
.flex-col { flex-direction: column; }
.flex-row { flex-direction: row; }
.flex-wrap { flex-wrap: wrap; }
.flex-1 { flex: 1 1 0%; }
.flex-none { flex: none; }
.shrink-0 { flex-shrink: 0; }
.grow { flex-grow: 1; }
.items-start { align-items: flex-start; }
.items-center { align-items: center; }
.items-end { align-items: flex-end; }
.justify-start { justify-content: flex-start; }
.justify-center { justify-content: center; }
.justify-end { justify-content: flex-end; }
.justify-between { justify-content: space-between; }
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.col-span-2 { grid-column: span 2; }
.col-span-full { grid-column: 1 / -1; }

/* ── Spacing ── */
.gap-1 { gap: 4px; } .gap-2 { gap: 8px; } .gap-3 { gap: 12px; }
.gap-4 { gap: 16px; } .gap-5 { gap: 20px; } .gap-6 { gap: 24px; } .gap-8 { gap: 32px; }
.m-0 { margin: 0; } .m-1 { margin: 4px; } .m-2 { margin: 8px; } .m-4 { margin: 16px; }
.mx-auto { margin-left: auto; margin-right: auto; }
.mt-1 { margin-top: 4px; } .mt-2 { margin-top: 8px; } .mt-3 { margin-top: 12px; } .mt-4 { margin-top: 16px; }
.mb-1 { margin-bottom: 4px; } .mb-2 { margin-bottom: 8px; } .mb-3 { margin-bottom: 12px; } .mb-4 { margin-bottom: 16px; }
.ml-1 { margin-left: 4px; } .ml-2 { margin-left: 8px; } .mr-1 { margin-right: 4px; } .mr-2 { margin-right: 8px; }
.my-1 { margin-top: 4px; margin-bottom: 4px; } .my-2 { margin-top: 8px; margin-bottom: 8px; }
.p-0 { padding: 0; } .p-1 { padding: 4px; } .p-2 { padding: 8px; }
.p-3 { padding: 12px; } .p-4 { padding: 16px; } .p-5 { padding: 20px; } .p-6 { padding: 24px; }
.px-1 { padding-left: 4px; padding-right: 4px; } .px-2 { padding-left: 8px; padding-right: 8px; }
.px-3 { padding-left: 12px; padding-right: 12px; } .px-4 { padding-left: 16px; padding-right: 16px; }
.py-1 { padding-top: 4px; padding-bottom: 4px; } .py-2 { padding-top: 8px; padding-bottom: 8px; }
.py-3 { padding-top: 12px; padding-bottom: 12px; } .py-4 { padding-top: 16px; padding-bottom: 16px; }
.pt-1 { padding-top: 4px; } .pt-2 { padding-top: 8px; }
.pb-1 { padding-bottom: 4px; } .pb-2 { padding-bottom: 8px; }
.pl-2 { padding-left: 8px; } .pl-4 { padding-left: 16px; }
.space-y-1 > * + * { margin-top: 4px; } .space-y-2 > * + * { margin-top: 8px; }
.space-y-3 > * + * { margin-top: 12px; } .space-y-4 > * + * { margin-top: 16px; }
.space-x-1 > * + * { margin-left: 4px; } .space-x-2 > * + * { margin-left: 8px; }
.space-x-3 > * + * { margin-left: 12px; } .space-x-4 > * + * { margin-left: 16px; }

/* ── Sizing ── */
.w-full { width: 100%; } .w-auto { width: auto; }
.w-8 { width: 32px; } .w-10 { width: 40px; } .w-12 { width: 48px; }
.w-16 { width: 64px; } .w-20 { width: 80px; } .w-24 { width: 96px; }
.w-32 { width: 128px; } .w-40 { width: 160px; } .w-48 { width: 192px; }
.w-1\\/2 { width: 50%; } .w-1\\/3 { width: 33.333333%; } .w-2\\/3 { width: 66.666667%; }
.min-w-0 { min-width: 0; }
.max-w-full { max-width: 100%; } .max-w-xs { max-width: 320px; }
.max-w-sm { max-width: 384px; } .max-w-md { max-width: 448px; } .max-w-lg { max-width: 512px; }
.h-1 { height: 4px; } .h-2 { height: 8px; } .h-3 { height: 12px; } .h-4 { height: 16px; }
.h-5 { height: 20px; } .h-6 { height: 24px; } .h-8 { height: 32px; } .h-10 { height: 40px; } .h-12 { height: 48px; }
.h-full { height: 100%; } .h-auto { height: auto; }
.min-h-0 { min-height: 0; }

/* ── Typography ── */
.text-xs { font-size: 12px; line-height: 1.5; }
.text-sm { font-size: 14px; line-height: 1.5; }
.text-base { font-size: 16px; line-height: 1.5; }
.text-lg { font-size: 18px; line-height: 1.4; }
.text-xl { font-size: 20px; line-height: 1.3; }
.text-2xl { font-size: 24px; line-height: 1.3; }
.text-3xl { font-size: 30px; line-height: 1.1; }
.font-normal { font-weight: 400; } .font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; } .font-bold { font-weight: 700; }
.text-left { text-align: left; } .text-center { text-align: center; } .text-right { text-align: right; }
.uppercase { text-transform: uppercase; letter-spacing: 0.05em; }
.tracking-tight { letter-spacing: -0.02em; }
.tabular-nums { font-variant-numeric: tabular-nums; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.break-words { overflow-wrap: break-word; }
.font-serif { font-family: var(--font-serif); }
.font-mono { font-family: var(--font-mono); }

/* ── Border radius (Anthropic: 4/8/16/full) ── */
.rounded { border-radius: var(--radius-md); }
.rounded-md { border-radius: var(--radius-md); }
.rounded-lg { border-radius: var(--radius-lg); }
.rounded-2xl { border-radius: 20px; }
.rounded-full { border-radius: var(--radius-full); }

/* ── Borders (transparent overlays) ── */
.border { border: 1px solid var(--color-border-default); }
.border-0 { border-width: 0; } .border-2 { border-width: 2px; }
.border-t { border-top: 1px solid var(--color-border-default); }
.border-b { border-bottom: 1px solid var(--color-border-default); }

/* ── Overflow / Position ── */
.overflow-hidden { overflow: hidden; } .overflow-auto { overflow: auto; }
.overflow-x-auto { overflow-x: auto; }
.relative { position: relative; } .absolute { position: absolute; }
.inset-0 { top: 0; right: 0; bottom: 0; left: 0; }

/* ── Interaction ── */
.opacity-50 { opacity: 0.5; } .opacity-75 { opacity: 0.75; }
.cursor-pointer { cursor: pointer; }
.transition { transition: all 200ms cubic-bezier(0.165, 0.85, 0.45, 1); }
.transition-colors { transition: color 200ms, background-color 200ms, border-color 200ms; }

/* ── Shadows (Anthropic three-layer micro-shadow) ── */
.shadow-card { box-shadow: var(--shadow-card); }
.shadow-sm { box-shadow: var(--shadow-sm); }

/* ── Surfaces (Anthropic ivory hierarchy) ── */
.bg-page { background-color: #faf9f5; }
.bg-surface { background-color: #ffffff; }
.bg-surface-secondary { background-color: #f0eee6; }
.bg-surface-tertiary { background-color: #e8e6dc; }
.bg-transparent { background-color: transparent; }
.bg-faded { background-color: rgba(20,20,19,0.04); }

/* ── Text colors ── */
.text-primary { color: var(--color-text-primary); }
.text-secondary { color: var(--color-text-secondary); }
.text-muted { color: var(--color-text-muted); }
.text-subtle { color: var(--color-text-subtle); }
.text-accent { color: var(--color-accent); }

/* ── Anthropic decorative color classes ── */
.bg-clay { background-color: #d97757; } .bg-clay-light { background-color: rgba(217,119,87,0.12); }
.bg-olive { background-color: #788c5d; } .bg-olive-light { background-color: rgba(120,140,93,0.12); }
.bg-sky { background-color: #6a9bcc; } .bg-sky-light { background-color: rgba(106,155,204,0.12); }
.bg-coral { background-color: #ebcece; } .bg-coral-light { background-color: rgba(235,206,206,0.25); }
.bg-fig { background-color: #c46686; } .bg-fig-light { background-color: rgba(196,102,134,0.12); }
.bg-heather { background-color: #cbcadb; } .bg-heather-light { background-color: rgba(203,202,219,0.25); }
.bg-kraft { background-color: #d4a27f; } .bg-kraft-light { background-color: rgba(212,162,127,0.15); }
.bg-oat { background-color: #e3dacc; } .bg-oat-light { background-color: rgba(227,218,204,0.3); }
.bg-cactus { background-color: #bcd1ca; } .bg-cactus-light { background-color: rgba(188,209,202,0.25); }

.text-clay { color: #d97757; }
.text-olive { color: #788c5d; }
.text-sky { color: #6a9bcc; }
.text-coral { color: #9e6b6b; }
.text-fig { color: #c46686; }
.text-heather { color: #8584a0; }
.text-kraft { color: #9e7254; }

.border-clay { border-color: rgba(217,119,87,0.3); }
.border-olive { border-color: rgba(120,140,93,0.3); }
.border-sky { border-color: rgba(106,155,204,0.3); }

/* ── Clickable node hint — any element with onclick gets pointer + hover effect ── */
[onclick] { cursor: pointer; }
svg [onclick] { cursor: pointer; }
svg [onclick]:hover rect,
svg [onclick]:hover circle,
svg [onclick]:hover path,
svg [onclick] rect:hover,
svg [onclick] circle:hover {
  filter: brightness(0.92);
  transition: filter 0.15s;
}
[onclick]:not(svg *):hover {
  filter: brightness(0.95);
  transition: filter 0.15s;
}
/* Subtle "click me" indicator: underline-dot on clickable text */
svg [onclick] text:last-of-type {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-color: rgba(20,20,19,0.25);
  text-underline-offset: 3px;
}
`;

// ── 表单样式（Anthropic 风格）────────────────────────────────────────────────

const FORM_STYLES = /* css */ `
input[type="range"] {
  height: 4px; -webkit-appearance: none; appearance: none;
  background: rgba(20,20,19,0.10); border-radius: 2px; outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px;
  border-radius: 50%; background: #141413; cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
input[type="text"], input[type="number"], select, textarea {
  height: 36px; padding: 0 12px;
  border: 1px solid rgba(20,20,19,0.10);
  border-radius: var(--radius-md);
  background: #ffffff; color: #141413;
  font-size: 14px; font-family: var(--font-sans); outline: none;
  transition: border-color 200ms, box-shadow 200ms;
}
input:focus, select:focus, textarea:focus {
  border-color: #141413;
  box-shadow: 0 0 0 1px #141413;
}
button {
  background: transparent;
  border: 1px solid rgba(20,20,19,0.10);
  border-radius: var(--radius-md);
  padding: 8px 16px; font-size: 14px; font-family: var(--font-sans);
  color: #141413; cursor: pointer;
  transition: all 200ms cubic-bezier(0.165, 0.85, 0.45, 1);
}
button:hover { border-color: rgba(20,20,19,0.20); background: #f0eee6; }
button:active { transform: scale(0.98); }
`;

// ── 主题变量读取 ─────────────────────────────────────────────────────────────

const THEME_VAR_NAMES = [
  '--color-surface', '--color-surface-secondary', '--color-surface-tertiary',
  '--color-surface-cream',
  '--color-ink-900', '--color-ink-800', '--color-ink-700', '--color-ink-600',
  '--color-ink-500', '--color-ink-400', '--color-ink-300', '--color-ink-200',
  '--color-ink-100', '--color-ink-50',
  '--color-muted', '--color-muted-light',
  '--color-accent', '--color-accent-hover',
  '--color-error', '--color-error-light',
  '--color-success', '--color-success-light',
  '--color-info', '--color-info-light',
];

export function resolveThemeVars(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const computed = getComputedStyle(document.documentElement);
  const vars: Record<string, string> = {};
  for (const name of THEME_VAR_NAMES) {
    const val = computed.getPropertyValue(name).trim();
    if (val) vars[name] = val;
  }
  return vars;
}

export function getWidgetIframeStyleBlock(resolvedVars: Record<string, string>): string {
  const rootVars = Object.entries(resolvedVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  return `
:root {
${rootVars}
}
.dark {
  color-scheme: dark;
  --color-border-default: rgba(250, 249, 245, 0.10);
  --color-border-hover: rgba(250, 249, 245, 0.20);
  --color-border-tertiary: rgba(250, 249, 245, 0.10);
  --color-border-secondary: rgba(250, 249, 245, 0.15);
  --color-border-primary: rgba(250, 249, 245, 0.30);
}
body {
  ${WIDGET_CSS_BRIDGE}
  font-family: var(--font-serif);
  font-size: 16px;
  line-height: 1.5;
  color: var(--color-text-primary);
  background: transparent;
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-sans);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--color-text-primary);
  margin: 0 0 8px;
}
h1 { font-size: 24px; } h2 { font-size: 20px; } h3 { font-size: 16px; font-weight: 500; }
p { margin: 0 0 8px; line-height: 1.5; }
a { color: var(--color-sky); text-decoration: none; cursor: pointer; }
a:hover { text-decoration: underline; }
${WIDGET_UTILITIES}
${FORM_STYLES}
@keyframes widgetFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
}
