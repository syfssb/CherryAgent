/**
 * Widget 设计指南 — Anthropic 设计语言
 *
 * 核心美学：温暖象牙色调、衬线体内容、极致微妙的阴影、自然材质装饰色
 * 反 AI slop：不用渐变、不用纯黑白、不用 Inter/Roboto、不用霓虹/发光
 */

export const WIDGET_SYSTEM_PROMPT = `<widget-capability>
You can create interactive visualizations inline in the conversation using the \`show-widget\` code fence.

## Format
\`\`\`show-widget
{"title":"snake_case_id","widget_code":"<svg>...</svg> OR <style>...</style><div>...</div><script>...</script>"}
\`\`\`

## When to use
| User intent | Format |
|-------------|--------|
| Process / how X works | SVG flowchart |
| Structure / what is X | SVG hierarchy or layers |
| History / sequence | SVG timeline |
| Cycle / feedback loop | SVG cycle diagram |
| Compare A vs B | SVG side-by-side |
| Data / trends | ECharts (div + CDN) |
| Calculation / formula | HTML with sliders/inputs |
| Ranking / proportions | HTML bar display |

## When NOT to use
- Simple yes/no answers or short factual responses
- Lists with < 5 items (use markdown)
- Data with only 1-2 data points (text is enough)

## Anthropic Design Language (CRITICAL)

### Color Philosophy
NEVER use pure white (#fff) or pure black (#000). Use warm tones:
- Page ivory: #faf9f5 (not #fff)
- Near-black: #141413 (not #000)
- Muted text: #87867f (warm gray, not cool #6b7280)
- Borders: rgba(20,20,19,0.10) — TRANSPARENT overlays, never solid grays

### Decorative Palette (named after natural materials)
Use these for fills, strokes, and chart series — pick 2-3 per widget:
| Name | Hex | Best for |
|------|-----|----------|
| Clay | #d97757 | Primary accent, first data series |
| Olive | #788c5d | Growth, positive, second series |
| Sky | #6a9bcc | Information, links, third series |
| Coral | #ebcece | Soft background fills |
| Fig | #c46686 | Warnings, alerts |
| Kraft | #d4a27f | Warm secondary accent |
| Oat | #e3dacc | Subtle background bands |
| Heather | #cbcadb | Soft purple accent |
| Cactus | #bcd1ca | Cool-calm secondary |

Light fills: use 12% alpha (e.g. rgba(217,119,87,0.12) for clay-light)
Text on fills: use the color name directly, never #000

### Typography
- Titles/headings: sans-serif (system-ui), weight 600, tight tracking
- Body text in widgets: serif (Georgia), weight 400, 1.5 line-height
- Labels/numbers: sans-serif, weight 500, tabular-nums for numbers
- Section labels: UPPERCASE, 11px, letter-spacing 0.05em, color #87867f
- NEVER use Inter, Roboto, Open Sans — they scream "AI generated"

### SVG Node Styling
- Fill: decorative-50 tint (12% alpha of the color)
- Stroke: 1px rgba(20,20,19,0.10) — transparent, not solid
- Corner radius: rx=12
- Text: 14px sans-serif #141413 for labels, 12px #87867f for subtitles
- Arrows: 1.5px stroke, same color as source node

### HTML Widget Styling
- Cards: bg #ffffff, border 1px rgba(20,20,19,0.10), rounded 16px
- Shadow: 0 2px 2px rgba(0,0,0,0.012), 0 4px 4px rgba(0,0,0,0.02), 0 16px 24px rgba(0,0,0,0.04)
- Stat numbers: 24px, font-weight 600, color = decorative color (not black)
- Section headers: 11px uppercase tracking-wide #87867f

### Chart.js Styling
- borderColor: decorative color at full opacity
- backgroundColor: decorative color at 12% alpha
- Grid lines: rgba(0,0,0,0.04) — barely visible
- Tick labels: #87867f, 12px
- No legends unless multiple datasets
- pointRadius: 4, pointHoverRadius: 6

## Multi-widget narration
For complex topics, interleave text + widgets. Each widget = separate code fence.

## Rules
1. widget_code is raw HTML/SVG — no DOCTYPE/html/head/body
2. Transparent background — host provides bg
3. NO gradients, NO shadows on SVG elements, NO glow/neon. Solid fills only.
4. Escape JSON — widget_code is a JSON string value
5. SVG ≤ 2500 chars, HTML ≤ 3000 chars, Chart.js ≤ 4000 chars
6. CDN: s4.zstatic.net, cdn.jsdelivr.net, cdnjs.cloudflare.com, unpkg.com, esm.sh
7. Script: \`onload="init()"\` + \`if(window.Chart)init();\` fallback
8. SVG: \`<svg width="100%" viewBox="0 0 680 H">\`
9. Utility classes pre-loaded: flex, grid, gap-N, p-N, rounded-lg, bg-surface-secondary, text-muted, etc.
10. Clickable drill-down: \`onclick="window.__widgetSendMessage('Explain [topic]')"\`
11. Interactive controls MUST call \`chart.update()\` after data changes
</widget-capability>`;

// ── 详细模块指南 ──────────────────────────────────────────────────────────────

const CORE_DESIGN_SYSTEM = `## Anthropic Design System for Widgets

### Philosophy
- **Warm & Natural**: colors from natural materials (clay, olive, oat, heather). Never synthetic neon.
- **Extreme Subtlety**: shadows at 1-4% opacity. Borders at 10% opacity. You feel depth, not see it.
- **Serif for Content**: use Georgia/Lora for text-heavy widgets (metric labels, explanations). Sans for UI controls.
- **Generous Spacing**: padding 24px for cards, 16px gaps between elements. The widget should breathe.
- **One Dominant + One Sharp Accent**: pick ONE decorative color as dominant, ONE as sharp contrast.

### Anti-Patterns (NEVER do these)
- Purple-to-blue gradients
- Heavy drop shadows (shadow-lg, shadow-xl)
- Solid colored badges (bg-blue-500 text-white)
- Accent lines under titles (border-b-2 border-blue-500)
- Neon glow effects
- Gradient text
- Pure white backgrounds (#fff as bg — use #faf9f5 or transparent)
- Pure black text (#000 — use #141413)
- Cool gray borders (#d1d5db — use rgba(20,20,19,0.10))

### CSS Variables Available
Backgrounds: --color-background-primary, -secondary, -tertiary, --color-background-page
Text: --color-text-primary, -secondary, --color-text-muted, --color-text-subtle
Borders: --color-border-default (10% transparent), --color-border-hover (20%)
Decorative: --color-clay, --color-olive, --color-sky, --color-coral, --color-fig, --color-heather, --color-kraft, --color-oat
Fonts: --font-serif (content), --font-sans (UI), --font-mono (code)
Shadows: --shadow-card (three-layer), --shadow-sm`;

const UI_COMPONENTS = `## HTML Widget Components

### Stat Card
\`\`\`html
<div style="background:#fff;border:1px solid rgba(20,20,19,0.10);border-radius:16px;padding:24px;
box-shadow:0 2px 2px rgba(0,0,0,0.012),0 4px 4px rgba(0,0,0,0.02),0 16px 24px rgba(0,0,0,0.04)">
  <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#87867f;margin:0 0 4px">Revenue</p>
  <p style="font-size:24px;font-weight:600;color:#d97757;margin:0;font-variant-numeric:tabular-nums">$12.4M</p>
  <p style="font-size:13px;color:#788c5d;margin:4px 0 0">+18% vs last year</p>
</div>
\`\`\`

### Patterns
1. **Metric Dashboard**: grid of stat cards (rounded-lg, shadow-card) above a chart
2. **Calculator**: range sliders with live result — serif for results, sans for labels
3. **Bar Comparison**: horizontal bars with Clay/Olive/Sky fills at 12% alpha, text overlay
4. **Data Table**: no borders between cells — use bg-faded for alternating rows`;

const COLOR_PALETTE = `## Anthropic Decorative Palette

### Primary Pairs (use together)
- **Clay + Olive**: warm action + growth (most common pair)
- **Sky + Kraft**: information + warm accent
- **Fig + Heather**: alert + soft contrast
- **Oat + Cactus**: neutral + cool calm

### SVG Color Rules
| Element | What to use |
|---------|-------------|
| Node fill | 12% alpha of decorative color, e.g. rgba(217,119,87,0.12) |
| Node stroke | rgba(20,20,19,0.10) — same for all nodes |
| Node title | #141413, 14px sans-serif |
| Node subtitle | #87867f, 12px sans-serif |
| Arrow stroke | Same decorative color as source node, 1.5px |
| Background band | #faf9f5 or decorative-light (rgba at 8%) |
| Highlight node | Full decorative color as fill, #faf9f5 text |

### Chart.js Color Config
\`\`\`js
// Anthropic chart palette
var palette = [
  { border: '#d97757', bg: 'rgba(217,119,87,0.12)' },  // Clay
  { border: '#788c5d', bg: 'rgba(120,140,93,0.12)' },  // Olive
  { border: '#6a9bcc', bg: 'rgba(106,155,204,0.12)' },  // Sky
  { border: '#d4a27f', bg: 'rgba(212,162,127,0.12)' },  // Kraft
  { border: '#c46686', bg: 'rgba(196,102,134,0.12)' },  // Fig
];
// Grid: rgba(0,0,0,0.04). Ticks: color '#87867f', font size 12
\`\`\``;

const CHARTS_CHART_JS = `## Charts (ECharts — Anthropic Theme)

ECharts is the ONLY charting library to use. Load from CDN, register an Anthropic warm theme, then init.

\`\`\`html
<div id="chart" style="width:100%;height:320px"></div>
<script src="https://s4.zstatic.net/ajax/libs/echarts/5.6.0/echarts.min.js" onload="init()"></script>
<script>
function init(){
  echarts.registerTheme('anthropic',{
    color:['#d97757','#788c5d','#6a9bcc','#d4a27f','#c46686','#cbcadb','#bcd1ca'],
    backgroundColor:'transparent',
    textStyle:{fontFamily:'system-ui,-apple-system,sans-serif',color:'#141413'},
    title:{textStyle:{color:'#141413',fontSize:16,fontWeight:600},subtextStyle:{color:'#87867f',fontSize:13}},
    legend:{textStyle:{color:'#87867f',fontSize:12}},
    categoryAxis:{axisLine:{lineStyle:{color:'rgba(20,20,19,0.10)'}},axisTick:{show:false},axisLabel:{color:'#87867f',fontSize:12},splitLine:{lineStyle:{color:'rgba(20,20,19,0.04)'}}},
    valueAxis:{axisLine:{show:false},axisTick:{show:false},axisLabel:{color:'#87867f',fontSize:12},splitLine:{lineStyle:{color:'rgba(20,20,19,0.04)'}}},
    tooltip:{backgroundColor:'#fff',borderColor:'rgba(20,20,19,0.10)',textStyle:{color:'#141413',fontSize:13},extraCssText:'box-shadow:0 2px 8px rgba(0,0,0,0.08);border-radius:8px;'}
  });
  var chart=echarts.init(document.getElementById('chart'),'anthropic');
  chart.setOption({
    tooltip:{trigger:'axis'},
    xAxis:{type:'category',data:['Jan','Feb','Mar','Apr','May','Jun']},
    yAxis:{type:'value'},
    series:[{type:'line',smooth:true,data:[820,932,901,1034,1290,1430],
      areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(217,119,87,0.25)'},{offset:1,color:'rgba(217,119,87,0.02)'}]}},
      lineStyle:{width:2.5},symbolSize:6}]
  });
  window.addEventListener('resize',function(){chart.resize()});
}
if(window.echarts)init();
</script>
\`\`\`

### ECharts Rules
- ALWAYS register theme 'anthropic' with the config above, then \`echarts.init(el,'anthropic')\`
- Area fills: linear gradient from 25% alpha to 2% alpha (not solid)
- Bar charts: \`itemStyle:{borderRadius:[4,4,0,0]}\` for rounded tops
- Pie/Doughnut: \`radius:['45%','75%']\`, label \`alignTo:'edge'\`
- Always add resize listener: \`window.addEventListener('resize',function(){chart.resize()})\`
- Interactive controls: call \`chart.setOption({...})\` to update (not chart.update)
- For multiple charts: use unique IDs ('chart1','chart2') and separate instances

### Advanced Types
- Sankey: \`type:'sankey'\` — flows/budgets
- Tree/TreeMap: \`type:'tree'\`/\`type:'treemap'\` — hierarchies
- Radar: \`type:'radar'\` — multi-dimensional comparison
- Heatmap: \`type:'heatmap'\` — matrix data
- Gauge: \`type:'gauge'\` — progress/metrics
- Funnel: \`type:'funnel'\` — conversion funnels`;

const SVG_SETUP = `## SVG Setup (Anthropic Style)

\`<svg width="100%" viewBox="0 0 680 H">\` — 680px fixed width. H = content + 40px buffer.

### Arrow marker
\`<defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>\`

### Typography in SVG
- Titles: 14px, font-weight 600, font-family system-ui — color #141413
- Subtitles: 12px, font-weight 400 — color #87867f
- Section labels: 11px, UPPERCASE, letter-spacing 0.05em — color #87867f
- NEVER use font-size below 11px

### Node Template
\`\`\`svg
<rect x="X" y="Y" width="W" height="H" rx="12"
  fill="rgba(217,119,87,0.12)" stroke="rgba(20,20,19,0.10)" stroke-width="1"/>
<text x="X+W/2" y="Y+22" text-anchor="middle"
  font-family="system-ui" font-size="14" font-weight="600" fill="#141413">Title</text>
<text x="X+W/2" y="Y+38" text-anchor="middle"
  font-family="system-ui" font-size="12" fill="#87867f">Subtitle</text>
\`\`\``;

const DIAGRAM_TYPES = `## Diagram Types

### Flowchart (top→bottom or left→right)
- ≤4 nodes per row, ≤5 words per title
- Nodes: rounded rect, 12% alpha fill, 1px transparent border
- Decision: bold border (stroke-width 2), diamond or hexagon shape
- Arrows: 1.5px, same color as source node

### Timeline
- Horizontal line: 2px #e8e6dc (warm light gray)
- Event dots: 8px diameter, full decorative color
- Labels: stagger above/below, serif font for descriptions

### Cycle / Feedback
- 3-5 nodes in circle, connected by curved paths (Q bezier)
- Center label: 16px sans-serif, the cycle name
- Nodes: full decorative color fill, #faf9f5 white text

### Hierarchy / Tree
- Root at top, children below with vertical lines
- Parent nodes: full color fill, children: 12% alpha fill
- Indent: 40px per level

### Layered Stack (Architecture)
- Full-width horizontal bands, 60-80px tall
- Each band: different Anthropic decorative color at 12% alpha
- Top layer = user-facing, bottom = infrastructure
- Items within bands: inline sans-serif labels

### Side-by-side Comparison
- Two columns with matching rows
- Column A: one decorative color, Column B: another
- Connecting lines for correspondences (dotted, #e8e6dc)

### Design Rules
- Max 2-3 decorative colors per diagram + warm gray for structure
- Node width ≥ (chars × 8 + 48) px
- Clickable nodes: \`onclick="window.__widgetSendMessage('...')"\` on 2-3 key nodes
- Always: serif for long text, sans for short labels`;

// ── 模块注册 ─────────────────────────────────────────────────────────────────

const MODULE_SECTIONS: Record<string, string[]> = {
  interactive: [CORE_DESIGN_SYSTEM, UI_COMPONENTS, COLOR_PALETTE],
  chart: [CORE_DESIGN_SYSTEM, UI_COMPONENTS, COLOR_PALETTE, CHARTS_CHART_JS],
  diagram: [CORE_DESIGN_SYSTEM, COLOR_PALETTE, SVG_SETUP, DIAGRAM_TYPES],
  art: [CORE_DESIGN_SYSTEM, SVG_SETUP, COLOR_PALETTE],
};

export const AVAILABLE_MODULES = Object.keys(MODULE_SECTIONS);

export function getGuidelines(moduleNames: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const mod of moduleNames) {
    const sections = MODULE_SECTIONS[mod.toLowerCase().trim()];
    if (!sections) continue;
    for (const section of sections) {
      if (!seen.has(section)) { seen.add(section); parts.push(section); }
    }
  }
  return parts.join('\n\n\n');
}
