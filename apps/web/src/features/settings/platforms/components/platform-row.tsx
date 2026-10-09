import { Globe } from "lucide-react";
import { SelectCheckbox } from "@/features/settings/platforms/components/select-checkbox";
import type { PlatformSummary } from "@/features/settings/platforms/platforms-api";
import { pluralize } from "@/shared/pluralize";

interface PlatformRowProps {
  platform: PlatformSummary;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

export function PlatformRow({
  platform,
  selected,
  onOpen,
  onToggleSelect,
}: PlatformRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(platform.id)}
      className="flex w-full cursor-pointer items-center gap-3 border-b border-border bg-[#111013] px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted"
    >
      <SelectCheckbox
        state={selected ? "checked" : "unchecked"}
        aria-label={selected ? `Deselect ${platform.name}` : `Select ${platform.name}`}
        onClick={() => onToggleSelect(platform.id)}
      />
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Globe className="size-4.5 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold text-foreground">
          {platform.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {platform.performerCount}{" "}
          {pluralize(platform.performerCount, "performer")}
        </span>
      </div>
    </button>
  );
}
