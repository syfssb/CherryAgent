/**
 * Checkbox Component
 * Anthropic UI 风格 — warm neutral + accent orange
 */

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { cn } from "@/ui/lib/utils"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-[18px] w-[18px] shrink-0 rounded-[5px] border-[1.5px] border-ink-900/25 bg-surface transition-all duration-150",
      "hover:border-ink-900/40",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
      "disabled:cursor-not-allowed disabled:opacity-40",
      "data-[state=checked]:border-transparent data-[state=checked]:bg-accent data-[state=checked]:text-white data-[state=checked]:shadow-[0_1px_2px_rgba(174,86,48,0.3)]",
      "dark:border-ink-100/25 dark:bg-surface-tertiary dark:data-[state=checked]:bg-accent",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <svg
        viewBox="0 0 12 12"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="2.5 6 5 8.5 9.5 3.5" />
      </svg>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
