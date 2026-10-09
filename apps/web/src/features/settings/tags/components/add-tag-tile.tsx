import { Plus } from "lucide-react";

interface AddTagTileProps {
  onClick: () => void;
}

// Mirrors TagCard's two-block height (a 4:3 cover plus a footer-sized
// label area) so the tile matches card height on its own, even when
// it's the grid's only item and has no sibling to stretch against.
export function AddTagTile({ onClick }: AddTagTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
    >
      <div aria-hidden className="aspect-[4/3]" />
      <div aria-hidden className="flex flex-col gap-0.5 px-2.5 py-2 opacity-0">
        <span className="text-[13px] font-medium">Add tag</span>
        <span className="text-xs">0 posts</span>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
        <Plus className="size-5" />
        <span className="text-[13px] font-medium">Add tag</span>
      </div>
    </button>
  );
}
