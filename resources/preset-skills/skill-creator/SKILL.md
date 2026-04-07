---
name: skill-creator
description: Guide for creating effective skills that extend Claude's capabilities with specialized knowledge and workflows
category: development
source: builtin
managedBy: preset
---

# Skill Creator Guide

Use this skill when users want to create a new skill or update an existing skill.

## Skill Directory Structure

Skills must be created in the app's user data directory. The path varies by operating system:

| OS | Skills Directory |
|----|------------------|
| **macOS** | `~/Library/Application Support/cherry-agent/skills/skills/{skill-name}/` |
| **Windows** | `%APPDATA%\cherry-agent\skills\skills\{skill-name}\` |
| **Linux** | `~/.config/cherry-agent/skills/skills/{skill-name}/` |

Each skill directory must contain a single file named `SKILL.md`.

**IMPORTANT:** Do NOT create `skill.json`, `prompt.md`, or any other files. Only create `SKILL.md`.

## SKILL.md File Format

The `SKILL.md` file must have:
1. YAML frontmatter (between `---` markers)
2. Markdown content with the skill instructions

### Required Frontmatter Fields

```yaml
---
name: skill-name
description: A clear description of what this skill does (shown in UI)
category: development
source: user
---
```

### Valid Category Values

Only use these categories (others will cause errors):
- `general` - General purpose, multi-functional skills
- `development` - Programming, coding, technical tools
- `writing` - Content creation, documentation
- `analysis` - Data analysis, research
- `automation` - Workflow automation, scripts
- `communication` - Email, messaging, social media
- `design` - UI/UX design, graphics, visual content
- `data` - Data processing, databases, data engineering
- `devops` - DevOps, deployment, infrastructure
- `other` - Anything else

### Complete Example

```markdown
---
name: weather-query
description: Query real-time weather information for cities
category: automation
source: user
---

# Weather Query Assistant

You are a weather query assistant that helps users get real-time weather information.

## Capabilities

- Query weather for any city
- Provide temperature, humidity, wind speed
- Give weather-based recommendations

## Workflow

1. Identify the city from user input (default: user's location)
2. Use WebSearch to find current weather data
3. Format and present the information clearly

## Output Format

Present weather in this format:

📍 City: [city name]
🌡️ Temperature: [temp]
☁️ Weather: [conditions]
💧 Humidity: [percentage]
💨 Wind: [speed and direction]

## Notes

- Always search for "[city] weather [current year]" for latest data
- Provide practical suggestions (umbrella, clothing, etc.)
```

## Step-by-Step Creation Process

1. **Confirm skill name and purpose** with the user

2. **Detect the operating system first:**
   ```bash
   uname -s 2>/dev/null || echo "Windows"
   ```
   - Returns `Darwin` → macOS
   - Returns `Linux` → Linux
   - Returns `Windows` or fails → Windows

3. **Create the directory based on detected OS:**

   **macOS (Darwin):**
   ```bash
   mkdir -p "$HOME/Library/Application Support/cherry-agent/skills/skills/{skill-name}"
   ```

   **Linux:**
   ```bash
   mkdir -p "$HOME/.config/cherry-agent/skills/skills/{skill-name}"
   ```

   **Windows (PowerShell):**
   ```powershell
   New-Item -ItemType Directory -Force -Path "$env:APPDATA\cherry-agent\skills\skills\{skill-name}"
   ```

4. **Write SKILL.md** to the correct path based on OS

5. **Inform user** to click the refresh button

## Common Mistakes to Avoid

❌ Creating `skill.json` + `prompt.md` (wrong format)
❌ Using invalid category values like "utilities", "tools"
❌ Missing the `source: user` field
❌ Putting files in wrong directory
❌ Creating multiple files instead of single SKILL.md
❌ Using wrong path for the operating system

## After Creation

Tell the user:
> "Skill 创建成功！请点击聊天输入框上方技能选择器旁边的 **刷新按钮 🔄** 来同步新技能到列表中。"

Or in English:
> "Skill created successfully! Please click the **refresh button 🔄** next to the skill selector above the chat input to sync the new skill to the list."
