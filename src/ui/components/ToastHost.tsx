import { useEffect } from "react";
import { setGlobalToast, useToast } from "../hooks/use-toast";

const VARIANT_STYLES: Record<string, string> = {
  default: "bg-surface text-ink-800 border-ink-900/10",
  success: "bg-success-light text-success border-success/20",
  error: "bg-error-light text-error border-error/20",
  warning: "bg-accent-subtle text-ink-800 border-accent/20",
};

export function ToastHost() {
  const { toasts, toast, dismiss } = useToast();

  useEffect(() => {
    setGlobalToast(toast);
  }, [toast]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed right-4 top-14 z-[var(--z-toast)] flex max-w-sm flex-col gap-2"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((item) => {
        const variant = item.variant ?? "default";
        const variantClass = VARIANT_STYLES[variant] ?? VARIANT_STYLES.default;

        return (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-lg border px-3 py-2 shadow-card ${variantClass}`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {item.title && (
                  <div className="text-sm font-semibold">{item.title}</div>
                )}
                {item.description && (
                  <div className="mt-0.5 text-xs text-ink-700">{item.description}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded p-1 text-ink-500 hover:text-ink-800"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
