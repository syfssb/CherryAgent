# Proxy Support

Proxy configuration for geo-testing, rate limiting avoidance, and corporate environments.

**Related**: [commands.md](commands.md) for global options, [SKILL.md](../SKILL.md) for quick start.

## Basic Proxy Configuration

```bash
export HTTP_PROXY="http://proxy.example.com:8080"
agent-browser open https://example.com

export HTTPS_PROXY="https://proxy.example.com:8080"
agent-browser open https://example.com
```

## Authenticated Proxy

```bash
export HTTP_PROXY="http://username:password@proxy.example.com:8080"
agent-browser open https://example.com
```

## SOCKS Proxy

```bash
export ALL_PROXY="socks5://proxy.example.com:1080"
agent-browser open https://example.com
```

## Proxy Bypass

```bash
export NO_PROXY="localhost,127.0.0.1,.internal.company.com"
agent-browser open https://internal.company.com  # Direct connection
agent-browser open https://external.com          # Via proxy
```

## Verifying Proxy Connection

```bash
agent-browser open https://httpbin.org/ip
agent-browser get text body
# Should show proxy's IP, not your real IP
```

## Best Practices

1. **Use environment variables** - Don't hardcode proxy credentials
2. **Set NO_PROXY appropriately** - Avoid routing local traffic through proxy
3. **Test proxy before automation** - Verify connectivity with simple requests
4. **Handle proxy failures gracefully** - Implement retry logic for unstable proxies
5. **Rotate proxies for large scraping jobs** - Distribute load and avoid bans
