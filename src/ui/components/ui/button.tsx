import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/ui/lib/utils"

/**
 * Button variants using class-variance-authority.
 * Supports multiple variants (default, destructive, outline, secondary, ghost, link)
 * and sizes (default, sm, lg, icon).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#141413] text-[#faf9f5] border border-[#141413] hover:bg-[#3d3d3a] hover:border-[#3d3d3a] active:scale-[0.98] focus-visible:ring-[#141413] dark:bg-[#faf9f5] dark:text-[#141413] dark:border-[#faf9f5] dark:hover:bg-[#f0eee6]",
        destructive:
          "bg-error text-white shadow-sm hover:bg-error/90 active:scale-[0.98] focus-visible:ring-error",
        outline:
          "border border-[#1414131a] bg-transparent text-ink-900 hover:border-[#141413] active:scale-[0.98] focus-visible:ring-[#141413] dark:border-[#faf9f51a] dark:text-ink-900 dark:hover:border-[#faf9f5]",
        secondary:
          "bg-surface-secondary text-ink-900 hover:bg-surface-tertiary active:scale-[0.98] focus-visible:ring-accent dark:bg-surface-secondary dark:hover:bg-surface-tertiary",
        ghost:
          "hover:bg-surface-secondary text-ink-900 active:scale-[0.98] focus-visible:ring-accent dark:hover:bg-[#3d3d3a]",
        link:
          "text-accent underline-offset-4 hover:underline focus-visible:ring-accent",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * If true, the button will render as a Slot component,
   * allowing it to merge props with its child element.
   */
  asChild?: boolean
}

/**
 * Button component with multiple variants and sizes.
 *
 * @example
 * // Default button
 * <Button>Click me</Button>
 *
 * // Outline variant, small size
 * <Button variant="outline" size="sm">Small outline</Button>
 *
 * // As child (renders child element with button styles)
 * <Button asChild>
 *   <a href="/link">Link styled as button</a>
 * </Button>
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
