import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/ui/lib/utils"

/**
 * Badge variants using class-variance-authority.
 * Supports multiple variants: default, secondary, destructive, outline.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#f0eee6] text-[#141413] dark:bg-[#faf9f51a] dark:text-[#faf9f5]",
        secondary:
          "border-transparent bg-[#1414130a] text-ink-700 dark:bg-[#faf9f50a]",
        destructive:
          "border-transparent bg-[#DC262614] text-[#DC2626]",
        outline: "border-ink-400/30 text-ink-900",
        success:
          "border-transparent bg-success text-white shadow-sm hover:bg-success/80",
        info:
          "border-transparent bg-info text-white shadow-sm hover:bg-info/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge component for status indicators and labels.
 *
 * @example
 * // Default badge
 * <Badge>New</Badge>
 *
 * // Outline variant
 * <Badge variant="outline">Draft</Badge>
 *
 * // Destructive variant
 * <Badge variant="destructive">Error</Badge>
 *
 * // Success variant
 * <Badge variant="success">Active</Badge>
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
