import { Input } from "@stasher/ui/components/input";
import type { ComponentProps, ReactNode } from "react";

export function IconInput({
  icon,
  className,
  ...props
}: { icon: ReactNode } & ComponentProps<typeof Input>) {
  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <Input
        className={`h-7 pr-2.5 pl-8 font-mono text-meta md:text-meta ${className ?? ""}`}
        {...props}
      />
    </div>
  );
}
