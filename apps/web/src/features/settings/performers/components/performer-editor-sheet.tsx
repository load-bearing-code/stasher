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
import { Pencil, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PerformerPlatformsSection } from "@/features/settings/performers/components/performer-platforms-section";
import {
  type Performer,
  useCreatePerformer,
  useUpdatePerformer,
} from "@/features/settings/performers/performers-api";

interface PerformerEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "edit" | "create";
  performer: Performer | null;
  allPerformers: Performer[];
  onCreated: (performer: Performer) => void;
}

function findNameMatch(
  performers: Performer[],
  name: string,
  excludeId?: string,
): Performer | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return performers.find(
    (performer) => performer.id !== excludeId && performer.name.toLowerCase() === needle,
  );
}

function parseAliases(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  ];
}

export function PerformerEditorSheet({
  open,
  onOpenChange,
  mode,
  performer,
  allPerformers,
  onCreated,
}: PerformerEditorSheetProps) {
  const [draftName, setDraftName] = useState("");
  const [draftDisambiguation, setDraftDisambiguation] = useState("");
  const [draftAliases, setDraftAliases] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const createPerformer = useCreatePerformer();
  const updatePerformer = useUpdatePerformer();
  const isCreate = mode === "create";

  useEffect(() => {
    if (!open) return;
    setDraftName(isCreate || !performer ? "" : performer.name);
    setDraftDisambiguation(isCreate || !performer ? "" : (performer.disambiguation ?? ""));
    setDraftAliases(isCreate || !performer ? "" : performer.aliases.join(", "));
  }, [isCreate, open, performer]);

  const name = draftName.trim();
  const disambiguation = draftDisambiguation.trim();
  const aliases = parseAliases(draftAliases);
  const match = findNameMatch(allPerformers, name, isCreate ? undefined : performer?.id);
  const isPending = createPerformer.isPending || updatePerformer.isPending;
  const mutationError = isCreate ? createPerformer.error : updatePerformer.error;
  const isDirty =
    isCreate ||
    (!!performer &&
      (name !== performer.name ||
        disambiguation !== (performer.disambiguation ?? "") ||
        aliases.join(",") !== performer.aliases.join(",")));

  function save() {
    if (!name || match) return;
    const input = {
      name,
      disambiguation: disambiguation || null,
      aliases,
    };
    if (isCreate) {
      createPerformer.mutate(input, {
        onSuccess: (created) => {
          onCreated(created);
          setOpen(false);
        },
      });
      return;
    }
    if (!performer) return;
    updatePerformer.mutate({ id: performer.id, ...input }, { onSuccess: () => setOpen(false) });
  }

  function setOpen(nextOpen: boolean) {
    if (!nextOpen) {
      createPerformer.reset();
      updatePerformer.reset();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        initialFocus={nameRef}
        backdropClassName="bg-black/60 backdrop-blur-md"
      >
        <SheetHeader className="px-6 py-5">
          <div className="relative flex w-full items-center">
            <SheetTitle>{isCreate ? "New performer" : performer?.name}</SheetTitle>
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
        </SheetHeader>

        <SheetBody className="flex flex-col gap-4 px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/60 bg-muted">
              <UserRound className="size-7 text-muted-foreground" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="relative">
                <Input
                  ref={nameRef}
                  disabled={isPending}
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      save();
                    }
                  }}
                  placeholder="Performer name"
                  className="h-11 pr-10 pl-3.5 text-base font-semibold"
                />
                <Pencil className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Input
                disabled={isPending}
                value={draftDisambiguation}
                onChange={(event) => setDraftDisambiguation(event.target.value)}
                placeholder="Disambiguation (optional)"
                className="h-11"
              />
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-5">
            <label htmlFor="performer-aliases" className="text-sm font-medium text-foreground">
              Aliases
            </label>
            <Input
              id="performer-aliases"
              disabled={isPending}
              value={draftAliases}
              onChange={(event) => setDraftAliases(event.target.value)}
              placeholder="Aliases"
              className="h-11"
            />
            <p className="px-1 text-xs text-muted-foreground">Separate aliases with commas.</p>
          </div>
          {!isCreate && performer && open ? (
            <PerformerPlatformsSection key={performer.id} performerId={performer.id} />
          ) : (
            <p className="border-t border-border/60 pt-5 text-sm text-muted-foreground">
              Save the performer before linking platform accounts.
            </p>
          )}
          {match ? <p className="text-xs text-warning">"{match.name}" already exists</p> : null}
          {mutationError ? (
            <p className="text-xs text-destructive">{mutationError.message}</p>
          ) : null}
        </SheetBody>
        <SheetFooter className="justify-end px-6 py-4">
          <SheetClose
            render={
              <Button variant="ghost" disabled={isPending}>
                Close
              </Button>
            }
          />
          <Button disabled={!name || !!match || !isDirty || isPending} onClick={save}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
