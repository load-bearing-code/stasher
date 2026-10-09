import { cn } from "@stasher/ui/lib/utils";
import { Check, EyeOff, Tag as TagIcon } from "lucide-react";
import type { TagCardData } from "@/features/settings/tags/types";

interface TagCardProps {
  tag: TagCardData;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

// The cover is a 2x2 mosaic of the tag's four most recent post
// thumbnails; missing thumbnails fall back to empty fills.
const MOSAIC_CELLS = 4;

export function TagCard({
  tag,
  selected,
  onOpen,
  onToggleSelect,
}: TagCardProps) {
  const thumbnails = tag.thumbnails ?? [];
  const cells = Array.from(
    { length: MOSAIC_CELLS },
    (_, i) => thumbnails[i] ?? null,
  );

  return (
    <div className="group/tag relative">
      <button
        type="button"
        onClick={() => onOpen(tag.id)}
        className={cn(
          "flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-transparent bg-muted text-left transition-colors hover:border-border",
          selected && "border-primary",
        )}
      >
        {thumbnails.length > 0 ? (
          <div className="grid aspect-[4/3] grid-cols-2 gap-0.5 bg-border/60">
            {cells.map((src, i) => (
              <div key={i} className="bg-muted">
                {src ? (
                  <img
                    src={src}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-muted">
            <TagIcon className="mt-1.5 size-7 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-col gap-0.5 px-2.5 py-2">
          <span
            className={cn(
              "truncate text-[13px] font-semibold text-foreground",
              tag.hidden && "text-muted-foreground",
            )}
          >
            {tag.name}
          </span>
          <span className="text-xs text-foreground/60">
            {tag.postCount ?? 0} {tag.postCount === 1 ? "post" : "posts"}
          </span>
        </div>
      </button>

      <button
        type="button"
        aria-label={selected ? "Deselect tag" : "Select tag"}
        aria-pressed={selected}
        onClick={() => onToggleSelect(tag.id)}
        className={cn(
          "absolute top-2 left-2 flex size-5 items-center justify-center rounded-md border transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-transparent bg-background/50 text-transparent backdrop-blur-sm group-hover/tag:border-border",
        )}
      >
        <Check className="size-3.5" />
      </button>

      {tag.hidden ? (
        <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-md bg-background/80 text-muted-foreground backdrop-blur-sm">
          <EyeOff className="size-3.5" />
        </span>
      ) : null}
    </div>
  );
}
