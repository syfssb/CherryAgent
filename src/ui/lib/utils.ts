import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Utility function to merge class names with Tailwind CSS support.
 * Combines clsx for conditional classes and tailwind-merge for deduplication.
 *
 * @example
 * cn("px-4 py-2", isActive && "bg-primary", className)
 * cn("text-red-500", "text-blue-500") // => "text-blue-500" (tailwind-merge dedupes)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
