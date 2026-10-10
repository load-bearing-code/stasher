import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"
import { cn } from "cn"

/**
 * An anchored sheet built on Base UI's Dialog. The shell is intentionally
 * generic: it owns the backdrop, the sliding surface, and
 * the standard header/footer slots, but leaves content height, detents,
 * and keyboard shortcuts to the consumer.
 */
function Sheet(props: Dialog.Root.Props) {
  return <Dialog.Root {...props} />
}

function SheetTrigger(props: Dialog.Trigger.Props) {
  return <Dialog.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: Dialog.Close.Props) {
  return <Dialog.Close data-slot="sheet-close" {...props} />
}

function SheetBackdrop({
  className,
  ...props
}: Dialog.Backdrop.Props) {
  return (
    <Dialog.Backdrop
      data-slot="sheet-backdrop"
      className={cn(
        "fixed inset-0 z-40 bg-media-scrim transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

/** The drag handle at the top of the sheet. Attach an onClick (or wire
 * arrow keys on the content) to cycle detents. When the sheet can't be
 * resized (no onClick), renders an inert placeholder of the same size so
 * the layout doesn't shift between resizable and fixed-height sheets. */
function SheetHandle({
  className,
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  if (!onClick) {
    return (
      <div
        data-slot="sheet-handle"
        aria-hidden="true"
        className={cn("mx-auto mt-2 mb-1 h-4 w-12 flex-none", className)}
      />
    )
  }
  return (
    <button
      type="button"
      data-slot="sheet-handle"
      aria-label="Resize sheet"
      onClick={onClick}
      className={cn(
        "mx-auto mt-2 mb-1 flex h-4 w-12 flex-none cursor-grab items-center justify-center active:cursor-grabbing",
        className
      )}
      {...props}
    >
      <span className="h-1.5 w-11 rounded-full bg-muted-foreground/30" />
    </button>
  )
}

interface SheetContentProps
  extends Omit<Dialog.Popup.Props, "className" | "children"> {
  className?: string
  children?: React.ReactNode
  /** Edge that anchors the sheet. @default "bottom" */
  side?: "bottom" | "right"
  /** Render the grab handle. @default true */
  showHandle?: boolean
  /** Render the dimming backdrop behind the sheet. @default true */
  showBackdrop?: boolean
  /** Additional classes for the dimming backdrop. */
  backdropClassName?: string
  /** Called when the handle is clicked, e.g. to cycle detents. */
  onHandleClick?: () => void
}

function SheetContent({
  className,
  children,
  side = "bottom",
  showHandle = true,
  showBackdrop = true,
  backdropClassName,
  onHandleClick,
  ...props
}: SheetContentProps) {
  return (
    <Dialog.Portal>
      {showBackdrop ? <SheetBackdrop className={backdropClassName} /> : null}
      <Dialog.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "afterhours-glass fixed z-50 flex flex-col overflow-hidden shadow-float outline-none",
          "transition-[transform,height,width] duration-300 ease-out",
          side === "bottom" &&
            "inset-x-0 bottom-0 mx-auto w-full max-w-[720px] rounded-t-xl data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
          side === "right" &&
            "inset-y-3 right-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-[640px] rounded-2xl border border-border transition-transform duration-300 ease-out data-[ending-style]:translate-x-[calc(100%+0.75rem)] data-[starting-style]:translate-x-[calc(100%+0.75rem)] max-sm:inset-0 max-sm:h-full max-sm:w-full max-sm:rounded-none max-sm:border-0 max-sm:data-[ending-style]:translate-x-full max-sm:data-[starting-style]:translate-x-full",
          className
        )}
        {...props}
      >
        {showHandle && side === "bottom" ? <SheetHandle onClick={onHandleClick} /> : null}
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex items-start gap-2 border-b border-divider px-4 pb-5",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: Dialog.Title.Props) {
  return (
    <Dialog.Title
      data-slot="sheet-title"
      className={cn(
        "text-dialog-title",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: Dialog.Description.Props) {
  return (
    <Dialog.Description
      data-slot="sheet-description"
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "flex items-center gap-2 border-t border-divider px-4 py-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetBackdrop,
  SheetHandle,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
}
