import type { NfsShareConfig } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { Input } from "@stasher/ui/components/input";
import { Label } from "@stasher/ui/components/label";
import { invoke } from "@tauri-apps/api/core";
import { ChevronLeftIcon, FolderIcon, HardDriveIcon, LinkIcon, ServerIcon, UnlinkIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

function Row({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
      <Label htmlFor={htmlFor} className="text-sm text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function IconInput({
  icon,
  className,
  ...props
}: { icon: ReactNode } & React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <Input className={`h-10 pr-3 pl-10 bg-black/30! font-mono text-xs md:text-xs ${className ?? ""}`} {...props} />
    </div>
  );
}

export function StorageSettings() {
  const [server, setServer] = useState("");
  const [exportPath, setExportPath] = useState("");
  const [mediaPath, setMediaPath] = useState("");
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exports, setExports] = useState<string[] | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [folderBrowser, setFolderBrowser] = useState<{
    path: string;
    dirs: string[] | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    invoke<NfsShareConfig | null>("get_nfs_share").then((config) => {
      if (config) {
        setServer(config.server);
        setExportPath(config.exportPath);
        setMediaPath(config.mediaPath);
        setMounted(true);
      }
    });
  }, []);

  async function run(command: string, args: Record<string, unknown>, nextMounted: boolean) {
    setBusy(true);
    setError(null);
    try {
      await invoke(command, args);
      setMounted(nextMounted);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function browseExports() {
    setBrowsing(true);
    setBrowseError(null);
    setExports(null);
    try {
      setExports(await invoke<string[]>("list_nfs_exports", { server }));
    } catch (err) {
      setBrowseError(String(err));
    } finally {
      setBrowsing(false);
    }
  }

  async function openFolder(path: string) {
    setFolderBrowser({ path, dirs: null, error: null });
    try {
      const dirs = await invoke<string[]>("list_nfs_dirs", { server, exportPath, path });
      setFolderBrowser({ path, dirs, error: null });
    } catch (err) {
      setFolderBrowser({ path, dirs: null, error: String(err) });
    }
  }

  const complete = Boolean(server && exportPath);
  const parentOf = (path: string) => path.split("/").filter(Boolean).slice(0, -1).join("/");
  const joinPath = (path: string, name: string) => [path, name].filter(Boolean).join("/");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-medium">Media location</h2>
        <p className="text-sm text-muted-foreground">Where downloaded media is written</p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <Row label="Server" htmlFor="nfs-server">
          <IconInput
            id="nfs-server"
            icon={<ServerIcon />}
            placeholder="nas.local"
            value={server}
            disabled={mounted}
            onChange={(event) => setServer(event.target.value)}
          />
        </Row>
        <Row label="Export path" htmlFor="nfs-export">
          <div className="flex gap-2">
            <div className="flex-1">
              <IconInput
                id="nfs-export"
                icon={<HardDriveIcon />}
                placeholder="/volume1/media"
                value={exportPath}
                disabled={mounted}
                onChange={(event) => setExportPath(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="h-10"
              disabled={mounted || browsing || !server}
              onClick={browseExports}
            >
              {browsing ? "Searching..." : "Browse"}
            </Button>
          </div>
        </Row>
        {exports && (
          <div className="flex flex-col gap-1 pl-[7.75rem]">
            {exports.length === 0 && (
              <p className="text-xs text-muted-foreground">No exports found on {server}.</p>
            )}
            {exports.map((path) => (
              <button
                key={path}
                type="button"
                className="cursor-pointer rounded-lg px-3 py-1.5 text-left font-mono text-xs hover:bg-secondary"
                onClick={() => {
                  setExportPath(path);
                  setExports(null);
                }}
              >
                {path}
              </button>
            ))}
          </div>
        )}
        {browseError && <p className="pl-[7.75rem] text-xs text-destructive">{browseError}</p>}
        <Row label="Media folder" htmlFor="nfs-media">
          <div className="flex gap-2">
            <div className="flex-1">
              <IconInput
                id="nfs-media"
                icon={<FolderIcon />}
                placeholder="/ (export root)"
                value={mediaPath}
                disabled={mounted}
                onChange={(event) => setMediaPath(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="h-10"
              disabled={mounted || !complete}
              onClick={() => openFolder(mediaPath.split("/").filter(Boolean).join("/"))}
            >
              Browse
            </Button>
          </div>
        </Row>
        {folderBrowser && (
          <div className="ml-[7.75rem] flex flex-col gap-1 rounded-xl border border-white/10 bg-black/30 p-2">
            <div className="flex items-center gap-2 px-1 pb-1">
              <Button
                variant="ghost"
                className="size-7 p-0"
                disabled={!folderBrowser.path}
                onClick={() => openFolder(parentOf(folderBrowser.path))}
              >
                <ChevronLeftIcon />
              </Button>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                /{folderBrowser.path}
              </span>
              <Button
                className="h-7 px-3 text-xs"
                onClick={() => {
                  setMediaPath(folderBrowser.path);
                  setFolderBrowser(null);
                }}
              >
                Use this folder
              </Button>
              <Button
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setFolderBrowser(null)}
              >
                Cancel
              </Button>
            </div>
            <div className="flex max-h-48 flex-col overflow-y-auto">
              {folderBrowser.error && (
                <p className="px-2 py-1 text-xs text-destructive">{folderBrowser.error}</p>
              )}
              {!folderBrowser.error && folderBrowser.dirs === null && (
                <p className="px-2 py-1 text-xs text-muted-foreground">Loading...</p>
              )}
              {folderBrowser.dirs?.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">No subfolders.</p>
              )}
              {folderBrowser.dirs?.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-xs hover:bg-secondary"
                  onClick={() => openFolder(joinPath(folderBrowser.path, name))}
                >
                  <FolderIcon className="size-3.5 text-muted-foreground" />
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            <HardDriveIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm">
              {complete ? `${server}:${exportPath}${mediaPath ? `/${mediaPath.replace(/^\/+/, "")}` : ""}` : "No share configured"}
            </div>
            <div className="truncate text-sm text-muted-foreground">
              {mounted ? "Writing media directly over NFSv3" : "Saving to the local folder"}
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm ${
              mounted
                ? "border-success/30 bg-success/10 text-success"
                : "border-border text-muted-foreground"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${mounted ? "bg-success" : "bg-muted-foreground"}`}
            />
            {mounted ? "Connected" : "Disconnected"}
          </span>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          {mounted ? (
            <Button className="h-10 px-5" disabled={busy} onClick={() => run("disconnect_nfs_share", {}, false)}>
              <UnlinkIcon />
              {busy ? "Disconnecting..." : "Disconnect"}
            </Button>
          ) : (
            <Button
              className="h-10 px-5"
              disabled={busy || !complete}
              onClick={() =>
                run("connect_nfs_share", { config: { server, exportPath, mediaPath } }, true)
              }
            >
              <LinkIcon />
              {busy ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
