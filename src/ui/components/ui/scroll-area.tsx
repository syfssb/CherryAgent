import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import { cn } from "@/ui/lib/utils"

/**
 * ScrollArea container with custom scrollbar styling.
 */
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    viewportRef?: React.Ref<HTMLDivElement>;
    viewportClassName?: string;
    viewportStyle?: React.CSSProperties;
    onViewportScroll?: React.UIEventHandler<HTMLDivElement>;
  }
>(({ className, children, viewportRef, viewportClassName, viewportStyle, onViewportScroll, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport
      ref={viewportRef}
      onScroll={onViewportScroll}
      className={cn("h-full w-full rounded-[inherit]", viewportClassName)}
      style={viewportStyle}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

/**
 * ScrollBar with custom styling and animations.
 */
const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-ink-400/40 hover:bg-ink-400/60" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

/**
 * ScrollArea component for custom scrollable areas.
 *
 * @example
 * <ScrollArea className="h-72 w-48 rounded-md border">
 *   <div className="p-4">
 *     {items.map((item) => (
 *       <div key={item.id} className="text-sm">
 *         {item.name}
 *       </div>
 *     ))}
 *   </div>
 * </ScrollArea>
 *
 * @example
 * // Horizontal scroll
 * <ScrollArea className="w-96">
 *   <div className="flex w-max space-x-4 p-4">
 *     {images.map((image) => (
 *       <img key={image.id} src={image.src} className="shrink-0" />
 *     ))}
 *   </div>
 *   <ScrollBar orientation="horizontal" />
 * </ScrollArea>
 */
export { ScrollArea, ScrollBar }
