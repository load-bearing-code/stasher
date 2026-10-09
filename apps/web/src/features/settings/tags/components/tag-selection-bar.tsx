import { Button } from "@stasher/ui/components/button";
import { EyeOff, GitMerge, Trash2 } from "lucide-react";

interface TagSelectionBarProps {
  count: number;
  onClear: () => void;
  // Hide, merge, and delete need API support that doesn't exist yet;
  // leaving a handler undefined disables its button.
  onHide?: () => void;
  onMerge?: () => void;
  onDelete?: () => void;
}

export function TagSelectionBar({
  count,
  onClear,
  onHide,
  onMerge,
  onDelete,
}: TagSelectionBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
      <span className="text-[13px] font-medium tabular-nums">
        {count} selected
      </span>
      <div className="flex-1" />
      <Button
        variant="secondary"
        size="sm"
        disabled={!onHide}
        onClick={onHide}
      >
        <EyeOff data-icon="inline-start" />
        Hide
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={!onMerge}
        onClick={onMerge}
      >
        <GitMerge data-icon="inline-start" />
        Merge into…
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={!onDelete}
        onClick={onDelete}
      >
        <Trash2 data-icon="inline-start" />
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
