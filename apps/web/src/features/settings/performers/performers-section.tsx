import { Button } from "@stasher/ui/components/button";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PerformerCard } from "@/features/settings/performers/components/performer-card";
import { PerformerEditorSheet } from "@/features/settings/performers/components/performer-editor-sheet";
import { type Performer, usePerformers } from "@/features/settings/performers/performers-api";
import { pluralize } from "@/shared/pluralize";

export function PerformersSection() {
  const { data, isPending, isError, error } = usePerformers();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"edit" | "create">("edit");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const performers = data?.performers ?? [];
  const visiblePerformers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return performers;
    return performers.filter(
      (performer) =>
        performer.name.toLowerCase().includes(needle) ||
        performer.disambiguation?.toLowerCase().includes(needle) ||
        performer.aliases.some((alias) => alias.toLowerCase().includes(needle)),
    );
  }, [performers, query]);
  const activePerformer: Performer | null =
    performers.find((performer) => performer.id === activeId) ?? null;

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
        Couldn't load performers: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 py-1 pr-1 pl-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex h-6 items-center gap-3">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground tabular-nums uppercase">
            {data?.totalCount ?? 0} {pluralize(data?.totalCount ?? 0, "performer")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-muted-foreground sm:w-72">
            <Search className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter performers"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <Button size="sm" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            New performer
          </Button>
        </div>
      </div>

      {isPending ? (
        <div className="px-1 py-6 text-[13px] text-muted-foreground">Loading performers…</div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
          {visiblePerformers.map((performer) => (
            <PerformerCard key={performer.id} performer={performer} onOpen={openEditor} />
          ))}
          {performers.length > 0 && visiblePerformers.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
              No performers match “{query.trim()}”.
            </div>
          ) : null}
        </div>
      )}

      <PerformerEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        performer={activePerformer}
        allPerformers={performers}
        onCreated={(created) => {
          setActiveId(created.id);
          setEditorMode("edit");
        }}
      />
    </div>
  );
}
