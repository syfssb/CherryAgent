# Anthropic UI Design Skill

A comprehensive, actionable reference for building interfaces in the Anthropic visual language. Synthesized from anthropic.com's production CSS, claude.ai's interface patterns, official Anthropic design skills, and community style guides.

**Scope:** This document covers the two primary Anthropic design surfaces -- the corporate site (anthropic.com) and the product interface (claude.ai) -- and distills them into a unified system for building new UI.

---

## Section 1: Color System

### 1.1 Core Palette (Exact Hex Values)

| Token | Hex | RGB | Role |
|-------|-----|-----|------|
| **Slate Dark** | `#141413` | (20, 20, 19) | Primary text (light), page bg (dark) |
| **Ivory Light** | `#faf9f5` | (250, 249, 245) | Page bg (light), text (dark) |
| **White** | `#ffffff` | (255, 255, 255) | Card surfaces, composer, elevated panels |
| **Ivory Medium** | `#f0eee6` | (240, 238, 230) | Secondary bg (light), link hover bg |
| **Ivory Dark** | `#e8e6dc` | (232, 230, 220) | Secondary bg hover (light), subtle borders |
| **Slate Medium** | `#3d3d3a` | (61, 61, 58) | Card bg (dark), secondary bg (dark) |
| **Slate Light** | `#5e5d59` | (94, 93, 89) | Link hover text (light) |
| **Cloud Dark** | `#87867f` | (135, 134, 127) | Subdued text, placeholders |
| **Cloud Medium** | `#b0aea5` | (176, 174, 165) | Muted UI elements, dividers |
| **Cloud Light** | `#d1cfc5` | (209, 207, 197) | Light cloud accent |
| **Accent Orange** | `#c6613f` | (198, 97, 63) | Primary CTA (anthropic.com nav) |
| **Clay** | `#d97757` | (217, 119, 87) | CTA hover, brand accent, primary accent |
| **Product Orange** | `#ae5630` | (174, 86, 48) | Send button, interactive accents (claude.ai) |
| **Product Orange Hover** | `#c4633a` | (196, 99, 58) | Hover state for product orange |

### 1.2 Decorative / Extended Palette

| Token | Hex | Usage |
|-------|-----|-------|
| **Coral** | `#ebcece` | Decorative pink |
| **Fig** | `#c46686` | Decorative magenta-pink |
| **Olive** | `#788c5d` | Decorative green, success states |
| **Sky** | `#6a9bcc` | Decorative blue, secondary accent, links |
| **Cactus** | `#bcd1ca` | Decorative teal-green |
| **Heather** | `#cbcadb` | Decorative lavender |
| **Kraft** | `#d4a27f` | Decorative tan |
| **Manilla** | `#ebdbbc` | Decorative warm cream |
| **Oat** | `#e3dacc` | Decorative warm neutral |

### 1.3 Background Hierarchy

#### Light Mode

| Layer | Hex | CSS Variable | Tailwind |
|-------|-----|-------------|----------|
| Page background | `#faf9f5` | `--swatch--ivory-light` | `bg-[#faf9f5]` |
| Surface / sidebar | `#f5f5f0` | `--claude-bg-primary` | `bg-[#F5F5F0]` |
| Card / elevated | `#ffffff` | `--swatch--white` | `bg-white` |
| Secondary surface | `#f0eee6` | `--swatch--ivory-medium` | `bg-[#f0eee6]` |
| Secondary hover | `#e8e6dc` | `--swatch--ivory-dark` | `bg-[#e8e6dc]` |
| User message bubble | `#DDD9CE` | `--claude-bg-user-bubble` | `bg-[#DDD9CE]` |
| Faded overlay | `#1414131a` | `--swatch--slate-faded-10` | `bg-[#1414131a]` |
| Faded overlay hover | `#14141333` | `--swatch--slate-faded-20` | `bg-[#14141333]` |

#### Dark Mode

| Layer | Hex | CSS Variable | Tailwind |
|-------|-----|-------------|----------|
| Page background | `#141413` | `--swatch--slate-dark` | `dark:bg-[#141413]` |
| Surface / main area | `#2b2a27` | `--claude-bg-primary` | `dark:bg-[#2b2a27]` |
| Card / elevated | `#3d3d3a` | `--swatch--slate-medium` | `dark:bg-[#3d3d3a]` |
| Composer / input | `#1f1e1b` | `--claude-bg-composer` | `dark:bg-[#1f1e1b]` |
| User message bubble | `#393937` | `--claude-bg-user-bubble` | `dark:bg-[#393937]` |
| Faded overlay | `#faf9f51a` | `--swatch--ivory-faded-10` | `dark:bg-[#faf9f51a]` |
| Faded overlay hover | `#faf9f533` | `--swatch--ivory-faded-20` | `dark:bg-[#faf9f533]` |

### 1.4 Text Color Hierarchy

#### Light Mode

| Role | Hex | Tailwind |
|------|-----|----------|
| Primary | `#141413` | `text-[#141413]` |
| Secondary / body | `#1a1a18` | `text-[#1a1a18]` |
| Muted | `#6b6a68` | `text-[#6b6a68]` |
| Subtle / subdued | `#87867f` | `text-[#87867f]` |
| Disabled / agate | `#b0aea5` | `text-[#b0aea5]` |
| Link hover | `#5e5d59` | `hover:text-[#5e5d59]` |

#### Dark Mode

| Role | Hex | Tailwind |
|------|-----|----------|
| Primary | `#faf9f5` | `dark:text-[#faf9f5]` |
| Secondary | `#eeeeee` | `dark:text-[#eee]` |
| Muted | `#9a9893` | `dark:text-[#9a9893]` |
| Subtle | `#87867f` | `dark:text-[#87867f]` |
| Disabled / agate | `#b0aea5` | `dark:text-[#b0aea5]` |
| Link hover | `#f0eee6` | `dark:hover:text-[#f0eee6]` |

### 1.5 Border Colors

| Context | Hex | Opacity | Tailwind |
|---------|-----|---------|----------|
| Light default | `#1414131a` | 10% slate | `border-[#1414131a]` |
| Light hover | `#14141333` | 20% slate | `hover:border-[#14141333]` |
| Dark default | `#faf9f51a` | 10% ivory | `dark:border-[#faf9f51a]` |
| Dark hover | `#faf9f533` | 20% ivory | `dark:hover:border-[#faf9f533]` |
| Soft (claude.ai) | `rgba(0,0,0,0.08)` | 8% black | `border-[#00000015]` |

**Key rule:** Borders use transparency, never solid grays. This keeps them visually integrated with any background color.

### 1.6 CSS Custom Properties

```css
:root {
  /* Core palette */
  --swatch--slate-dark: #141413;
  --swatch--ivory-light: #faf9f5;
  --swatch--white: #ffffff;
  --swatch--ivory-medium: #f0eee6;
  --swatch--ivory-dark: #e8e6dc;
  --swatch--slate-medium: #3d3d3a;
  --swatch--slate-light: #5e5d59;
  --swatch--cloud-dark: #87867f;
  --swatch--cloud-medium: #b0aea5;
  --swatch--cloud-light: #d1cfc5;

  /* Accent */
  --swatch--accent: #c6613f;
  --swatch--clay: #d97757;
  --claude-accent: #ae5630;
  --claude-accent-hover: #c4633a;

  /* Borders (transparent) */
  --swatch--slate-faded-10: #1414131a;
  --swatch--slate-faded-20: #14141333;
  --swatch--ivory-faded-10: #faf9f51a;
  --swatch--ivory-faded-20: #faf9f533;

  /* Decorative */
  --swatch--coral: #ebcece;
  --swatch--fig: #c46686;
  --swatch--olive: #788c5d;
  --swatch--sky: #6a9bcc;
  --swatch--cactus: #bcd1ca;
  --swatch--heather: #cbcadb;
  --swatch--kraft: #d4a27f;
  --swatch--manilla: #ebdbbc;
  --swatch--oat: #e3dacc;
}
```

### 1.7 Color Application Rules

1. **Never pure white for backgrounds.** Use `#faf9f5` (ivory) or `#F5F5F0` (warm gray).
2. **Never pure black for text.** Use `#141413` (near-black with warmth).
3. **Accent colors are for emphasis only.** Never use orange/blue/green as large background fills.
4. **Dominant + sharp accent.** One dominant color with sharp contrasting accents outperforms evenly-distributed palettes.
5. **Dark-on-light or light-on-dark only.** Never put `#141413` text on `#b0aea5` mid-gray backgrounds.
6. **The accent orange stays constant across light/dark modes.** `#ae5630` does not shift.

---

## Section 2: Typography

### 2.1 Font Families

| Role | anthropic.com | claude.ai | Fallback Stack |
|------|--------------|-----------|---------------|
| **Display / Headlines** | Anthropic Sans | Styrene A / Styrene B | `system-ui, Arial, sans-serif` |
| **Body / Responses** | Anthropic Serif | Tiempos Text | `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif` |
| **UI / Labels / Buttons** | Anthropic Sans | Styrene A | `system-ui, Arial, sans-serif` |
| **Code / Monospace** | Anthropic Mono | JetBrains Mono | `"JetBrains Mono", "Fira Code", monospace` |
| **Logo** | Custom | Custom Copernicus | -- |

#### Brand Typography (Official Anthropic Guidelines)

| Role | Font | Fallback |
|------|------|----------|
| Headings | Poppins | Arial |
| Body text | Lora | Georgia |

#### For Third-Party Projects (Recommended Alternatives)

When you cannot use Anthropic's proprietary fonts, substitute with these to maintain the spirit:

| Context | Recommended | Why |
|---------|------------|-----|
| Editorial serif (body) | Crimson Pro, Fraunces, Newsreader, Lora | Warm, readable, distinctive |
| Display serif (headings) | Playfair Display, Fraunces Display | Bold, editorial presence |
| Clean sans (UI) | Satoshi, Cabinet Grotesk, Clash Display | Modern without being generic |
| Code | JetBrains Mono, Fira Code | Industry-standard, legible |

**Fonts to NEVER use:**
- Inter, Roboto, Open Sans, Lato, Arial, system-ui defaults
- These are the hallmark of "AI slop" -- statistically overrepresented in training data

### 2.2 Font Size Scale

#### anthropic.com Scale (rem, base 16px)

| Token | Rem | px | Usage |
|-------|-----|-----|-------|
| `display-xxxl` | 6rem | 96px | Hero headlines |
| `display-xxl` | 4.5rem | 72px | Major section headers |
| `display-xl` | 4rem | 64px | Large section titles |
| `display-l` | 3rem | 48px | Section headings |
| `display-m` | 2rem | 32px | Sub-section headings |
| `display-s` | 1.5rem | 24px | Card titles, smaller headings |
| `display-xs` | 1.25rem | 20px | Minor headings |
| `paragraph-l` | 1.5rem | 24px | Large body text |
| `paragraph-m` | 1.25rem | 20px | Default body text |
| `paragraph-s` | 1.125rem | 18px | Smaller body text |
| `paragraph-xs` | 1rem | 16px | Small body text |
| `detail-xl` | 1.25rem | 20px | Large labels |
| `detail-l` | 1.125rem | 18px | Label text |
| `detail-m` | 1rem | 16px | Default UI text |
| `detail-s` | 0.875rem | 14px | Small labels / meta |
| `detail-xs` | 0.75rem | 12px | Tiny labels |
| `monospace` | 1.125rem | 18px | Code blocks |

#### Practical Application Mapping

| Context | Size | Weight | Line Height | Font |
|---------|------|--------|-------------|------|
| Page hero | 48-96px | 600-700 | 1.05-1.1 | Serif or Sans display |
| Section heading | 32-48px | 600 | 1.1 | Serif or Sans |
| Card title | 20-24px | 500-600 | 1.3 | Sans |
| Body text | 16-20px | 400 | 1.4-1.5 | Serif |
| UI label / button | 14-16px | 400-500 | 1.0 | Sans |
| Meta / caption | 12-14px | 400 | 1.3 | Sans |
| Code | 14-18px | 400-500 | 1.5 | Mono |

### 2.3 Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Regular | 400 | Body text, detail text, serif display |
| Medium | 500 | Display sans medium, UI labels, mono medium |
| Semibold | 600 | Display headings (sans and serif) |
| Bold | 700 | Display sans bold, emphasis |

**Weight contrast rule:** Use extremes. Pair 200 with 800, or 300 with 700. Avoid timid mid-range contrasts like 400 vs 500 -- they look indecisive.

### 2.4 Line Heights

| Token | Value | Usage |
|-------|-------|-------|
| Tight | 1.0 | Button text, single-line labels |
| Very tight | 1.05 | Hero display text |
| Display | 1.1 | Section headings |
| Subheading | 1.3 | Card titles, subheadings, meta text |
| Body default | 1.4 | Paragraph text |
| Relaxed body | 1.5 | Long-form reading, code blocks |

### 2.5 Letter Spacing

| Value | Usage |
|-------|-------|
| `0em` | Default (body text) |
| `-0.005em` | Buttons, detail text (very slight tightening) |
| `-0.02em` | Display headings (tighter tracking for large text) |

### 2.6 Typography Anti-Patterns

| Do NOT | Do Instead |
|--------|-----------|
| Use Inter for everything | Pick one distinctive font and commit |
| Use 400 vs 600 weight contrast | Use 200 vs 800 for dramatic hierarchy |
| Size jump of 1.5x | Size jump of 3x+ for clear levels |
| Sans-serif body in editorial contexts | Serif body for warmth and readability |
| Multiple display fonts | ONE display font used decisively |
| System font stacks as primary | Named fonts with intentional fallbacks |

---

## Section 3: Spacing & Layout

### 3.1 Spacing Scale (4px Base)

| Token | Rem | px | Tailwind |
|-------|-----|-----|----------|
| `space-1` | 0.25rem | 4px | `p-1` / `m-1` |
| `space-2` | 0.5rem | 8px | `p-2` / `m-2` |
| `space-3` | 0.75rem | 12px | `p-3` / `m-3` |
| `space-4` | 1rem | 16px | `p-4` / `m-4` |
| `space-5` | 1.5rem | 24px | `p-6` / `m-6` |
| `space-6` | 2rem | 32px | `p-8` / `m-8` |
| `space-7` | 2.5rem | 40px | `p-10` / `m-10` |
| `space-8` | 3rem | 48px | `p-12` / `m-12` |
| `space-9` | 4rem | 64px | `p-16` / `m-16` |
| `space-10` | 5rem | 80px | `p-20` / `m-20` |
| `space-11` | 6rem | 96px | `p-24` / `m-24` |
| `space-12` | 10rem | 160px | custom |

### 3.2 Gap Scale (Component-Level)

| Token | Maps To | px | Tailwind |
|-------|---------|-----|----------|
| `gap-xs` | space-2 | 8px | `gap-2` |
| `gap-s` | space-4 | 16px | `gap-4` |
| `gap-m` | space-5 | 24px | `gap-6` |
| `gap-l` | space-8 | 48px | `gap-12` |
| `gap-xl` | space-9 | 64px | `gap-16` |

### 3.3 Section Spacing (Vertical Between Page Sections)

| Token | Rem | px | Usage |
|-------|-----|-----|-------|
| `section-none` | 0 | 0 | Adjacent sections, no gap |
| `section-xs` | 2rem | 32px | Tight subsections |
| `section-sm` | 4rem | 64px | Standard subsection gap |
| `section-md` | 6rem | 96px | Standard section gap |
| `section-main` | 10rem | 160px | Primary section dividers |
| `section-lg` | 14rem | 224px | Major page divisions |
| `section-page-top` | 12rem | 192px | Top of page (below nav) |

### 3.4 Max-Width Values

| Context | Value | Tailwind |
|---------|-------|----------|
| Site container | 89.5rem (1432px) | `max-w-[89.5rem]` |
| Content / chat | 48rem (768px) | `max-w-3xl` |
| Narrow content | 56.25rem (900px) | `max-w-[56.25rem]` |
| Full bleed | 100vw | `max-w-full` |

### 3.5 Grid System

| Property | Value |
|----------|-------|
| Column count | 12 |
| Site margin | 64px |
| Gutter | 2rem (32px) |
| Max width | 89.5rem (1432px) |

### 3.6 Common Padding Patterns

| Component | Padding | Tailwind |
|-----------|---------|----------|
| Button | 8px 16px (0.5rem 1rem) | `px-4 py-2` |
| Card | 24px (1.5rem) | `p-6` |
| Input field | 8px 12px | `px-3 py-2` |
| Page sides | 16px (mobile), 64px (desktop) | `px-4 md:px-16` |
| Section vertical | 64-160px | `py-16` to `py-40` |
| Chat message area | 16px sides, 64px top | `p-4 pt-16` |
| Composer internal | 2px (0.5rem is ring, inner has separate padding) | `p-0.5` (outer), content-specific inner |

### 3.7 Border Radius

| Token | Value | px | Tailwind | Usage |
|-------|-------|-----|----------|-------|
| Small | 0.25rem | 4px | `rounded` | Tags, tiny elements |
| Main | 0.5rem | 8px | `rounded-lg` | Buttons, inputs, small cards |
| Large | 1rem | 16px | `rounded-2xl` | Cards, composer, containers |
| Round / Pill | 100vw | full | `rounded-full` | Avatars, pill buttons |

---

## Section 4: Component Specifications

### 4.1 Primary Button

```
Default:
  bg-[#141413] text-[#faf9f5] border border-[#141413]
  px-4 py-2 min-h-[2.25rem] rounded-lg
  font-sans text-base leading-none tracking-[-0.005em]
  inline-flex items-center justify-center
  transition-colors duration-200

Hover:
  hover:bg-[#3d3d3a] hover:border-[#3d3d3a]

Active:
  active:scale-[0.98]

Disabled:
  opacity-50 cursor-not-allowed pointer-events-none

Focus:
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#141413] focus-visible:ring-offset-2

Dark mode:
  dark:bg-[#faf9f5] dark:text-[#141413] dark:border-[#faf9f5]
  dark:hover:bg-[#f0eee6] dark:hover:border-[#f0eee6]
```

**Do:** Use for the single most important action on screen.
**Don't:** Use more than one primary button per section.

### 4.2 Secondary Button

```
Default:
  bg-transparent text-[#141413] border border-[#141413]
  px-4 py-2 min-h-[2.25rem] rounded-lg
  font-sans text-base leading-none tracking-[-0.005em]
  inline-flex items-center justify-center
  transition-colors duration-200

Hover:
  hover:bg-[#141413] hover:text-[#faf9f5]

Active:
  active:scale-[0.98]

Disabled:
  opacity-50 cursor-not-allowed pointer-events-none

Focus:
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#141413] focus-visible:ring-offset-2

Dark mode:
  dark:text-[#faf9f5] dark:border-[#faf9f5]
  dark:hover:bg-[#faf9f5] dark:hover:text-[#141413]
```

**Do:** Use for secondary actions alongside a primary button.
**Don't:** Use when the action is unimportant enough for a ghost button.

### 4.3 Ghost / Text Button (Tertiary)

```
Default:
  bg-transparent text-[#141413] border border-[#1414131a]
  px-4 py-2 min-h-[2.25rem] rounded-lg
  font-sans text-base leading-none tracking-[-0.005em]
  inline-flex items-center justify-center
  transition-colors duration-200

Hover:
  hover:border-[#141413]

Active:
  active:scale-[0.98]

Disabled:
  opacity-50 cursor-not-allowed pointer-events-none

Dark mode:
  dark:text-[#faf9f5] dark:border-[#faf9f51a]
  dark:hover:border-[#faf9f5]
```

**Do:** Use for low-emphasis actions (cancel, dismiss, tertiary navigation).
**Don't:** Use when the user might miss the action entirely.

### 4.4 CTA / Accent Button (Nav-style)

```
Default:
  bg-[#c6613f] text-[#faf9f5] border-none
  px-4 py-2 min-h-[2.25rem] rounded-lg
  font-sans text-base leading-none tracking-[-0.005em]
  inline-flex items-center justify-center
  transition-colors duration-200

Hover:
  hover:bg-[#d97757]

Active:
  active:scale-[0.98]

Dark mode:
  Same -- accent color does not change between themes
```

### 4.5 Send Button (claude.ai / Cowork dual-state)

The send button has **two distinct states** that communicate intent, not just function.

#### Idle State — Orange Capsule with Text

```
Container:
  bg-[#ae5630] text-white rounded-full
  h-8 px-3.5
  flex items-center gap-1.5
  transition-all duration-200 ease-[cubic-bezier(0.165,0.85,0.45,1)]

Content:
  <ArrowRight className="w-3.5 h-3.5 text-white" />
  <span className="text-[12px] font-medium">发送</span>   {/* or "Let's go" */}

Hover:
  hover:bg-[#c4633a]

Disabled (no input):
  opacity-40 cursor-not-allowed
```

**Why capsule with text?** The pill shape with a verb creates a sense of ceremony — you're not just clicking an icon, you're initiating a task. The word grounds the affordance.

#### Running State — Circular Stop / Spinner

```
Container:
  bg-[#ae5630] text-white rounded-full
  w-8 h-8 shrink-0
  flex items-center justify-center
  transition-all duration-200

Content (spinner variant):
  <svg className="w-4 h-4 animate-spin text-white opacity-90" ... />

Content (stop variant):
  <Square className="w-3.5 h-3.5 text-white fill-white" />

Active:
  active:scale-[0.96]
```

**Transition between states:** Use `transition-all` so the button smoothly morphs from wide capsule to square circle when a task starts.

```tsx
// Implementation pattern
<button
  className={cn(
    "flex shrink-0 items-center justify-center rounded-full bg-[#ae5630] text-white transition-all duration-200 hover:bg-[#c4633a] active:scale-[0.98]",
    isRunning
      ? "h-8 w-8"                              // circle: running
      : "h-8 gap-1.5 px-3.5"                   // capsule: idle
  )}
>
  {isRunning ? (
    <Square className="h-3.5 w-3.5 fill-white text-white" />
  ) : (
    <>
      <ArrowRight className="h-3.5 w-3.5" />
      <span className="text-[12px] font-medium">发送</span>
    </>
  )}
</button>
```

### 4.6 Input Field

```
Default:
  bg-white text-[#1a1a18] border border-[#1414131a]
  px-3 py-2 rounded-lg text-base
  outline-none
  transition-colors duration-200
  placeholder:text-[#b0aea5]

Hover:
  hover:border-[#14141333]

Focus:
  focus:border-[#141413] focus:ring-1 focus:ring-[#141413]

Disabled:
  opacity-50 cursor-not-allowed bg-[#f0eee6]

Dark mode:
  dark:bg-[#3d3d3a] dark:text-[#eee] dark:border-[#faf9f51a]
  dark:hover:border-[#faf9f533]
  dark:focus:border-[#faf9f5] dark:focus:ring-[#faf9f5]
  dark:placeholder:text-[#87867f]
```

**Do:** Keep input backgrounds clean (white in light, slate-medium in dark).
**Don't:** Use colored backgrounds or heavy borders on inputs.

### 4.7 Textarea / Composer

```
Outer container:
  bg-white rounded-2xl p-0.5
  shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.035)]
  max-w-3xl mx-auto w-full

  dark:bg-[#1f1e1b]

Inner textarea:
  bg-transparent text-[#1a1a18] outline-none
  w-full resize-none
  placeholder:text-[#b0aea5]

  dark:text-[#eee]

Bottom bar:
  flex items-center justify-between px-3 py-2
```

**Do:** Auto-expand height as content grows. Keep the composer fixed at viewport bottom.
**Don't:** Show a visible border on the textarea -- the outer container's shadow provides the visual boundary.

### 4.8 Card (Default)

```
Default:
  bg-white border border-[#1414131a] rounded-2xl p-6
  shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]

Dark mode:
  dark:bg-[#3d3d3a] dark:border-[#faf9f51a]
```

**Do:** Use `#ffffff` card on `#faf9f5` page background for subtle lift.
**Don't:** Use heavy drop shadows or sharp elevation.

### 4.9 Card (Interactive / Hoverable)

```
Default:
  bg-white border border-[#1414131a] rounded-2xl p-6
  shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]
  cursor-pointer
  transition-all duration-200

Hover:
  hover:border-[#14141333] hover:bg-[#f0eee6]

Active:
  active:scale-[0.99]

Dark mode:
  dark:bg-[#3d3d3a] dark:border-[#faf9f51a]
  dark:hover:border-[#faf9f533] dark:hover:bg-[#14141333]
```

### 4.10 Faded Card Variant

```
Default:
  bg-[#1414131a] border border-[#1414131a] rounded-2xl p-6
  transition-colors duration-200

Hover:
  hover:bg-[#14141333]

Dark mode:
  dark:bg-[#faf9f51a] dark:border-[#faf9f51a]
  dark:hover:bg-[#faf9f533]
```

### 4.11 Sidebar Navigation Item

```
Default:
  px-3 py-2 rounded-lg text-sm
  text-[#141413] font-sans
  cursor-pointer
  transition-colors duration-200
  truncate

Hover:
  hover:bg-[#f0eee6]

Active / Selected:
  bg-[#f0eee6] font-medium

Dark mode:
  dark:text-[#faf9f5]
  dark:hover:bg-[#3d3d3a]
  dark:active:bg-[#3d3d3a]
```

**Do:** Truncate long text with ellipsis.
**Don't:** Use icons on every sidebar item -- keep it text-focused.

### 4.12 Session / Conversation List Item (Flat Row)

The Cowork/claude.ai pattern uses **flat rows without individual card borders**. Each row is a positioned container with an absolute left-accent bar for the active state.

```
Outer wrapper:
  relative group

Default row:
  relative flex items-center gap-2.5
  px-3 py-2.5 rounded-lg
  text-sm text-[#141413] truncate
  cursor-pointer
  transition-colors duration-150

Hover:
  hover:bg-[#1414130d]   {/* ~5% opacity */}

Selected / Active:
  bg-[#1414130d]
  + absolute left-0 top-1/2 -translate-y-1/2
    h-[60%] w-[3px] rounded-full bg-[#ae5630]
  {/* accent-colored left bar, NOT accent text */}

Action buttons (tag / ···):
  opacity-0 group-hover:opacity-100
  ml-auto flex gap-0.5

Dark mode:
  dark:text-[#faf9f5]
  dark:hover:bg-[#faf9f50d]
  dark:active:bg-[#faf9f50d]
  dark:active-bar: bg-[#d97757]  {/* Clay — warmer on dark */}
```

**Critical rule:** Active session is indicated by **left accent bar + subtle background**, never by changing text to accent color or adding a card-style border.

```tsx
// Correct active state pattern
<div className="relative group">
  {isActive && (
    <div className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-full bg-[#ae5630]" />
  )}
  <div className={cn(
    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors duration-150",
    isActive ? "bg-[#1414130d]" : "hover:bg-[#1414130d]"
  )}>
    <span className="flex-1 truncate text-sm">{title}</span>
    <div className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100">
      {/* action buttons */}
    </div>
  </div>
</div>
```

### 4.13 Modal / Dialog

```
Overlay:
  fixed inset-0 bg-black/40 z-50
  flex items-center justify-center

Panel:
  bg-white rounded-2xl p-6 max-w-lg w-full mx-4
  shadow-[0_16px_48px_rgba(0,0,0,0.12)]
  animate-in fade-in zoom-in-95 duration-200

Dark mode:
  dark:bg-[#2b2a27]

Title:
  text-lg font-semibold text-[#141413] mb-4
  dark:text-[#faf9f5]

Close button:
  absolute top-4 right-4
  text-[#87867f] hover:text-[#141413]
  dark:hover:text-[#faf9f5]
```

### 4.14 Dropdown Menu Item

```
Default:
  px-3 py-2 text-sm text-[#141413] font-sans
  cursor-pointer rounded-md
  transition-colors duration-150

Hover:
  hover:bg-[#f0eee6]

Disabled:
  opacity-50 cursor-not-allowed

Separator:
  h-px bg-[#1414131a] my-1

Dark mode:
  dark:text-[#faf9f5]
  dark:hover:bg-[#3d3d3a]
```

### 4.15 Badge / Tag

```
Default:
  inline-flex items-center px-2.5 py-0.5
  text-xs font-medium rounded-full
  bg-[#f0eee6] text-[#141413]

Accent variant:
  bg-[#d9775714] text-[#c6613f]

Success variant:
  bg-[#788c5d14] text-[#788c5d]

Info variant:
  bg-[#6a9bcc14] text-[#6a9bcc]

Dark mode:
  dark:bg-[#faf9f51a] dark:text-[#faf9f5]
```

**Do:** Use for category labels, status indicators, metadata tags.
**Don't:** Use background-heavy solid-color badges -- keep them subtle.

### 4.16 Progress Bar

```
Track:
  h-1.5 w-full bg-[#f0eee6] rounded-full overflow-hidden

  dark:bg-[#3d3d3a]

Fill:
  h-full bg-[#ae5630] rounded-full
  transition-all duration-300 ease-out

Indeterminate:
  animate-[indeterminate_1.5s_ease-in-out_infinite]
  w-1/3
```

### 4.17 Avatar

```
Default:
  w-8 h-8 rounded-full bg-[#f0eee6]
  flex items-center justify-center
  text-sm font-medium text-[#141413]
  overflow-hidden

  dark:bg-[#3d3d3a] dark:text-[#faf9f5]

Image:
  w-full h-full object-cover

Sizes:
  Small: w-6 h-6 text-xs
  Default: w-8 h-8 text-sm
  Large: w-10 h-10 text-base
  XL: w-12 h-12 text-lg
```

### 4.18 Divider / Separator

```
Horizontal:
  h-px w-full bg-[#1414131a]

  dark:bg-[#faf9f51a]

With label:
  flex items-center gap-4
  [line]: flex-1 h-px bg-[#1414131a]
  [label]: text-xs text-[#b0aea5] font-sans uppercase tracking-wider
```

### 4.19 Section Header Label

```
Default:
  text-xs font-medium uppercase tracking-wider
  text-[#87867f] font-sans
  mb-3

  dark:text-[#87867f]
```

**Do:** Use for sidebar section labels ("Projects", "Recent"), form group titles, metadata headers.
**Don't:** Use large text or bold weight -- these should be quiet wayfinding cues.

### 4.20 User Message Bubble

```
Container:
  bg-[#DDD9CE] rounded-2xl px-4 py-3
  text-[#1a1a18] text-base

  dark:bg-[#393937] dark:text-[#eee]
```

### 4.21 Claude Response (No Bubble)

```
Container:
  bg-transparent px-0 py-3
  text-[#1a1a18] font-serif text-base leading-relaxed

  dark:text-[#eee]
```

**Key:** Claude's responses have NO background bubble -- they render directly on the page surface. Only user messages get bubbles.

### 4.22 Pill / Capsule Tab Navigation

Observed in Cowork's `Chat | Cowork | Code` top nav and claude.ai's sub-navigation.

```
Outer container (pill group):
  inline-flex items-center rounded-full
  bg-[#1414130a]   {/* ~4% dark tint — barely-there background */}
  p-[3px] gap-0
  dark:bg-[#faf9f50a]

Individual tab:
  px-3 py-1.5 rounded-full
  text-[13px] font-medium font-sans
  transition-all duration-200 ease-[cubic-bezier(0.165,0.85,0.45,1)]
  cursor-pointer

Inactive tab:
  text-[#87867f]
  hover:text-[#141413]
  dark:text-[#9a9893]
  dark:hover:text-[#faf9f5]

Active tab (CRITICAL — use background elevation, NOT accent color):
  bg-white text-[#141413]
  shadow-[0_1px_3px_rgba(0,0,0,0.08)]
  dark:bg-[#3d3d3a] dark:text-[#faf9f5]
  dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)]
```

**The rule:** Active tab gets a **white/light card background** against the gray pill group background. The selected state is communicated by elevation (background lift), not by accent color or underlines.

```tsx
// Correct pattern
<div className="inline-flex items-center rounded-full bg-black/[0.04] p-[3px]">
  {tabs.map(tab => (
    <button
      key={tab.id}
      className={cn(
        "rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
        isActive(tab)
          ? "bg-white text-[#141413] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
          : "text-[#87867f] hover:text-[#141413]"
      )}
    >
      {tab.label}
    </button>
  ))}
</div>
```

### 4.23 Dark Mode Welcome Screen (Ritual Design / 仪式感)

The "new session" entry point uses a full-immersion dark layout that prioritizes emotional impact over information density.

#### Background

```css
/* Subtle dot/grid texture on dark */
background-color: #1c1b18;   /* warm very dark brown */
background-image: radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px);
background-size: 24px 24px;
```

Or in Tailwind with a custom utility:
```
bg-[#1c1b18] [background-image:radial-gradient(circle,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:24px_24px]
```

#### Headline

```
text-[42px] font-bold font-sans text-white leading-tight
{/* NOT serif — headline uses bold sans-serif for impact */}
```

> Example: `Let's knock something off your list`

The headline is a verb phrase / invitation, not a feature description. It creates ritual — you are about to do something meaningful.

#### Task Suggestion List (Photo-Thumbnail Icons)

```
Category header:
  flex items-center gap-2 text-[12px] text-white/50 font-medium uppercase tracking-wide mb-1

Row item:
  flex items-center gap-3
  py-3.5
  border-b border-white/[0.06]   {/* hairline divider, very subtle */}
  cursor-pointer
  transition-colors duration-150
  hover:bg-white/[0.04] hover:rounded-lg

  Icon container:
    w-8 h-8 rounded-[6px] overflow-hidden shrink-0
    bg-white/[0.08]   {/* placeholder while image loads */}
    <img src={thumbnailUrl} className="w-full h-full object-cover" />
    {/* Photographic thumbnail — NOT a vector icon */}

  Label:
    text-[14px] text-white/80 font-normal
    flex-1 truncate
```

**Why photos?** Photo thumbnails make tasks feel relatable and human — a "Plan vacation" task shows a destination photo; "Organize inbox" shows a desk photo. The specificity creates emotional resonance that abstract icons cannot.

### 4.24 Work Panel Three-Section Sidebar

Observed in Cowork's active session right panel. The temporal order matters: past → present → live.

```
Sidebar container:
  flex flex-col gap-0
  w-64 shrink-0
  border-l border-[#1414130a]
  bg-[#faf9f5]
  overflow-y-auto

Section header:
  px-4 py-2
  text-[11px] font-semibold uppercase tracking-wider text-[#87867f]
  flex items-center justify-between

Section divider between regions:
  h-px bg-[#1414130a] mx-4
```

#### Section 1: Progress (Temporal / Active)

```
Step item:
  flex items-center gap-2.5 px-4 py-1.5
  text-[12px]

Status dot:
  w-2 h-2 rounded-full shrink-0
  Colors by tool type (see 4.25):
    completed → bg-[#787873]   {/* neutral gray */}
    active    → animate-pulse bg-[#ae5630]
    pending   → bg-[#b0aea5]

Step label:
  text-[#141413] leading-snug
  completed: text-[#87867f] line-through decoration-[#b0aea5]
```

#### Section 2: Documents (Past / Completed)

```
File item:
  flex items-center gap-2.5 px-4 py-1.5
  cursor-pointer hover:bg-[#f0eee6] rounded-md transition-colors

File icon container:
  w-6 h-6 rounded-md bg-[#1414130a] flex items-center justify-center shrink-0

File name:
  text-[12px] font-medium text-[#141413] truncate

Reveal-in-folder button:
  ml-auto opacity-0 group-hover:opacity-100
  w-7 h-7 rounded-md hover:bg-[#e8e6dc]
```

#### Section 3: Scratchpad (Live / Writing Now)

```
Live file item:
  flex items-center gap-2.5 px-4 py-1.5

Spinner container:
  w-6 h-6 rounded-md bg-[#1414130a] flex items-center justify-center shrink-0

Spinner:
  w-4 h-4 animate-spin text-[#ae5630]/60

File name: text-[12px] font-medium text-[#141413]
Status text: text-[10px] text-[#87867f]  — "写入中..."
```

**Design principle:** The three sections tell a story — Scratchpad (happening now) → Documents (just finished) → Progress (overall task arc). This is a **temporal information architecture**, not just feature grouping.

### 4.25 Progress Step with Status Dot

```tsx
// Status dot colors (avoid tool-specific accent colors — use neutral hierarchy)
const dotColor = {
  completed: 'bg-[#787873]',          // muted gray — done, not highlighted
  active:    'bg-[#ae5630] animate-pulse',  // product orange — only 1 at a time
  pending:   'bg-[#d1cfc5]',          // cloud light — not yet reached
  error:     'bg-[#c46686]',          // fig — error/failure
};

// Step row
<div className="flex items-center gap-2.5 px-4 py-1.5">
  <div className={cn("h-2 w-2 shrink-0 rounded-full", dotColor[step.status])} />
  <span className={cn(
    "flex-1 truncate text-[12px] leading-snug",
    step.status === 'completed' && "text-[#87867f] line-through decoration-[#b0aea5]",
    step.status === 'active'    && "font-medium text-[#141413]",
    step.status === 'pending'   && "text-[#b0aea5]",
  )}>
    {step.label}
  </span>
</div>
```

**Rule:** Only the active step gets a colored dot. Completed steps are crossed out in muted gray. Pending steps are near-invisible. This creates a clear visual "you are here."

---

## Section 5: Interaction & Motion

### 5.1 Transition Duration Standards

| Context | Duration | Tailwind |
|---------|----------|----------|
| Fast feedback (hover color) | 150ms | `duration-150` |
| Standard interaction | 200ms | `duration-200` |
| Smooth transition (panels, modals) | 300ms | `duration-300` |
| Page-level animation | 300-500ms | `duration-300` to `duration-500` |

### 5.2 Easing Curves

| Name | Value | Usage |
|------|-------|-------|
| Default ease | `ease` (CSS default) | Button hover, border transitions |
| Smooth out | `ease-out` | Fade-in, slide-in, stagger reveals |
| Anthropic custom | `cubic-bezier(0.165, 0.85, 0.45, 1)` | Claude.ai signature smooth ease (between ease-out and ease-in-out) |
| Spring-like | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful scale/bounce (use sparingly) |

```
Tailwind custom easing:
  ease-[cubic-bezier(0.165,0.85,0.45,1)]
```

### 5.3 What Gets Animation vs What Does Not

**Animate:**
- Button hover/active state (color + scale)
- Card hover (border opacity)
- Modal open/close (fade + scale)
- Page load content (staggered reveal)
- Sidebar collapse/expand
- Progress bar fill
- Focus ring appearance

**Do NOT animate:**
- Text content changes
- Layout reflows (use instant transitions)
- Scroll position (let browser handle natively)
- Input value changes
- Data table row additions (unless small list)

### 5.4 Hover Scale Effects

```
Button press:
  active:scale-[0.98]
  transition-transform duration-150

Card press:
  active:scale-[0.99]
  transition-transform duration-150
```

Anthropic does NOT use hover scale-up (no `hover:scale-105`). Scale is only used on active/press as subtle tactile feedback.

### 5.5 Focus Ring Style

```
Standard:
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-[#141413]
  focus-visible:ring-offset-2

  dark:focus-visible:ring-[#faf9f5]

Shadow-based (alternative from anthropic.com):
  focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_#141413]
```

Focus width: 2px. Outer offset: 4px. Inner offset: -2px.

### 5.6 Loading States

```
Spinner:
  w-4 h-4 border-2 border-[#b0aea5] border-t-[#141413]
  rounded-full animate-spin

  dark:border-[#3d3d3a] dark:border-t-[#faf9f5]

Skeleton:
  bg-[#f0eee6] rounded-lg animate-pulse

  dark:bg-[#3d3d3a]

Streaming indicator (Claude typing):
  Three pulsing dots, 0.6s animation-delay stagger
  bg-[#b0aea5] w-1.5 h-1.5 rounded-full
```

### 5.7 Staggered Reveal Pattern

```css
.item {
  animation: fadeSlideIn 0.3s ease-out forwards;
  opacity: 0;
}
.item:nth-child(1) { animation-delay: 0ms; }
.item:nth-child(2) { animation-delay: 80ms; }
.item:nth-child(3) { animation-delay: 160ms; }
.item:nth-child(4) { animation-delay: 240ms; }

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Rule:** One well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions. 80-100ms between items. Never exceed 5 stagger steps.

### 5.8 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Always respect `prefers-reduced-motion`. Strip transform animations, keep opacity transitions.

---

## Section 6: Anthropic Design Philosophy

### 6.1 The Five Defining Principles

**1. Warm Neutrals, Never Cold Whites**

The signature Anthropic trait. `#faf9f5` ivory replaces pure white. `#141413` near-black replaces pure `#000000`. Even dark mode uses warm darks (`#2b2a27`) instead of blue-tinged blacks. The palette draws from natural materials: clay, oat, kraft, ivory -- earth tones that make technology feel human.

**2. Extreme Subtlety in Depth**

Shadows use three layers of near-transparent black (1.2%, 2%, 4% opacity). Borders are 10% opacity, increasing to 20% on hover. This is the opposite of Material Design's bold elevation or flat design's zero depth -- it is depth so subtle you feel it more than see it.

**3. Serif for Warmth, Sans for Function**

Anthropic uses serif fonts (Tiempos Text, Anthropic Serif, Lora) for body content and AI responses, which is deliberately counter-industry. Every other major AI product (ChatGPT, Gemini, Copilot) uses sans-serif. The serif choice signals warmth, editorial quality, and thoughtfulness. Sans-serif is reserved for UI controls, buttons, and labels.

**4. Restrained, Purposeful Motion**

No gratuitous animation. Transitions are 200-300ms. No parallax scrolling. No bouncing loaders. No confetti. Every animation serves exactly one purpose: confirming that an interaction was registered. The exception is page-load staggered reveals, which establish visual hierarchy.

**5. Generous Breathing Room**

Section gaps of 160px. Page-top padding of 192px. Content width capped at 768px for readability. The interface feels spacious, even luxurious. Information density is deliberately low. The design says "take your time" rather than "process this quickly."

### 6.2 "AI Slop" Anti-Patterns to Avoid

These are the specific patterns that make UI look like generic AI output:

| AI Slop Pattern | What It Looks Like | Anthropic Alternative |
|----------------|--------------------|-----------------------|
| Purple-to-blue gradient | `bg-gradient-to-r from-purple-500 to-blue-500` | Solid warm ivory `bg-[#faf9f5]` or warm dark `bg-[#141413]` |
| Inter font everywhere | `font-sans` (system default) | Distinctive serif body + sans UI labels |
| Pure white background | `bg-white` as page bg | Warm ivory `bg-[#faf9f5]` |
| Heavy drop shadows | `shadow-lg` / `shadow-xl` | Three-layer micro-shadows at 1-4% opacity |
| Solid colored badges | `bg-blue-500 text-white rounded-full` | Transparent tinted badges `bg-[#6a9bcc14] text-[#6a9bcc]` |
| Accent lines under titles | `border-b-2 border-blue-500` | No accent lines. Ever. |
| Rounded corners everywhere | `rounded-full` on everything | Intentional radius: 4px tags, 8px buttons, 16px cards |
| Evenly-distributed colors | Equal amounts of 5+ colors | One dominant neutral + one sharp accent |
| Blue link color | `text-blue-600` | Theme text color with opacity change on hover |
| Card with colored left border | `border-l-4 border-green-500` | Subtle full border at 10% opacity |
| Gradient text | `bg-clip-text text-transparent bg-gradient-to-r` | Solid color text. No gradients on text. |
| Neon glow effects | `shadow-[0_0_15px_rgba(139,92,246,0.5)]` | No glows. Period. |

### 6.3 What Makes Anthropic's UI Feel Warm

1. **Color temperature:** Every color leans warm. Even the "whites" are yellowish. Even the "blacks" have brown undertones. There is not a single cool blue-gray in the core palette.

2. **Typography choice:** Serif fonts have been associated with books, letters, and human communication for centuries. Sans-serif fonts feel institutional. By using serif for the AI's responses, Anthropic makes Claude feel like it is writing you a letter, not generating a report.

3. **Surface texture:** The layered ivory backgrounds (`#faf9f5` page, `#ffffff` card, `#f0eee6` sidebar) create a paper-like quality. The depth feels like stacked paper, not glass panels.

4. **Absence of chrome:** No glossy buttons, no gradient fills, no metallic effects. The interface feels matte, like uncoated paper stock.

5. **Natural accent colors:** The accent palette names tell the story -- clay, oat, kraft, cactus, heather. These are materials you can touch, not synthetic neon.

### 6.4 How to Use Serifs Correctly

**Use serif for:**
- AI response body text
- Long-form content / articles
- Hero headlines and display text (serif display variants)
- Quotes and testimonials
- Editorial/magazine layouts

**Use sans-serif for:**
- Button labels
- Navigation links
- Form labels and input text
- Sidebar items
- Metadata (dates, counts, status text)
- Tooltips
- Small UI text (12-14px)

**Never:**
- Mix two serif fonts on the same page
- Use serif at sizes below 14px (legibility degrades)
- Use serif for monospace/code contexts
- Use a decorative/script serif -- stick to text serifs

### 6.5 Shadow Philosophy

Anthropic's shadow approach: "If you can consciously notice the shadow, it's too heavy."

**The three-layer card shadow:**
```css
box-shadow:
  0 2px 2px rgba(0, 0, 0, 0.012),   /* tight, barely visible */
  0 4px 4px rgba(0, 0, 0, 0.02),     /* medium spread */
  0 16px 24px rgba(0, 0, 0, 0.04);   /* wide, atmospheric */
```

This creates depth perception without visible shadow edges. The three layers simulate how light naturally diffuses -- tight ambient occlusion near the edge, then progressively wider and softer.

**When to use shadows:**
- Cards that sit above the page surface
- Composer/input areas that need visual prominence
- Modals and overlays
- Floating menus

**When NOT to use shadows:**
- Buttons (use border + background change instead)
- Sidebar items
- Table rows
- Inline elements
- Anything in dark mode (shadows are invisible against dark backgrounds; use border opacity instead)

---

## Section 7: Quick Reference Cheatsheet

### 7.1 Most Common Tailwind Classes by UI Role

| Role | Tailwind Classes |
|------|-----------------|
| Page background | `bg-[#faf9f5] dark:bg-[#2b2a27]` |
| Card | `bg-white dark:bg-[#3d3d3a] border border-[#1414131a] dark:border-[#faf9f51a] rounded-2xl p-6 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]` |
| Primary text | `text-[#141413] dark:text-[#faf9f5]` |
| Muted text | `text-[#6b6a68] dark:text-[#9a9893]` |
| Subtle text | `text-[#87867f]` |
| Disabled text | `text-[#b0aea5]` |
| Serif body | `font-serif text-base leading-relaxed` |
| Sans UI label | `font-sans text-sm` |
| Primary button | `bg-[#141413] text-[#faf9f5] hover:bg-[#3d3d3a] active:scale-[0.98] px-4 py-2 rounded-lg border border-[#141413] transition-colors duration-200` |
| Accent CTA | `bg-[#c6613f] text-[#faf9f5] hover:bg-[#d97757] px-4 py-2 rounded-lg transition-colors duration-200` |
| Input field | `bg-white dark:bg-[#3d3d3a] border border-[#1414131a] dark:border-[#faf9f51a] rounded-lg px-3 py-2 outline-none focus:border-[#141413] dark:focus:border-[#faf9f5] transition-colors duration-200` |
| Divider | `h-px bg-[#1414131a] dark:bg-[#faf9f51a]` |
| Section label | `text-xs font-medium uppercase tracking-wider text-[#87867f]` |
| Sidebar item | `px-3 py-2 rounded-lg text-sm hover:bg-[#f0eee6] dark:hover:bg-[#3d3d3a] transition-colors duration-150 truncate` |
| Badge | `inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-[#f0eee6] dark:bg-[#faf9f51a] text-[#141413] dark:text-[#faf9f5]` |
| User bubble | `bg-[#DDD9CE] dark:bg-[#393937] rounded-2xl px-4 py-3` |

### 7.2 Five Most Common UI Patterns (Copy-Pasteable)

#### Pattern 1: Page Shell

```tsx
<div className="min-h-screen bg-[#faf9f5] dark:bg-[#2b2a27] text-[#141413] dark:text-[#faf9f5] font-serif">
  {/* Sidebar */}
  <aside className="fixed inset-y-0 left-0 w-64 bg-[#faf9f5] dark:bg-[#2b2a27] border-r border-[#1414131a] dark:border-[#faf9f51a] p-4">
    <nav className="space-y-1">
      {/* Sidebar items */}
    </nav>
  </aside>

  {/* Main content */}
  <main className="ml-64 flex flex-col items-center px-4 pt-16 pb-32">
    <div className="w-full max-w-3xl">
      {/* Content */}
    </div>
  </main>
</div>
```

#### Pattern 2: Card Grid

```tsx
<section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items.map((item) => (
    <div
      key={item.id}
      className="bg-white dark:bg-[#3d3d3a] border border-[#1414131a] dark:border-[#faf9f51a] rounded-2xl p-6 shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] hover:border-[#14141333] dark:hover:border-[#faf9f533] transition-colors duration-200 cursor-pointer"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-[#87867f] mb-2">
        {item.category}
      </p>
      <h3 className="text-lg font-semibold font-sans mb-2">{item.title}</h3>
      <p className="text-sm text-[#6b6a68] dark:text-[#9a9893] leading-relaxed">
        {item.description}
      </p>
    </div>
  ))}
</section>
```

#### Pattern 3: Chat Composer (claude.ai style)

```tsx
<div className="fixed bottom-0 left-64 right-0 p-4">
  <div className="mx-auto max-w-3xl">
    <div className="rounded-2xl bg-white dark:bg-[#1f1e1b] p-0.5 shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.035)]">
      <textarea
        placeholder="How can I help you today?"
        className="w-full resize-none bg-transparent px-4 py-3 text-[#1a1a18] dark:text-[#eee] outline-none placeholder:text-[#b0aea5]"
        rows={1}
      />
      <div className="flex items-center justify-between px-3 py-2">
        <button className="rounded-lg border border-[#00000015] px-3 py-1.5 text-sm hover:bg-[#f5f5f0] dark:hover:bg-[#3d3d3a] transition-colors duration-150">
          Attach
        </button>
        <button className="rounded-lg bg-[#ae5630] p-2 text-white hover:bg-[#c4633a] active:scale-[0.98] transition-all duration-200">
          <ArrowUpIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</div>
```

#### Pattern 4: Settings / Form Section

```tsx
<div className="space-y-8">
  {/* Section */}
  <div>
    <h2 className="text-xs font-medium uppercase tracking-wider text-[#87867f] mb-4">
      Account Settings
    </h2>
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-sans font-medium text-[#141413] dark:text-[#faf9f5] mb-1.5">
          Display Name
        </label>
        <input
          type="text"
          className="w-full bg-white dark:bg-[#3d3d3a] border border-[#1414131a] dark:border-[#faf9f51a] rounded-lg px-3 py-2 text-base outline-none focus:border-[#141413] dark:focus:border-[#faf9f5] transition-colors duration-200 placeholder:text-[#b0aea5]"
          placeholder="Your name"
        />
      </div>
      <div className="h-px bg-[#1414131a] dark:bg-[#faf9f51a]" />
      {/* More fields */}
    </div>
  </div>
</div>
```

#### Pattern 5: Modal Dialog

```tsx
{/* Overlay */}
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
  {/* Panel */}
  <div className="w-full max-w-lg mx-4 bg-white dark:bg-[#2b2a27] rounded-2xl p-6 shadow-[0_16px_48px_rgba(0,0,0,0.12)]">
    {/* Header */}
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold font-sans text-[#141413] dark:text-[#faf9f5]">
        Dialog Title
      </h2>
      <button className="text-[#87867f] hover:text-[#141413] dark:hover:text-[#faf9f5] transition-colors duration-150">
        <XIcon className="h-5 w-5" />
      </button>
    </div>

    {/* Body */}
    <p className="text-sm text-[#6b6a68] dark:text-[#9a9893] leading-relaxed mb-6">
      Dialog content goes here.
    </p>

    {/* Actions */}
    <div className="flex justify-end gap-3">
      <button className="px-4 py-2 rounded-lg border border-[#1414131a] dark:border-[#faf9f51a] text-sm hover:border-[#141413] dark:hover:border-[#faf9f5] transition-colors duration-200">
        Cancel
      </button>
      <button className="px-4 py-2 rounded-lg bg-[#141413] dark:bg-[#faf9f5] text-[#faf9f5] dark:text-[#141413] text-sm hover:bg-[#3d3d3a] dark:hover:bg-[#f0eee6] active:scale-[0.98] transition-all duration-200">
        Confirm
      </button>
    </div>
  </div>
</div>
```

### 6.6 Flat Rows, Not Card-Per-Item

One of the clearest separators between generic AI UI and Anthropic's style is how lists are handled.

| Generic (AI Slop) | Anthropic / Cowork |
|-------------------|--------------------|
| Each item: `border rounded-xl p-4 shadow-sm` | Each item: `px-3 py-2.5 hover:bg-black/5` |
| 8–16px gap between cards | 0 gap, continuous flow |
| Individual item backgrounds | Shared surface background |
| Border + shadow per item | Hover state only — no persistent chrome |
| Active: accent-colored border | Active: subtle bg + left accent bar |

**Apply flat rows to:**
- Conversation/session lists in sidebar
- File lists in work panels
- Menu items and dropdowns
- Settings option lists

**Keep card style for:**
- Feature showcase grids (marketing)
- Task suggestion grids on welcome screen (when fewer items, grid layout)
- Pricing / plan selector
- Content that stands alone (single article, project, document)

### 6.7 Ritual Design (仪式感)

Anthropic's product entry points are designed as rituals, not utilities. The welcome screen and new-session flow deliberately create a sense of occasion.

**Characteristics of ritual design:**
1. **Invitation language** — "Let's knock something off your list" is a verb invitation, not a feature label ("New Chat")
2. **Reduced chrome** — No sidebar, fewer elements = higher focus = higher stakes feeling
3. **Purposeful darkness** — Dark welcome screens create a theatrical separation from "browsing mode" to "work mode"
4. **Textured surfaces** — Subtle dot/grid patterns on dark backgrounds add material depth, preventing the "floating in void" feeling of pure black UIs
5. **The single orange focal point** — On a dark background with warm neutral elements, one orange button (`#ae5630`) becomes the entire visual destination

**Anti-ritual patterns (avoid):**
- Welcome screens that look like dashboards (too many links, stats, menus)
- Immediate feature lists before the user has oriented
- Generic sans-serif body text in the headline ("What can I help you with today?" → bland)
- Multiple CTAs competing on the same screen

### 6.8 Active State: Elevation, Not Accent

This is the single most diagnostic pattern that separates Anthropic-style UIs from generic ones.

| Context | Generic Approach | Anthropic Approach |
|---------|-----------------|-------------------|
| Tab navigation | `text-blue-600 border-b-2 border-blue-600` | `bg-white shadow-sm` on pill background |
| Sidebar session row | `text-accent font-bold` | `bg-black/5` + `w-[3px] rounded-full bg-[#ae5630]` left bar |
| Bottom nav icon | `text-accent` (colored icon) | `bg-black/8 rounded-lg` (tinted background) |
| Dropdown item selected | `text-blue-600` | Checkmark icon, same text color |

**The principle:** Selection is communicated through **spatial elevation** (lighter background, or a structural indicator like a left bar), not through color change. Color is reserved for interactive affordances (send button, links), not state.

---

## Appendix A: Shadow Reference

| Name | CSS Value | Usage |
|------|-----------|-------|
| Card (3-layer) | `0 2px 2px rgba(0,0,0,0.012), 0 4px 4px rgba(0,0,0,0.02), 0 16px 24px rgba(0,0,0,0.04)` | Standard card elevation |
| Composer | `0 0.25rem 1.25rem rgba(0,0,0,0.035)` | Input/composer float |
| Modal | `0 16px 48px rgba(0,0,0,0.12)` | Dialog overlay |
| Small UI | `0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.1)` | Dropdowns, tooltips |
| Focus ring | `0 0 0 2px #fff` | Focus state outer |
| None | `none` | Flat elements, dark mode cards |

## Appendix B: Responsive Breakpoints

| Breakpoint | Tailwind | Type |
|-----------|----------|------|
| >= 768px | `md:` | Tablet+ (desktop styles begin) |
| <= 991px | custom | Tablet and below |
| <= 767px | `max-md:` | Mobile landscape and below |
| <= 479px | custom | Mobile portrait |

## Appendix C: CSS Variables (Complete Reference)

```css
:root {
  /* ---- Core Palette ---- */
  --color-dark: #141413;
  --color-light: #faf9f5;
  --color-white: #ffffff;
  --color-mid-gray: #b0aea5;
  --color-light-gray: #e8e6dc;

  /* ---- Accent ---- */
  --color-accent-orange: #d97757;
  --color-accent-blue: #6a9bcc;
  --color-accent-green: #788c5d;
  --color-cta: #c6613f;
  --color-cta-hover: #d97757;
  --color-product-accent: #ae5630;
  --color-product-accent-hover: #c4633a;

  /* ---- Surfaces ---- */
  --surface-page: #faf9f5;
  --surface-card: #ffffff;
  --surface-secondary: #f0eee6;
  --surface-secondary-hover: #e8e6dc;
  --surface-user-bubble: #DDD9CE;
  --surface-composer: #ffffff;

  /* ---- Text ---- */
  --text-primary: #141413;
  --text-secondary: #1a1a18;
  --text-muted: #6b6a68;
  --text-subtle: #87867f;
  --text-disabled: #b0aea5;

  /* ---- Borders ---- */
  --border-default: #1414131a;
  --border-hover: #14141333;
  --border-soft: rgba(0, 0, 0, 0.08);

  /* ---- Radius ---- */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* ---- Shadows ---- */
  --shadow-card: 0 2px 2px rgba(0,0,0,0.012), 0 4px 4px rgba(0,0,0,0.02), 0 16px 24px rgba(0,0,0,0.04);
  --shadow-composer: 0 0.25rem 1.25rem rgba(0,0,0,0.035);
  --shadow-modal: 0 16px 48px rgba(0,0,0,0.12);

  /* ---- Transitions ---- */
  --ease-default: ease;
  --ease-smooth: cubic-bezier(0.165, 0.85, 0.45, 1);
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;

  /* ---- Typography ---- */
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-sans: system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
}

/* ---- Dark Mode Overrides ---- */
.dark, [data-theme="dark"] {
  --surface-page: #2b2a27;
  --surface-card: #3d3d3a;
  --surface-secondary: #3d3d3a;
  --surface-user-bubble: #393937;
  --surface-composer: #1f1e1b;

  --text-primary: #faf9f5;
  --text-secondary: #eeeeee;
  --text-muted: #9a9893;

  --border-default: #faf9f51a;
  --border-hover: #faf9f533;
}
```

---

## Sources

- anthropic.com production CSS (Webflow, March 2026)
- claude.ai interface analysis and assistant-ui clone implementation
- **Cowork (claude.ai agent product) live screenshots, March 2026** — primary source for 4.22–4.25, 6.6–6.8
- [Anthropic Brand Guidelines SKILL.md](https://github.com/anthropics/skills/blob/main/skills/brand-guidelines/SKILL.md)
- [Anthropic Frontend Design SKILL.md](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- [Anthropic Cookbook: Prompting for Frontend Aesthetics](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)
- [Claude Blog: Improving Frontend Design Through Skills](https://claude.com/blog/improving-frontend-design-through-skills)
- [jcmrs/claude-visual-style-guide](https://github.com/jcmrs/claude-visual-style-guide)
- [Mobbin: Claude Brand Colors](https://mobbin.com/colors/brand/claude)
- [assistant-ui Claude Clone](https://github.com/assistant-ui/assistant-ui/blob/main/apps/docs/components/examples/claude.tsx)
- [type.today: Styrene at Anthropic](https://type.today/en/journal/anthropic)
