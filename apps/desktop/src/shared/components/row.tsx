import { Label } from "@stasher/ui/components/label";
import type { ReactNode } from "react";

export function Row({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <>
      <Label htmlFor={htmlFor} className="text-body text-muted-foreground">
        {label}
      </Label>
      {children}
    </>
  );
}
