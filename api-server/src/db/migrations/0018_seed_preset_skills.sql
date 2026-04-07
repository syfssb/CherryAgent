-- ============================================================
-- 0018_seed_preset_skills.sql - 预装 Skill 种子数据
-- ============================================================
-- 将 14 个桌面端预装 skill 填充到 preset_skills 表
-- 使用 INSERT ... ON CONFLICT(slug) DO UPDATE 保证幂等

-- ============================================================
-- 1. frontend-design (开发 - 前端设计)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'Frontend Design',
  'frontend-design',
  'Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications.',
  'design',
  $skill_content$This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors.

NEVER use generic AI-generated aesthetics like overused font families, cliched color schemes, predictable layouts.$skill_content$,
  'palette',
  true,
  true,
  1,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 2. skill-creator (开发 - Skill 创建指南)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'Skill Creator',
  'skill-creator',
  'Guide for creating effective skills that extend Claude''s capabilities with specialized knowledge and workflows',
  'development',
  $skill_content$# Skill Creator Guide

Use this skill when users want to create a new skill or update an existing skill.

## Skill Directory Structure

Skills must be created in the app''s user data directory. The path varies by operating system:

| OS | Skills Directory |
|----|------------------|
| **macOS** | `~/Library/Application Support/cherry-agent/skills/skills/{skill-name}/` |
| **Windows** | `%APPDATA%\cherry-agent\skills\skills\{skill-name}\` |
| **Linux** | `~/.config/cherry-agent/skills/skills/{skill-name}/` |

Each skill directory must contain a single file named `SKILL.md`.

## SKILL.md File Format

The `SKILL.md` file must have:
1. YAML frontmatter (between `---` markers)
2. Markdown content with the skill instructions

### Required Frontmatter Fields

```yaml
---
name: skill-name
description: A clear description of what this skill does
category: development
source: user
---
```

### Valid Category Values

- `development` - Programming, coding, technical tools
- `writing` - Content creation, documentation
- `analysis` - Data analysis, research
- `automation` - Workflow automation, scripts
- `communication` - Email, messaging, social media
- `other` - Anything else$skill_content$,
  NULL,
  true,
  true,
  2,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 3. humanizer-zh (写作 - 去除 AI 痕迹)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'Humanizer 中文',
  'humanizer-zh',
  '去除文本中的 AI 生成痕迹。适用于编辑或审阅文本，使其听起来更自然、更像人类书写。',
  'writing',
  $skill_content$# Humanizer-zh: 去除 AI 写作痕迹

你是一位文字编辑，专门识别和去除 AI 生成文本的痕迹，使文字听起来更自然、更有人味。

## 你的任务

当收到需要人性化处理的文本时：

1. **识别 AI 模式** - 扫描常见 AI 写作模式
2. **重写问题片段** - 用自然的替代方案替换 AI 痕迹
3. **保留含义** - 保持核心信息完整
4. **维持语调** - 匹配预期的语气
5. **注入灵魂** - 注入真实的个性

## 核心规则速查

1. **删除填充短语** - 去除开场白和强调性拐杖词
2. **打破公式结构** - 避免二元对比、戏剧性分段
3. **变化节奏** - 混合句子长度
4. **信任读者** - 直接陈述事实
5. **删除金句** - 如果听起来像可引用的语句，重写它

## 需要注意的 AI 词汇

此外、与……保持一致、至关重要、深入探讨、强调、持久的、增强、培养、获得、突出、复杂性、关键、格局、展示、织锦、证明、宝贵的、充满活力的

## 快速检查清单

- 连续三个句子长度相同？打断其中一个
- 段落以简洁的单行结尾？变换结尾方式
- 使用了"此外""然而"等连接词？考虑删除
- 三段式列举？改为两项或四项$skill_content$,
  'pen-tool',
  true,
  true,
  3,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 4. agent-browser (自动化 - 浏览器自动化)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'Agent Browser',
  'agent-browser',
  'Browser automation CLI for AI agents. Use when the user needs to interact with websites, fill forms, click buttons, take screenshots, extract data, or automate any browser task.',
  'automation',
  $skill_content$# Browser Automation with agent-browser

## Core Workflow

1. **Navigate**: `agent-browser open <url>`
2. **Snapshot**: `agent-browser snapshot -i` (get element refs)
3. **Interact**: Use refs to click, fill, select
4. **Re-snapshot**: After navigation or DOM changes

## Essential Commands

```bash
# Navigation
agent-browser open <url>
agent-browser close

# Snapshot
agent-browser snapshot -i

# Interaction
agent-browser click @e1
agent-browser fill @e2 "text"
agent-browser select @e1 "option"
agent-browser press Enter
agent-browser scroll down 500

# Get information
agent-browser get text @e1
agent-browser get url
agent-browser get title

# Wait
agent-browser wait @e1
agent-browser wait --load networkidle

# Capture
agent-browser screenshot
agent-browser pdf output.pdf
```

## Ref Lifecycle

Refs are invalidated when the page changes. Always re-snapshot after clicking links or form submissions.$skill_content$,
  'globe',
  true,
  true,
  4,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 5. file-organizer (自动化 - 文件整理)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'File Organizer',
  'file-organizer',
  'Intelligently organizes your files and folders by understanding context, finding duplicates, suggesting better structures, and automating cleanup tasks.',
  'automation',
  $skill_content$# File Organizer

This skill acts as your personal organization assistant, helping you maintain a clean, logical file structure.

## What This Skill Does

1. **Analyzes Current Structure**: Reviews your folders and files
2. **Finds Duplicates**: Identifies duplicate files across your system
3. **Suggests Organization**: Proposes logical folder structures
4. **Automates Cleanup**: Moves, renames, and organizes files with your approval
5. **Maintains Context**: Makes smart decisions based on file types, dates, and content

## How to Use

```
Help me organize my Downloads folder
Find duplicate files in my Documents folder
Review my project directories and suggest improvements
```

## Instructions

1. Understand the Scope - ask clarifying questions
2. Analyze Current State - review the target directory
3. Identify Organization Patterns - by type, purpose, or date
4. Find Duplicates when requested
5. Propose Organization Plan before making changes
6. Execute Organization after approval
7. Provide Summary and Maintenance Tips$skill_content$,
  'folder',
  true,
  true,
  5,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 6. video-downloader (自动化 - 视频下载)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'Video Downloader',
  'video-downloader',
  'Download YouTube videos with customizable quality and format options. Supports various quality settings, multiple formats, and audio-only downloads as MP3.',
  'automation',
  $skill_content$# YouTube Video Downloader

Download YouTube videos with full control over quality and format settings.

## Quick Start

```bash
python scripts/download_video.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

## Options

- `-q` quality: best (default), 1080p, 720p, 480p, 360p, worst
- `-f` format: mp4 (default), webm, mkv
- `-a` audio-only: download as MP3
- `-o` output directory

## Examples

```bash
# 1080p MP4
python scripts/download_video.py "URL" -q 1080p

# Audio only
python scripts/download_video.py "URL" -a

# 720p WebM to custom directory
python scripts/download_video.py "URL" -q 720p -f webm -o /custom/path
```$skill_content$,
  'download',
  true,
  true,
  6,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 7. pdf (数据 - PDF 处理)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'PDF',
  'pdf',
  'Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms.',
  'data',
  $skill_content$# PDF Processing Guide

## Quick Start

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

text = ""
for page in reader.pages:
    text += page.extract_text()
```

## Python Libraries

- **pypdf**: Merge, split, rotate, extract metadata, password protection
- **pdfplumber**: Text and table extraction with layout preservation
- **reportlab**: Create new PDFs from scratch

## Command-Line Tools

- **pdftotext**: Extract text preserving layout
- **qpdf**: Merge, split, rotate, decrypt
- **pdftk**: Alternative merge/split tool

## Quick Reference

| Task | Best Tool |
|------|-----------|
| Merge PDFs | pypdf |
| Extract text | pdfplumber |
| Extract tables | pdfplumber |
| Create PDFs | reportlab |
| OCR scanned PDFs | pytesseract |
| Fill PDF forms | pdf-lib or pypdf |$skill_content$,
  'file-text',
  true,
  true,
  7,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 8. docx (数据 - Word 文档处理)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'DOCX',
  'docx',
  'Comprehensive document creation, editing, and analysis with support for tracked changes, comments, formatting preservation, and text extraction.',
  'data',
  $skill_content$# DOCX creation, editing, and analysis

## Workflow Decision Tree

### Reading/Analyzing Content
- Text extraction with pandoc
- Raw XML access for comments, complex formatting

### Creating New Document
- Use docx-js (JavaScript/TypeScript)

### Editing Existing Document
- Use Document library (Python) for OOXML manipulation
- Redlining workflow for document review with tracked changes

## Text Extraction

```bash
pandoc --track-changes=all path-to-file.docx -o output.md
```

## Key File Structures

- `word/document.xml` - Main document contents
- `word/comments.xml` - Comments
- `word/media/` - Embedded images and media$skill_content$,
  'file-text',
  true,
  true,
  8,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 9. pptx (数据 - 演示文稿处理)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'PPTX',
  'pptx',
  'Presentation creation, editing, and analysis. Work with .pptx files for creating new presentations, modifying content, working with layouts, and adding speaker notes.',
  'data',
  $skill_content$# PPTX creation, editing, and analysis

## Overview

Create, edit, or analyze .pptx files. A .pptx file is a ZIP archive containing XML files.

## Creating New Presentations

Use the html2pptx workflow:
1. Create HTML slides with proper dimensions
2. Convert to PowerPoint using html2pptx.js
3. Visual validation with thumbnail grids

## Editing Existing Presentations

Work with raw OOXML format:
1. Unpack: `python ooxml/scripts/unpack.py <file> <dir>`
2. Edit XML files
3. Validate: `python ooxml/scripts/validate.py <dir>`
4. Pack: `python ooxml/scripts/pack.py <dir> <file>`

## Using Templates

1. Extract template text and create thumbnails
2. Analyze template and save inventory
3. Create presentation outline
4. Rearrange slides with rearrange.py
5. Extract text inventory
6. Generate replacement text
7. Apply replacements$skill_content$,
  'presentation',
  true,
  true,
  9,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 10. xlsx (数据 - 电子表格处理)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'XLSX',
  'xlsx',
  'Comprehensive spreadsheet creation, editing, and analysis with support for formulas, formatting, data analysis, and visualization.',
  'data',
  $skill_content$# XLSX creation, editing, and analysis

## CRITICAL: Use Formulas, Not Hardcoded Values

Always use Excel formulas instead of calculating values in Python and hardcoding them.

## Common Workflow

1. Choose tool: pandas for data, openpyxl for formulas/formatting
2. Create/Load workbook
3. Modify: Add/edit data, formulas, and formatting
4. Save to file
5. Recalculate formulas: `python recalc.py output.xlsx`
6. Verify and fix any errors

## Financial Models Color Coding

- Blue text: Hardcoded inputs
- Black text: ALL formulas and calculations
- Green text: Links from other worksheets
- Red text: External links
- Yellow background: Key assumptions

## Number Formatting

- Years: Format as text strings
- Currency: Use $#,##0 format
- Percentages: Default to 0.0%
- Negative numbers: Use parentheses$skill_content$,
  'table',
  true,
  true,
  10,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 11. canvas-design (设计 - 视觉设计)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'Canvas Design',
  'canvas-design',
  'Create beautiful visual art in .png and .pdf documents using design philosophy. Use when the user asks to create a poster, piece of art, design, or other static piece.',
  'design',
  $skill_content$# Canvas Design

Create design philosophies expressed visually. Output .md, .pdf, and .png files.

## Two Steps

1. Design Philosophy Creation (.md file)
2. Express by creating it on a canvas (.pdf or .png file)

## Design Philosophy Creation

Create a VISUAL PHILOSOPHY interpreted through form, space, color, composition.

### How to Generate

1. **Name the movement** (1-2 words): "Brutalist Joy" / "Chromatic Silence"
2. **Articulate the philosophy** (4-6 paragraphs)

### Essential Principles

- **VISUAL PHILOSOPHY**: Create an aesthetic worldview
- **MINIMAL TEXT**: Text is sparse, essential-only
- **SPATIAL EXPRESSION**: Ideas communicate through space, form, color
- **ARTISTIC FREEDOM**: Provide creative room for interpretation
- **EXPERT CRAFTSMANSHIP**: Must look meticulously crafted

## Canvas Creation

Use the design philosophy to craft a masterpiece. Create museum or magazine quality work.

**CRITICAL**: Create work that looks like it took countless hours. Every detail must scream expert-level craftsmanship.$skill_content$,
  'image',
  true,
  true,
  11,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 12. brand-guidelines (设计 - 品牌指南)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'Brand Guidelines',
  'brand-guidelines',
  'Applies Anthropic''s official brand colors and typography to any artifact. Use when brand colors, style guidelines, or company design standards apply.',
  'design',
  $skill_content$# Anthropic Brand Styling

## Brand Guidelines

### Colors

**Main Colors:**
- Dark: #141413 - Primary text and dark backgrounds
- Light: #faf9f5 - Light backgrounds
- Mid Gray: #b0aea5 - Secondary elements
- Light Gray: #e8e6dc - Subtle backgrounds

**Accent Colors:**
- Orange: #d97757 - Primary accent
- Blue: #6a9bcc - Secondary accent
- Green: #788c5d - Tertiary accent

### Typography

- **Headings**: Poppins (with Arial fallback)
- **Body Text**: Lora (with Georgia fallback)

## Features

- Applies Poppins font to headings (24pt+)
- Applies Lora font to body text
- Smart color selection based on background
- Non-text shapes use accent colors cycling through orange, blue, green$skill_content$,
  'paintbrush',
  true,
  true,
  12,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 13. artifacts-builder (设计 - Artifacts 构建器)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'Artifacts Builder',
  'artifacts-builder',
  'Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using React, Tailwind CSS, shadcn/ui. For complex artifacts requiring state management or routing.',
  'design',
  $skill_content$# Artifacts Builder

Build powerful frontend claude.ai artifacts.

**Stack**: React 18 + TypeScript + Vite + Parcel + Tailwind CSS + shadcn/ui

## Quick Start

### Step 1: Initialize Project

```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

Creates a project with React + TypeScript, Tailwind CSS, 40+ shadcn/ui components.

### Step 2: Develop Your Artifact

Edit the generated files.

### Step 3: Bundle to Single HTML File

```bash
bash scripts/bundle-artifact.sh
```

Creates `bundle.html` - a self-contained artifact with all dependencies inlined.

### Step 4: Share Artifact with User

Share the bundled HTML file in conversation.

## Design Guidelines

Avoid "AI slop": no excessive centered layouts, purple gradients, uniform rounded corners, or Inter font.$skill_content$,
  'code',
  true,
  true,
  13,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

-- ============================================================
-- 14. competitive-ads-extractor (分析 - 竞品广告提取)
-- ============================================================
INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version)
VALUES (
  'Competitive Ads Extractor',
  'competitive-ads-extractor',
  'Extracts and analyzes competitors'' ads from ad libraries (Facebook, LinkedIn, etc.) to understand messaging, problems, and creative approaches.',
  'analysis',
  $skill_content$# Competitive Ads Extractor

Extract competitors'' ads from ad libraries and analyze what works.

## What This Skill Does

1. **Extracts Ads**: Scrapes ads from Facebook Ad Library, LinkedIn, etc.
2. **Captures Screenshots**: Saves visual copies of all ads
3. **Analyzes Messaging**: Identifies problems, use cases, and value props
4. **Categorizes Ads**: Groups by theme, audience, or format
5. **Identifies Patterns**: Finds common successful approaches
6. **Provides Insights**: Explains why certain ads likely perform well

## How to Use

```
Extract all current ads from [Competitor Name] on Facebook Ad Library
Scrape ads from [Company] and analyze their messaging
Get LinkedIn ads from [Competitor] and analyze their B2B positioning
```

## What You Can Learn

- **Messaging Analysis**: Problems emphasized, positioning, value propositions
- **Creative Patterns**: Visual styles, video vs static, color schemes
- **Copy Formulas**: Headline structures, CTAs, emotional triggers
- **Campaign Strategy**: Seasonal campaigns, product launches$skill_content$,
  'search',
  true,
  true,
  14,
  '1.0.0'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_content = EXCLUDED.skill_content,
  icon = EXCLUDED.icon,
  is_enabled = EXCLUDED.is_enabled,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;

SELECT 'Migration 0018_seed_preset_skills completed' AS status;
