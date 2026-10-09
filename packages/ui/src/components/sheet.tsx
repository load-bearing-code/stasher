import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"
import { cn } from "cn"

/**
 * A bottom-anchored sheet built on Base UI's Dialog. The shell is
 * intentionally generic: it owns the backdrop, the slide-up surface, and
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
        "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

/** The drag handle at the top of the sheet. Attach an onClick (or wire
 * arrow keys on the content) to cycle detents. */
function SheetHandle({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="sheet-handle"
      aria-label="Resize sheet"
      className={cn(
        "mx-auto mt-2 mb-1 flex h-4 w-10 flex-none cursor-grab items-center justify-center active:cursor-grabbing",
        className
      )}
      {...props}
    >
      <span className="h-1.5 w-9 rounded-full bg-muted-foreground/30" />
    </button>
  )
}

interface SheetContentProps
  extends Omit<Dialog.Popup.Props, "className" | "children"> {
  className?: string
  children?: React.ReactNode
  /** Render the grab handle. @default true */
  showHandle?: boolean
  /** Render the dimming backdrop behind the sheet. @default true */
  showBackdrop?: boolean
  /** Called when the handle is clicked, e.g. to cycle detents. */
  onHandleClick?: () => void
}

function SheetContent({
  className,
  children,
  showHandle = true,
  showBackdrop = true,
  onHandleClick,
  ...props
}: SheetContentProps) {
  return (
    <Dialog.Portal>
      {showBackdrop ? <SheetBackdrop /> : null}
      <Dialog.Popup
        data-slot="sheet-content"
        className={cn(
          "glass fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[720px] flex-col overflow-hidden rounded-t-2xl shadow-2xl outline-none",
          "transition-transform duration-300 ease-out data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
          className
        )}
        {...props}
      >
        {showHandle ? <SheetHandle onClick={onHandleClick} /> : null}
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
        "flex items-start gap-2 px-4 pt-1 pb-3",
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
        "font-heading text-base leading-snug font-medium",
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
      className={cn("text-sm text-muted-foreground", className)}
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
        "flex items-center gap-2 border-t border-border/60 px-4 py-3",
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
