import { Plus } from "lucide-react";

interface AddTagTileProps {
  onClick: () => void;
}

export function AddTagTile({ onClick }: AddTagTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
    >
      <Plus className="size-5" />
      <span className="text-[13px] font-medium">Add tag</span>
    </button>
  );
}
