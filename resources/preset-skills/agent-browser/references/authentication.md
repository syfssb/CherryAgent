# Authentication Patterns

Login flows, session persistence, OAuth, 2FA, and authenticated browsing.

**Related**: [session-management.md](session-management.md) for state persistence details, [SKILL.md](../SKILL.md) for quick start.

## Basic Login Flow

```bash
agent-browser open https://app.example.com/login
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser get url  # Should be dashboard, not login
```

## Saving Authentication State

```bash
agent-browser open https://app.example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save ./auth-state.json
```

## Restoring Authentication

```bash
agent-browser state load ./auth-state.json
agent-browser open https://app.example.com/dashboard
agent-browser snapshot -i
```

## OAuth / SSO Flows

```bash
agent-browser open https://app.example.com/auth/google
agent-browser wait --url "**/accounts.google.com**"
agent-browser snapshot -i
agent-browser fill @e1 "user@gmail.com"
agent-browser click @e2
agent-browser wait 2000
agent-browser snapshot -i
agent-browser fill @e3 "password"
agent-browser click @e4
agent-browser wait --url "**/app.example.com**"
agent-browser state save ./oauth-state.json
```

## Two-Factor Authentication

```bash
agent-browser open https://app.example.com/login --headed
agent-browser snapshot -i
agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
echo "Complete 2FA in the browser window..."
agent-browser wait --url "**/dashboard" --timeout 120000
agent-browser state save ./2fa-state.json
```

## HTTP Basic Auth

```bash
agent-browser set credentials username password
agent-browser open https://protected.example.com/api
```

## Cookie-Based Auth

```bash
agent-browser cookies set session_token "abc123xyz"
agent-browser open https://app.example.com/dashboard
```

## Security Best Practices

1. **Never commit state files** - `echo "*.auth-state.json" >> .gitignore`
2. **Use environment variables for credentials** - `agent-browser fill @e1 "$APP_USERNAME"`
3. **Clean up after automation** - `agent-browser cookies clear && rm -f ./auth-state.json`
4. **Use short-lived sessions for CI/CD** - Don't persist state in CI
