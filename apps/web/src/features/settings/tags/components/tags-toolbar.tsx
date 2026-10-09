import { Button } from "@stasher/ui/components/button";
import { Input } from "@stasher/ui/components/input";
import { cn } from "@stasher/ui/lib/utils";
import { Plus, Search } from "lucide-react";
import type { TagSortMode } from "@/features/settings/tags/types";

interface TagsToolbarProps {
  count: number;
  sort: TagSortMode;
  onSortChange: (sort: TagSortMode) => void;
  filter: string;
  onFilterChange: (filter: string) => void;
  onNewTag: () => void;
}

const SORT_OPTIONS: { id: TagSortMode; label: string }[] = [
  { id: "most-used", label: "Most used" },
  { id: "name", label: "A–Z" },
  { id: "hidden", label: "Hidden" },
];

export function TagsToolbar({
  count,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  onNewTag,
}: TagsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-xs font-semibold tracking-wider text-muted-foreground tabular-nums uppercase">
        {count} tags
      </span>

      <div className="flex rounded-lg bg-muted p-0.5">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSortChange(option.id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              sort === option.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="relative min-w-[160px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Filter tags"
          className="h-7 pl-7.5 text-[13px]"
        />
      </div>

      <Button size="sm" onClick={onNewTag}>
        <Plus data-icon="inline-start" />
        New tag
      </Button>
    </div>
  );
}
