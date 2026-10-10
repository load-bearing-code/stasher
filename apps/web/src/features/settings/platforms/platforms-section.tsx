import { Button } from "@stasher/ui/components/button";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PlatformCard } from "@/features/settings/platforms/components/platform-card";
import { PlatformEditorSheet } from "@/features/settings/platforms/components/platform-editor-sheet";
import { SelectCheckbox } from "@/features/settings/platforms/components/select-checkbox";
import {
  type Platform,
  useDeletePlatform,
  usePlatforms,
} from "@/features/settings/platforms/platforms-api";
import { pluralize } from "@/shared/pluralize";

export function PlatformsSection() {
  const { data, isPending, isError, error } = usePlatforms();
  const deletePlatform = useDeletePlatform();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"edit" | "create">("edit");
  const [activeId, setActiveId] = useState<string | null>(null);

  const platforms = data?.platforms ?? [];
  const activePlatform: Platform | null =
    platforms.find((platform) => platform.id === activeId) ?? null;

  const selectAllState = useMemo<"checked" | "unchecked" | "indeterminate">(() => {
    if (selected.size === 0) return "unchecked";
    if (selected.size === platforms.length) return "checked";
    return "indeterminate";
  }, [selected.size, platforms.length]);

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

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === platforms.length
        ? new Set()
        : new Set(platforms.map((platform) => platform.id)),
    );
  }

  function deleteSelected() {
    Promise.all([...selected].map((id) => deletePlatform.mutateAsync(id))).then(() =>
      setSelected(new Set()),
    );
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

  if (isError) {
    return (
      <div className="rounded-lg border border-border bg-muted px-3.5 py-3 text-[13px] text-muted-foreground">
        Couldn't load platforms: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between py-1 pr-1 pl-3.5">
        <div className="flex h-6 items-center gap-3">
          {platforms.length > 0 ? (
            <SelectCheckbox
              state={selectAllState}
              aria-label={
                selectAllState === "checked" ? "Deselect all platforms" : "Select all platforms"
              }
              onClick={toggleSelectAll}
            />
          ) : null}
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground tabular-nums uppercase">
            {selected.size > 0
              ? `${selected.size} selected`
              : `${data?.totalCount ?? 0} ${pluralize(data?.totalCount ?? 0, "platform")}`}
          </h2>
          {selected.size > 0 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={deletePlatform.isPending}
                onClick={deleteSelected}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          ) : null}
        </div>
        {selected.size === 0 ? (
          <Button size="sm" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            New platform
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <div className="px-1 py-6 text-[13px] text-muted-foreground">Loading platforms…</div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
          {platforms.map((platform) => (
            <PlatformCard
              key={platform.id}
              platform={platform}
              selected={selected.has(platform.id)}
              onOpen={openEditor}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      <PlatformEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        platform={activePlatform}
        allPlatforms={platforms}
        onCreated={(created) => {
          setActiveId(created.id);
          setEditorMode("edit");
        }}
      />
    </div>
  );
}
