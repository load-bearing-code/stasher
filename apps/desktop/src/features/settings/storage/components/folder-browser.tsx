import { Button } from "@stasher/ui/components/button";
import { ChevronLeftIcon, FolderIcon } from "lucide-react";

export type FolderBrowserState = {
  path: string;
  dirs: string[] | null;
  error: string | null;
};

const parentOf = (path: string) => path.split("/").filter(Boolean).slice(0, -1).join("/");
const joinPath = (path: string, name: string) => [path, name].filter(Boolean).join("/");

export function FolderBrowser({
  state,
  onOpen,
  onUse,
  onCancel,
}: {
  state: FolderBrowserState;
  onOpen: (path: string) => void;
  onUse: (path: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="col-start-2 flex flex-col gap-1 rounded-xl bg-well shadow-well p-2">
      <div className="flex items-center gap-2 px-1 pb-1">
        <Button
          variant="ghost"
          className="size-6 p-0"
          disabled={!state.path}
          onClick={() => onOpen(parentOf(state.path))}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">/{state.path}</span>
        <Button size="sm" onClick={() => onUse(state.path)}>
          Use this folder
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="flex max-h-48 flex-col overflow-y-auto">
        {state.error && <p className="px-2 py-1 text-xs text-destructive">{state.error}</p>}
        {!state.error && state.dirs === null && (
          <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>
        )}
        {state.dirs?.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">No subfolders.</p>
        )}
        {state.dirs?.map((name) => (
          <button
            key={name}
            type="button"
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-xs hover:bg-secondary"
            onClick={() => onOpen(joinPath(state.path, name))}
          >
            <FolderIcon className="size-3.5 text-muted-foreground" />
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
