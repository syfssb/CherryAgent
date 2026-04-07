export const UNKNOWN_WORKSPACE_GROUP_KEY = "__no_cwd__";

type WorkspaceSessionLike = {
  cwd?: string;
};

export type WorkspaceGroup<T extends WorkspaceSessionLike> = {
  key: string;
  cwd?: string;
  displayName: string;
  sessions: T[];
};

function normalizeWorkspacePath(cwd?: string): string | null {
  if (typeof cwd !== "string") {
    return null;
  }

  const trimmed = cwd.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/[\\/]+/g, "/").replace(/\/+$/, "");
  return normalized || null;
}

export function normalizeWorkspaceGroupKey(cwd?: string): string {
  return normalizeWorkspacePath(cwd) ?? UNKNOWN_WORKSPACE_GROUP_KEY;
}

export function getWorkspaceDisplayName(cwd?: string): string {
  const normalized = normalizeWorkspacePath(cwd);
  if (!normalized) {
    return "—";
  }

  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

export function groupSessionsByWorkspace<T extends WorkspaceSessionLike>(
  sessions: T[],
): Array<WorkspaceGroup<T>> {
  const groups = new Map<string, WorkspaceGroup<T>>();

  for (const session of sessions) {
    const key = normalizeWorkspaceGroupKey(session.cwd);
    const existing = groups.get(key);

    if (existing) {
      existing.sessions.push(session);
      continue;
    }

    groups.set(key, {
      key,
      cwd: session.cwd,
      displayName: getWorkspaceDisplayName(session.cwd),
      sessions: [session],
    });
  }

  return Array.from(groups.values());
}
