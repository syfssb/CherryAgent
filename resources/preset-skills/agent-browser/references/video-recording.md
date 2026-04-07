# Video Recording

Capture browser automation as video for debugging, documentation, or verification.

**Related**: [commands.md](commands.md) for full command reference, [SKILL.md](../SKILL.md) for quick start.

## Basic Recording

```bash
agent-browser record start ./demo.webm
agent-browser open https://example.com
agent-browser snapshot -i
agent-browser click @e1
agent-browser fill @e2 "test input"
agent-browser record stop
```

## Recording Commands

```bash
agent-browser record start ./output.webm    # Start recording
agent-browser record stop                   # Stop current recording
agent-browser record restart ./take2.webm   # Stop current + start new
```

## Use Cases

### Debugging Failed Automation

```bash
agent-browser record start ./debug-$(date +%Y%m%d-%H%M%S).webm
agent-browser open https://app.example.com
agent-browser snapshot -i
agent-browser click @e1 || {
    echo "Click failed - check recording"
    agent-browser record stop
    exit 1
}
agent-browser record stop
```

### Documentation Generation

```bash
agent-browser record start ./docs/how-to-login.webm
agent-browser open https://app.example.com/login
agent-browser wait 1000
agent-browser snapshot -i
agent-browser fill @e1 "demo@example.com"
agent-browser wait 500
agent-browser fill @e2 "password"
agent-browser wait 500
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser wait 1000
agent-browser record stop
```

## Best Practices

1. **Add Pauses for Clarity** - `agent-browser wait 500` between actions
2. **Use Descriptive Filenames** - Include context in filename
3. **Handle Recording in Error Cases** - Use trap cleanup EXIT
4. **Combine with Screenshots** - Record video AND capture key frames

## Output Format

- Default format: WebM (VP8/VP9 codec)
- Compatible with all modern browsers and video players
