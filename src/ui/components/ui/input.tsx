import * as React from "react"
import { cn } from "@/ui/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Input component with consistent styling.
 * Supports all native input attributes and forwards refs.
 *
 * @example
 * // Basic usage
 * <Input placeholder="Enter your email" />
 *
 * // With type and disabled state
 * <Input type="password" disabled />
 *
 * // File input (has special styling)
 * <Input type="file" />
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-[#1414131a] bg-surface px-3 py-2 text-sm text-ink-900 transition-colors",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink-900",
          "placeholder:text-ink-400",
          "hover:border-[#14141333]",
          "focus-visible:outline-none focus-visible:border-[#141413] focus-visible:ring-1 focus-visible:ring-[#141413]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-[#faf9f51a] dark:bg-[#3d3d3a] dark:text-[#faf9f5] dark:placeholder:text-ink-400 dark:hover:border-[#faf9f533] dark:focus-visible:border-[#faf9f5] dark:focus-visible:ring-[#faf9f5]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
