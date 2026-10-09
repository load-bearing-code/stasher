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
import { Globe, ImagePlus, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type Platform,
  useCreatePlatform,
  useUpdatePlatform,
} from "@/features/settings/platforms/platforms-api";
import { apiAssetURL } from "@/shared/api/graphql";

interface PlatformEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "edit" | "create";
  platform: Platform | null;
  allPlatforms: Platform[];
  onCreated: (platform: Platform) => void;
}

interface ArtworkPickerProps {
  kind: "icon" | "wordmark";
  file: File | null;
  currentURL: string | null;
  disabled: boolean;
  onSelect: (file: File) => void;
}

const artworkAccept =
  "image/avif,image/gif,image/jpeg,image/png,image/svg+xml,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico";

function ArtworkPicker({ kind, file, currentURL, disabled, onSelect }: ArtworkPickerProps) {
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isIcon = kind === "icon";

  useEffect(() => {
    if (!file) {
      setPreviewURL(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewURL(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const displayedURL = previewURL ?? currentURL;
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={artworkAccept}
      className="sr-only"
      disabled={disabled}
      onChange={(event) => {
        const selectedFile = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (selectedFile) onSelect(selectedFile);
      }}
    />
  );

  if (isIcon) {
    return (
      <>
        {fileInput}
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={displayedURL ? "Replace platform icon" : "Choose platform icon"}
          className="group relative size-10 overflow-hidden rounded-lg p-0"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => inputRef.current?.click()}
        >
          {displayedURL ? (
            <img
              src={displayedURL}
              alt="Platform icon preview"
              className="size-full object-cover"
            />
          ) : (
            <Globe className="size-6 text-muted-foreground" />
          )}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ImagePlus className="size-5 text-white" />
          </span>
        </Button>
      </>
    );
  }

  return (
    <div className="flex min-h-20 items-center gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Wordmark</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Shown in filters and on posts</p>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-3">
        {displayedURL ? (
          <img
            src={displayedURL}
            alt="Platform wordmark preview"
            className="h-8 w-28 object-contain object-right"
          />
        ) : (
          <span className="text-xs text-muted-foreground">No wordmark</span>
        )}
        {fileInput}
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => inputRef.current?.click()}
        >
          {displayedURL ? "Replace" : "Choose"}
        </Button>
      </div>
    </div>
  );
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
    (platform) => platform.id !== excludeId && platform.name.toLowerCase() === needle,
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
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [wordmarkFile, setWordmarkFile] = useState<File | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const createPlatform = useCreatePlatform();
  const updatePlatform = useUpdatePlatform();

  const isCreate = mode === "create";

  useEffect(() => {
    if (!open) return;
    setDraftName(isCreate || !platform?.id ? "" : platform.name);
    setIconFile(null);
    setWordmarkFile(null);
  }, [platform?.id, platform?.name, isCreate, open]);

  const match = findNameMatch(allPlatforms, draftName, isCreate ? undefined : platform?.id);
  const isPending = createPlatform.isPending || updatePlatform.isPending;
  const mutationError = isCreate ? createPlatform.error : updatePlatform.error;
  const currentIconURL = platform?.iconUri ? apiAssetURL(platform.iconUri) : null;
  const currentWordmarkURL = platform?.wordmarkUri ? apiAssetURL(platform.wordmarkUri) : null;
  const name = draftName.trim();
  const isDirty =
    isCreate ||
    (!!platform && name !== platform.name) ||
    iconFile !== null ||
    wordmarkFile !== null;

  function save() {
    const name = draftName.trim();
    if (!name || match) return;
    const artwork = {
      ...(iconFile ? { icon: iconFile } : {}),
      ...(wordmarkFile ? { wordmark: wordmarkFile } : {}),
    };
    if (isCreate) {
      createPlatform.mutate(
        { id: slugify(name), name, ...artwork },
        {
          onSuccess: (created) => {
            onCreated(created);
            setOpen(false);
          },
        },
      );
      return;
    }
    if (!platform) return;
    updatePlatform.mutate(
      { id: platform.id, name, ...artwork },
      { onSuccess: () => setOpen(false) },
    );
  }

  function selectArtwork(kind: "icon" | "wordmark", file: File) {
    const setFile = kind === "icon" ? setIconFile : setWordmarkFile;
    setFile(file);
  }

  function setOpen(nextOpen: boolean) {
    if (!nextOpen) {
      createPlatform.reset();
      updatePlatform.reset();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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

        <SheetBody className="flex flex-col gap-3 py-4">
          <div className="flex items-center gap-2">
            <ArtworkPicker
              kind="icon"
              file={iconFile}
              currentURL={currentIconURL}
              disabled={isPending}
              onSelect={(file) => selectArtwork("icon", file)}
            />
            <div className="relative flex-1">
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
                placeholder="Platform name"
                className="h-10 pr-10 pl-3.5 text-base font-semibold"
              />
              <Pencil className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <ArtworkPicker
            kind="wordmark"
            file={wordmarkFile}
            currentURL={currentWordmarkURL}
            disabled={isPending}
            onSelect={(file) => selectArtwork("wordmark", file)}
          />
          {match ? <p className="text-xs text-warning">"{match.name}" already exists</p> : null}
          {mutationError ? (
            <p className="text-xs text-destructive">{mutationError.message}</p>
          ) : null}
        </SheetBody>
        <SheetFooter className="justify-end">
          <Button disabled={!name || !!match || !isDirty || isPending} onClick={save}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
