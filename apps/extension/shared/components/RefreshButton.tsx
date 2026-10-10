import { Button } from "@stasher/ui/components/button";
import { RefreshCwIcon } from "lucide-react";
import type { ReactNode } from "react";

export function RefreshButton({
  refreshing,
  title,
  onClick,
  children,
}: {
  refreshing: boolean;
  title: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <Button
      variant="outline"
      className="afterhours-matte h-7 rounded-full px-3 text-button-sm font-normal text-secondary-foreground"
      disabled={refreshing}
      title={title}
      onClick={onClick}
    >
      {children}
      <RefreshCwIcon className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
    </Button>
  );
}
