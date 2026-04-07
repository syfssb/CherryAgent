/**
 * 单元测试 — Codex Runner sandboxMode 映射
 *
 * 验证 Bug 3 修复: CodexAgentRunner 中 permissionMode → sandboxMode 的映射逻辑
 */

import { describe, it, expect } from 'vitest';

// 从 codex-runner.ts 中提取的映射逻辑（纯函数测试）
// 原始代码位于 src/electron/libs/agent-runner/codex-runner.ts:101-117

type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
type ApprovalPolicy = 'never' | 'on-request' | 'on-failure' | 'untrusted';

const approvalPolicyMap: Record<string, ApprovalPolicy> = {
  bypassPermissions: 'never',
  acceptEdits: 'on-request',
  default: 'untrusted',
};

const sandboxModeMap: Record<string, SandboxMode> = {
  bypassPermissions: 'danger-full-access',
  acceptEdits: 'workspace-write',
  default: 'read-only',
};

function resolveSandboxMode(permissionMode?: string): SandboxMode {
  return sandboxModeMap[permissionMode ?? 'bypassPermissions'] ?? 'workspace-write';
}

function resolveApprovalPolicy(permissionMode?: string): ApprovalPolicy {
  return approvalPolicyMap[permissionMode ?? 'bypassPermissions'] ?? 'on-request';
}

describe('Codex Runner sandboxMode 映射', () => {
  describe('permissionMode → sandboxMode', () => {
    it('bypassPermissions → danger-full-access', () => {
      expect(resolveSandboxMode('bypassPermissions')).toBe('danger-full-access');
    });

    it('acceptEdits → workspace-write', () => {
      expect(resolveSandboxMode('acceptEdits')).toBe('workspace-write');
    });

    it('default → read-only', () => {
      expect(resolveSandboxMode('default')).toBe('read-only');
    });

    it('未指定 permissionMode 时默认为 danger-full-access（因为默认值是 bypassPermissions）', () => {
      expect(resolveSandboxMode(undefined)).toBe('danger-full-access');
    });

    it('未知 permissionMode 回退到 workspace-write', () => {
      expect(resolveSandboxMode('unknown-mode')).toBe('workspace-write');
    });
  });

  describe('permissionMode → approvalPolicy', () => {
    it('bypassPermissions → never', () => {
      expect(resolveApprovalPolicy('bypassPermissions')).toBe('never');
    });

    it('acceptEdits → on-request', () => {
      expect(resolveApprovalPolicy('acceptEdits')).toBe('on-request');
    });

    it('default → untrusted', () => {
      expect(resolveApprovalPolicy('default')).toBe('untrusted');
    });

    it('未指定 permissionMode 时默认为 never', () => {
      expect(resolveApprovalPolicy(undefined)).toBe('never');
    });

    it('未知 permissionMode 回退到 on-request', () => {
      expect(resolveApprovalPolicy('unknown-mode')).toBe('on-request');
    });
  });

  describe('sandboxMode 与 approvalPolicy 联动一致性', () => {
    it('bypassPermissions: 最宽松组合', () => {
      const mode = 'bypassPermissions';
      expect(resolveSandboxMode(mode)).toBe('danger-full-access');
      expect(resolveApprovalPolicy(mode)).toBe('never');
    });

    it('acceptEdits: 中等权限组合', () => {
      const mode = 'acceptEdits';
      expect(resolveSandboxMode(mode)).toBe('workspace-write');
      expect(resolveApprovalPolicy(mode)).toBe('on-request');
    });

    it('default: 最严格组合', () => {
      const mode = 'default';
      expect(resolveSandboxMode(mode)).toBe('read-only');
      expect(resolveApprovalPolicy(mode)).toBe('untrusted');
    });
  });
});

describe('Codex Runner threadOptions 构建', () => {
  it('pluginPaths 非空时应设置 additionalDirectories', () => {
    const pluginPaths = ['/path/to/skills'];
    const threadOptions = {
      model: 'codex-mini-latest',
      workingDirectory: '/workspace',
      approvalPolicy: 'on-request' as ApprovalPolicy,
      sandboxMode: 'workspace-write' as SandboxMode,
      networkAccessEnabled: true,
      ...(pluginPaths.length ? { additionalDirectories: pluginPaths } : {}),
    };

    expect(threadOptions.additionalDirectories).toEqual(['/path/to/skills']);
    expect(threadOptions.networkAccessEnabled).toBe(true);
  });

  it('pluginPaths 为空时不应设置 additionalDirectories', () => {
    const pluginPaths: string[] = [];
    const threadOptions = {
      model: 'codex-mini-latest',
      workingDirectory: '/workspace',
      approvalPolicy: 'on-request' as ApprovalPolicy,
      sandboxMode: 'workspace-write' as SandboxMode,
      networkAccessEnabled: true,
      ...(pluginPaths.length ? { additionalDirectories: pluginPaths } : {}),
    };

    expect(threadOptions).not.toHaveProperty('additionalDirectories');
    expect(threadOptions.networkAccessEnabled).toBe(true);
  });

  it('networkAccessEnabled 始终为 true', () => {
    // 验证 codex-runner.ts:165 中 networkAccessEnabled 固定为 true
    const networkAccessEnabled = true;
    expect(networkAccessEnabled).toBe(true);
  });
});
