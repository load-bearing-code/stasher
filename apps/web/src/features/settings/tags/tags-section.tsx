import { useMemo, useState } from "react";
import { useTags } from "@/features/settings/tags/tags-api";
import { AddTagTile } from "@/features/settings/tags/components/add-tag-tile";
import { TagCard } from "@/features/settings/tags/components/tag-card";
import { TagSelectionBar } from "@/features/settings/tags/components/tag-selection-bar";
import { TagsToolbar } from "@/features/settings/tags/components/tags-toolbar";
import type {
  TagCardData,
  TagSortMode,
} from "@/features/settings/tags/types";

function sortTags(tags: TagCardData[], sort: TagSortMode): TagCardData[] {
  if (sort === "hidden") {
    return tags
      .filter((tag) => tag.hidden)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  if (sort === "most-used") {
    return [...tags].sort(
      (a, b) =>
        (b.postCount ?? 0) - (a.postCount ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }
  return [...tags].sort((a, b) => a.name.localeCompare(b.name));
}

export function TagsSection() {
  const { data, isPending, isError, error } = useTags();
  const [sort, setSort] = useState<TagSortMode>("most-used");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const cards: TagCardData[] = (data?.tags ?? []).map((tag) => ({
      id: tag.id,
      name: tag.name,
    }));
    const sorted = sortTags(cards, sort);
    const needle = filter.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((tag) => tag.name.toLowerCase().includes(needle));
  }, [data?.tags, sort, filter]);

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

  if (isError) {
    return (
      <div className="rounded-lg border border-border bg-muted px-3.5 py-3 text-[13px] text-muted-foreground">
        Couldn't load tags: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TagsToolbar
        count={data?.totalCount ?? 0}
        sort={sort}
        onSortChange={setSort}
        filter={filter}
        onFilterChange={setFilter}
        onNewTag={() => {
          // The create/edit sheet is a later slice.
        }}
      />

      {selected.size > 0 ? (
        <TagSelectionBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      {isPending ? (
        <div className="px-1 py-6 text-[13px] text-muted-foreground">
          Loading tags…
        </div>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          <AddTagTile
            onClick={() => {
              // The create/edit sheet is a later slice.
            }}
          />
          {visible.map((tag) => (
            <TagCard
              key={tag.id}
              tag={tag}
              selected={selected.has(tag.id)}
              onToggleSelect={toggleSelect}
              onOpen={() => {
                // The editor sheet is a later slice.
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
