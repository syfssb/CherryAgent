import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import type { HookLogEntry, SystemObservableEvent } from "../../store/types";

/**
 * Hook 状态对应的颜色样式
 */
const hookStatusStyles: Record<HookLogEntry["status"], { dot: string; text: string; bg: string }> = {
  started: {
    dot: "bg-info",
    text: "text-info",
    bg: "bg-info-light",
  },
  running: {
    dot: "bg-accent",
    text: "text-accent",
    bg: "bg-accent-subtle",
  },
  completed: {
    dot: "bg-success",
    text: "text-success",
    bg: "bg-success-light",
  },
};

function HookLogRow({ entry }: { entry: HookLogEntry }) {
  const style = hookStatusStyles[entry.status];

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded text-xs">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className="font-medium text-ink-700 shrink-0">{entry.hookName}</span>
      <span className="text-muted-light shrink-0">{entry.hookEvent}</span>
      <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${style.text} ${style.bg}`}>
        {entry.status}
      </span>
      {entry.output && (
        <span className="text-muted truncate" title={entry.output}>
          {entry.output}
        </span>
      )}
    </div>
  );
}

function SystemEventRow({ event }: { event: SystemObservableEvent }) {
  if (event.kind === "hook") {
    return null;
  }

  if (event.kind === "task_notification") {
    return (
      <div className="flex items-start gap-2 py-1.5 px-2 rounded text-xs">
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
        <span className="font-medium text-ink-700 shrink-0">task</span>
        <span className="text-muted truncate" title={event.message}>
          {event.message}
        </span>
      </div>
    );
  }

  if (event.kind === "files_persisted") {
    return (
      <div className="flex items-start gap-2 py-1.5 px-2 rounded text-xs">
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
        <span className="font-medium text-ink-700 shrink-0">files</span>
        <span className="text-muted truncate" title={event.files.join(", ")}>
          {event.files.length} file(s) persisted
        </span>
      </div>
    );
  }

  if (event.kind === "tool_use_summary") {
    return (
      <div className="flex items-start gap-2 py-1.5 px-2 rounded text-xs">
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
        <span className="font-medium text-ink-700 shrink-0">{event.toolName}</span>
        <span className="text-muted truncate" title={event.summary}>
          {event.summary}
        </span>
      </div>
    );
  }

  return null;
}

export function ObservablePanel() {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const session = useAppStore((s) =>
    s.activeSessionId ? s.sessions[s.activeSessionId] : null
  );

  const hookLogs = session?.hookLogs ?? [];
  const observableEvents = session?.observableEvents ?? [];

  const nonHookEvents = useMemo(
    () => observableEvents.filter((e) => e.kind !== "hook"),
    [observableEvents]
  );

  const totalCount = hookLogs.length + nonHookEvents.length;

  if (totalCount === 0 || !activeSessionId) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl mb-4">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-lg border border-ink-900/10 bg-surface-secondary px-3 py-2 text-xs text-muted transition-colors hover:bg-surface-tertiary"
        aria-expanded={isExpanded}
        aria-controls="observable-panel-content"
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="font-medium">
          {t("chat.observable.title", "System Events")}
        </span>
        <span className="rounded-full bg-ink-900/10 px-1.5 py-0.5 text-[10px] font-medium">
          {totalCount}
        </span>
      </button>

      {isExpanded && (
        <div
          id="observable-panel-content"
          className="mt-1 rounded-lg border border-ink-900/10 bg-surface-secondary overflow-hidden animate-fade-in"
        >
          {hookLogs.length > 0 && (
            <div className="border-b border-ink-900/5 px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-light">
                {t("chat.observable.hooks", "Hooks")}
              </div>
              <div className="space-y-0.5">
                {hookLogs.map((entry) => (
                  <HookLogRow key={entry.hookId} entry={entry} />
                ))}
              </div>
            </div>
          )}

          {nonHookEvents.length > 0 && (
            <div className="px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-light">
                {t("chat.observable.events", "Events")}
              </div>
              <div className="space-y-0.5">
                {nonHookEvents.map((event, idx) => (
                  <SystemEventRow key={`${event.kind}-${idx}`} event={event} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
