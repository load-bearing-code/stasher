import { cn } from "@stasher/ui/lib/utils";
import { Check, Minus } from "lucide-react";

interface SelectCheckboxProps {
  state: "checked" | "unchecked" | "indeterminate";
  "aria-label": string;
  onClick: () => void;
  className?: string;
}

export function SelectCheckbox({ state, onClick, className, ...props }: SelectCheckboxProps) {
  return (
    <button
      type="button"
      aria-label={props["aria-label"]}
      aria-pressed={state !== "unchecked"}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors",
        state !== "unchecked"
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-transparent text-transparent hover:border-foreground/40",
        className,
      )}
    >
      {state === "checked" ? (
        <Check className="size-3" />
      ) : state === "indeterminate" ? (
        <Minus className="size-3" />
      ) : null}
    </button>
  );
}
