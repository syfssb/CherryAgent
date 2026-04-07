import type { Route } from "../hooks/useRouter";

export type SessionSelectionAction =
  | "noop"
  | "navigate-only"
  | "switch"
  | "blocked";

type ResolveSessionSelectionActionOptions = {
  currentRoute: Route;
  targetSessionId: string;
  activeSessionId: string | null;
};

export function resolveSessionSelectionAction(
  options: ResolveSessionSelectionActionOptions,
): SessionSelectionAction {
  const {
    currentRoute,
    targetSessionId,
    activeSessionId,
  } = options;

  if (targetSessionId === activeSessionId) {
    return currentRoute === "/chat" ? "noop" : "navigate-only";
  }

  return "switch";
}

export function activateSelectedSession(
  sessionId: string,
  onSelectSession: ((sessionId: string) => boolean | void) | undefined,
  setActiveSessionId: (sessionId: string) => void,
): boolean | void {
  if (onSelectSession) {
    return onSelectSession(sessionId);
  }

  setActiveSessionId(sessionId);
  return true;
}
