import { Button } from "@stasher/ui/components/button";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  useDeleteTag,
  useTags,
  type Tag,
} from "@/features/settings/tags/tags-api";
import { AddTagTile } from "@/features/settings/tags/components/add-tag-tile";
import { TagCard } from "@/features/settings/tags/components/tag-card";
import {
  DETENT_HEIGHTS_VH,
  TagEditorSheet,
} from "@/features/settings/tags/components/tag-editor-sheet";
import type { TagCardData } from "@/features/settings/tags/types";

export function TagsSection() {
  const { data, isPending, isError, error } = useTags();
  const deleteTag = useDeleteTag();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"edit" | "create">("edit");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetSize, setSheetSize] = useState(1);

  // Reserve space below the grid matching the sheet's current detent, so
  // expanding the sheet doesn't permanently bury the row behind it.
  const gridPaddingBottom =
    editorOpen && editorMode === "edit"
      ? `${DETENT_HEIGHTS_VH[sheetSize]}svh`
      : undefined;

  const visible = useMemo<TagCardData[]>(
    () =>
      (data?.tags ?? [])
        .map((tag) => ({ id: tag.id, name: tag.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data?.tags],
  );

  const allTags: Tag[] = data?.tags ?? [];
  const activeTag = allTags.find((tag) => tag.id === activeId) ?? null;
  const orderedIds = visible.map((tag) => tag.id);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function openEditor(id: string) {
    setActiveId(id);
    setEditorMode("edit");
    setEditorOpen(true);
  }

  function openCreate() {
    setActiveId(null);
    setEditorMode("create");
    setEditorOpen(true);
  }

  function deleteSelected() {
    Promise.all([...selected].map((id) => deleteTag.mutateAsync(id))).then(
      () => setSelected(new Set()),
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-border bg-muted px-3.5 py-3 text-[13px] text-muted-foreground">
        Couldn't load tags: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground tabular-nums uppercase">
          {selected.size > 0
            ? `${selected.size} selected`
            : `${data?.totalCount ?? 0} tags`}
        </h2>
        {selected.size > 0 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteTag.isPending}
              onClick={deleteSelected}
            >
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </div>

      {isPending ? (
        <div className="px-1 py-6 text-[13px] text-muted-foreground">
          Loading tags…
        </div>
      ) : (
        <div
          className="grid gap-3 transition-[padding-bottom] duration-300 ease-out [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]"
          style={{ paddingBottom: gridPaddingBottom }}
        >
          <AddTagTile onClick={openCreate} />
          {visible.map((tag) => (
            <TagCard
              key={tag.id}
              tag={tag}
              selected={selected.has(tag.id)}
              onToggleSelect={toggleSelect}
              onOpen={openEditor}
            />
          ))}
        </div>
      )}

      <TagEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        tag={activeTag}
        allTags={allTags}
        orderedIds={orderedIds}
        size={sheetSize}
        onSizeChange={setSheetSize}
        onNavigate={setActiveId}
        onCreated={(created) => {
          setActiveId(created.id);
          setEditorMode("edit");
        }}
      />
    </div>
  );
}
