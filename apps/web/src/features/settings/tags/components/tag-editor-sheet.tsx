import { Button } from "@stasher/ui/components/button";
import { Input } from "@stasher/ui/components/input";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@stasher/ui/components/sheet";
import { cn } from "@stasher/ui/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useCreateTag,
  useDeleteTag,
  useUpdateTag,
  type Tag,
} from "@/features/settings/tags/tags-api";

const HINTS_STORAGE_KEY = "stasher.tagEditor.hintsDismissed";

// Three detents for the sheet, cycled by the grab handle or ArrowUp/Down.
const DETENT_HEIGHTS = ["h-[42svh]", "h-[62svh]", "h-[85svh]"];

interface TagEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "edit" | "create";
  tag: Tag | null;
  allTags: Tag[];
  orderedIds: string[];
  onNavigate: (id: string) => void;
  onCreated: (tag: Tag) => void;
}

function useDismissedHints(): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(HINTS_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(HINTS_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures; hints simply reappear next session.
    }
  }, []);
  return [dismissed, dismiss];
}

function findNameMatch(
  tags: Tag[],
  name: string,
  excludeId?: string,
): Tag | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return tags.find(
    (tag) => tag.id !== excludeId && tag.name.toLowerCase() === needle,
  );
}

export function TagEditorSheet({
  open,
  onOpenChange,
  mode,
  tag,
  allTags,
  orderedIds,
  onNavigate,
  onCreated,
}: TagEditorSheetProps) {
  const [size, setSize] = useState(1);
  const [draftName, setDraftName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [hintsDismissed, dismissHints] = useDismissedHints();
  const nameRef = useRef<HTMLInputElement>(null);

  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const createTag = useCreateTag();

  const isCreate = mode === "create";

  // Reset the draft whenever the active tag or mode changes.
  useEffect(() => {
    setDraftName(isCreate ? "" : (tag?.name ?? ""));
    setConfirmingDelete(false);
  }, [tag?.id, isCreate, open]);

  const match = findNameMatch(allTags, draftName, isCreate ? undefined : tag?.id);
  const renamed = !isCreate && tag ? draftName.trim() !== tag.name : false;

  function saveName() {
    if (isCreate || !tag) return;
    const name = draftName.trim();
    if (!name || name === tag.name || match) return;
    updateTag.mutate({
      id: tag.id,
      name,
      description: tag.description,
      performerIds: tag.performers.map((p) => p.id),
    });
  }

  function create() {
    const name = draftName.trim();
    if (!name || match) return;
    createTag.mutate({ name }, { onSuccess: (created) => onCreated(created) });
  }

  function removePerformer(performerId: string) {
    if (!tag) return;
    updateTag.mutate({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      performerIds: tag.performers
        .filter((p) => p.id !== performerId)
        .map((p) => p.id),
    });
  }

  function confirmDelete() {
    if (!tag) return;
    deleteTag.mutate(tag.id, { onSuccess: () => onOpenChange(false) });
  }

  const currentIndex = tag ? orderedIds.indexOf(tag.id) : -1;

  function navigate(delta: number) {
    if (currentIndex === -1) return;
    const nextId = orderedIds[currentIndex + delta];
    if (nextId) onNavigate(nextId);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    switch (event.key) {
      case "Escape":
        dismissHints();
        break;
      case "ArrowUp":
        event.preventDefault();
        setSize((s) => Math.min(DETENT_HEIGHTS.length - 1, s + 1));
        dismissHints();
        break;
      case "ArrowDown":
        event.preventDefault();
        setSize((s) => Math.max(0, s - 1));
        dismissHints();
        break;
      case "ArrowLeft":
        if (!typing && !isCreate) {
          event.preventDefault();
          navigate(-1);
          dismissHints();
        }
        break;
      case "ArrowRight":
        if (!typing && !isCreate) {
          event.preventDefault();
          navigate(1);
          dismissHints();
        }
        break;
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        initialFocus={nameRef}
        onHandleClick={
          isCreate
            ? undefined
            : () => setSize((s) => (s + 1) % DETENT_HEIGHTS.length)
        }
        onKeyDown={handleKeyDown}
        className={cn(!isCreate && DETENT_HEIGHTS[size])}
      >
        <SheetHeader className="flex-col gap-1.5">
          {isCreate ? (
            <div className="relative flex w-full items-center justify-center">
              <SheetTitle>New tag</SheetTitle>
              <SheetClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close"
                    className="absolute right-0"
                  >
                    <X />
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <SheetTitle className="sr-only">Edit tag</SheetTitle>
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {currentIndex === -1 ? "—" : currentIndex + 1} /{" "}
                {orderedIds.length}
              </span>
              <div className="flex items-center gap-1">
                {!hintsDismissed ? (
                  <span className="mr-1 hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                    <kbd className="rounded bg-muted px-1">←</kbd>
                    <kbd className="rounded bg-muted px-1">→</kbd>
                    <kbd className="rounded bg-muted px-1">↑</kbd>
                    <kbd className="rounded bg-muted px-1">↓</kbd>
                    <kbd className="rounded bg-muted px-1">⎋</kbd>
                  </span>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous tag"
                  disabled={currentIndex <= 0}
                  onClick={() => navigate(-1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next tag"
                  disabled={
                    currentIndex === -1 ||
                    currentIndex >= orderedIds.length - 1
                  }
                  onClick={() => navigate(1)}
                >
                  <ChevronRight />
                </Button>
                <SheetClose
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label="Close">
                      <X />
                    </Button>
                  }
                />
              </div>
            </div>
          )}
        </SheetHeader>

        {!isCreate ? (
          <div className="flex flex-col gap-1.5 px-4 pt-4">
            <Input
              ref={nameRef}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveName();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setDraftName(tag?.name ?? "");
                  event.currentTarget.blur();
                }
              }}
              placeholder="Tag name"
              className="h-8 text-[15px] font-medium"
            />
            {match ? (
              <p className="text-xs text-warning">
                Will merge into {match.name}
              </p>
            ) : renamed ? (
              <p className="text-xs text-muted-foreground">
                Press Enter to rename
              </p>
            ) : null}
          </div>
        ) : null}

        {isCreate ? (
          <SheetBody className="flex flex-col gap-2 py-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <TagIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={nameRef}
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      create();
                    }
                  }}
                  placeholder="New tag name"
                  className="h-9 pl-9 text-[15px]"
                />
              </div>
              <Button
                size="lg"
                disabled={!draftName.trim() || !!match || createTag.isPending}
                onClick={create}
              >
                Create
              </Button>
            </div>
            {match ? (
              <p className="text-xs text-warning">
                "{match.name}" already exists
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Next you'll pick posts for it
              </p>
            )}
          </SheetBody>
        ) : (
          <>
            <SheetBody className="flex flex-col gap-5 py-2">
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Posts · 0
                  </h3>
                  <Button variant="secondary" size="sm" disabled>
                    <Plus data-icon="inline-start" />
                    Tag posts
                  </Button>
                </div>
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
                  No posts have this tag yet. Use{" "}
                  <span className="text-foreground underline">Tag posts</span>
                  {" "}to choose some.
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Performers · {tag?.performers.length ?? 0}
                  </h3>
                  <Button variant="secondary" size="sm" disabled>
                    <Plus data-icon="inline-start" />
                    Tag performers
                  </Button>
                </div>
                {tag && tag.performers.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tag.performers.map((performer) => (
                      <span
                        key={performer.id}
                        className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-[13px]"
                      >
                        {performer.name}
                        <button
                          type="button"
                          aria-label={`Remove ${performer.name}`}
                          onClick={() => removePerformer(performer.id)}
                          className="flex size-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
                    No performers linked yet. Use{" "}
                    <span className="text-foreground underline">
                      Tag performers
                    </span>
                    {" "}to choose some.
                  </div>
                )}
              </section>
            </SheetBody>

            <SheetFooter>
              {confirmingDelete ? (
                <>
                  <span className="text-[13px] text-muted-foreground">
                    Delete this tag?
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteTag.isPending}
                    onClick={confirmDelete}
                  >
                    Confirm delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              )}
              <div className="flex-1" />
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
