import { Button } from "@stasher/ui/components/button";
import { Input } from "@stasher/ui/components/input";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@stasher/ui/components/sheet";
import { Globe, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  useCreatePlatform,
  useUpdatePlatform,
  type Platform,
} from "@/features/settings/platforms/platforms-api";

interface PlatformEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "edit" | "create";
  platform: Platform | null;
  allPlatforms: Platform[];
  onCreated: (platform: Platform) => void;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findNameMatch(
  platforms: Platform[],
  name: string,
  excludeId?: string,
): Platform | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return platforms.find(
    (platform) =>
      platform.id !== excludeId && platform.name.toLowerCase() === needle,
  );
}

export function PlatformEditorSheet({
  open,
  onOpenChange,
  mode,
  platform,
  allPlatforms,
  onCreated,
}: PlatformEditorSheetProps) {
  const [draftName, setDraftName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const createPlatform = useCreatePlatform();
  const updatePlatform = useUpdatePlatform();

  const isCreate = mode === "create";

  useEffect(() => {
    setDraftName(isCreate ? "" : (platform?.name ?? ""));
  }, [platform?.id, isCreate, open]);

  const match = findNameMatch(
    allPlatforms,
    draftName,
    isCreate ? undefined : platform?.id,
  );

  function saveName() {
    if (isCreate || !platform) return;
    const name = draftName.trim();
    if (!name || name === platform.name || match) return;
    updatePlatform.mutate({ id: platform.id, name });
  }

  function create() {
    const name = draftName.trim();
    if (!name || match) return;
    createPlatform.mutate(
      { id: slugify(name), name },
      { onSuccess: (created) => onCreated(created) },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent initialFocus={nameRef}>
        <SheetHeader className="flex-col gap-1.5">
          <div className="relative flex w-full items-center justify-center">
            <SheetTitle>{isCreate ? "New platform" : "Edit platform"}</SheetTitle>
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

        <SheetBody className="flex flex-col gap-2 py-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={nameRef}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={isCreate ? undefined : saveName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (isCreate) {
                      create();
                    } else {
                      saveName();
                      event.currentTarget.blur();
                    }
                  }
                }}
                placeholder="Platform name"
                className="h-9 pl-9 text-[15px]"
              />
            </div>
            {isCreate ? (
              <Button
                size="lg"
                disabled={
                  !draftName.trim() || !!match || createPlatform.isPending
                }
                onClick={create}
              >
                Create
              </Button>
            ) : null}
          </div>
          {match ? (
            <p className="text-xs text-warning">
              "{match.name}" already exists
            </p>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
