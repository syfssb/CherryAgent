# Session Management

Multiple isolated browser sessions with state persistence and concurrent browsing.

**Related**: [authentication.md](authentication.md) for login patterns, [SKILL.md](../SKILL.md) for quick start.

## Named Sessions

Use `--session` flag to isolate browser contexts:

```bash
# Session 1: Authentication flow
agent-browser --session auth open https://app.example.com/login

# Session 2: Public browsing (separate cookies, storage)
agent-browser --session public open https://example.com

# Commands are isolated by session
agent-browser --session auth fill @e1 "user@example.com"
agent-browser --session public get text body
```

## Session Isolation Properties

Each session has independent:
- Cookies
- LocalStorage / SessionStorage
- IndexedDB
- Cache
- Browsing history
- Open tabs

## Session State Persistence

### Save Session State

```bash
# Save cookies, storage, and auth state
agent-browser state save /path/to/auth-state.json
```

### Load Session State

```bash
# Restore saved state
agent-browser state load /path/to/auth-state.json

# Continue with authenticated session
agent-browser open https://app.example.com/dashboard
```

## Common Patterns

### Authenticated Session Reuse

```bash
#!/bin/bash
STATE_FILE="/tmp/auth-state.json"

if [[ -f "$STATE_FILE" ]]; then
    agent-browser state load "$STATE_FILE"
    agent-browser open https://app.example.com/dashboard
else
    agent-browser open https://app.example.com/login
    agent-browser snapshot -i
    agent-browser fill @e1 "$USERNAME"
    agent-browser fill @e2 "$PASSWORD"
    agent-browser click @e3
    agent-browser wait --load networkidle
    agent-browser state save "$STATE_FILE"
fi
```

### Concurrent Scraping

```bash
#!/bin/bash
agent-browser --session site1 open https://site1.com &
agent-browser --session site2 open https://site2.com &
wait

agent-browser --session site1 get text body > site1.txt
agent-browser --session site2 get text body > site2.txt

agent-browser --session site1 close
agent-browser --session site2 close
```

## Best Practices

1. **Name Sessions Semantically** - Use descriptive names like `github-auth`, `docs-scrape`
2. **Always Clean Up** - Close sessions when done: `agent-browser --session name close`
3. **Handle State Files Securely** - Don't commit state files (contain auth tokens)
4. **Timeout Long Sessions** - `timeout 60 agent-browser --session long-task get text body`
