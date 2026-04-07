/**
 * shadcn/ui components barrel export file.
 * Import all components from a single location.
 *
 * @example
 * import { Button, Input, Dialog, Card } from "@/ui/components/ui"
 */

// Utility function
export { cn } from "@/ui/lib/utils"

// Button
export { Button, buttonVariants } from "./button"
export type { ButtonProps } from "./button"

// Input
export { Input } from "./input"
export type { InputProps } from "./input"

// Dialog
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./dialog"

// DropdownMenu
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from "./dropdown-menu"

// Tabs
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs"

// Card
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./card"

// Badge
export { Badge, badgeVariants } from "./badge"
export type { BadgeProps } from "./badge"

// Avatar
export { Avatar, AvatarImage, AvatarFallback } from "./avatar"

// Tooltip
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./tooltip"

// ScrollArea
export { ScrollArea, ScrollBar } from "./scroll-area"

// Label
export { Label } from "./label"

// Textarea
export { Textarea } from "./textarea"
export type { TextareaProps } from "./textarea"

// Checkbox
export { Checkbox } from "./checkbox"

// Select
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "./select"

// ContextMenu
export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuRadioGroup,
} from "./context-menu"

// Table
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./table"

