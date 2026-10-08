import type { NfsExport } from "@stasher/protocol";
import { Badge } from "@stasher/ui/components/badge";
import { Button } from "@stasher/ui/components/button";
import {
  CheckIcon,
  FolderIcon,
  FolderTreeIcon,
  HardDriveIcon,
  PlugIcon,
  ServerIcon,
  UnplugIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SettingsSection } from "@/features/settings/settings-section";
import {
  connectNfsShare,
  disconnectNfsShare,
  getNfsShare,
  listNfsDirs,
  listNfsExports,
} from "@/features/settings/storage/api";
import {
  FolderBrowser,
  type FolderBrowserState,
} from "@/features/settings/storage/components/folder-browser";
import { IconInput } from "@/shared/components/icon-input";
import { Row } from "@/shared/components/row";

// A plausible NAS address: a hostname or IP, before we try to reach it.
const isLikelyHost = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9.-]{2,}$/.test(value);

function formatSize(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[unit]}`;
}

export function StorageSettings() {
  const [server, setServer] = useState("");
  const [exportPath, setExportPath] = useState("");
  const [mediaPath, setMediaPath] = useState("");
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exports, setExports] = useState<NfsExport[] | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [folderBrowser, setFolderBrowser] = useState<FolderBrowserState | null>(null);

  useEffect(() => {
    getNfsShare().then((config) => {
      if (config) {
        setServer(config.server);
        setExportPath(config.exportPath);
        setMediaPath(config.mediaPath);
        setMounted(true);
      }
    });
  }, []);

  async function run(action: () => Promise<unknown>, nextMounted: boolean) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMounted(nextMounted);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  // Poll the server for its exports as soon as a plausible address is typed,
  // so the available mounts list themselves without a manual step.
  useEffect(() => {
    if (mounted) return;
    const host = server.trim();
    if (!isLikelyHost(host)) {
      setExports(null);
      setBrowseError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setBrowsing(true);
      setBrowseError(null);
      listNfsExports(host)
        .then((result) => {
          if (!cancelled) setExports(result);
        })
        .catch((err) => {
          if (!cancelled) {
            setExports(null);
            setBrowseError(String(err));
          }
        })
        .finally(() => {
          if (!cancelled) setBrowsing(false);
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [server, mounted]);

  async function openFolder(path: string) {
    setFolderBrowser({ path, dirs: null, error: null });
    try {
      const dirs = await listNfsDirs({ server, exportPath, path });
      setFolderBrowser({ path, dirs, error: null });
    } catch (err) {
      setFolderBrowser({ path, dirs: null, error: String(err) });
    }
  }

  const complete = Boolean(server && exportPath);

  return (
    <SettingsSection title="Media location" description="Where downloaded media is written">
      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 rounded-lg border border-white/10 bg-white/[0.035] p-3.5">
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
          <IconInput
            id="nfs-export"
            icon={<FolderTreeIcon />}
            placeholder="/volume1/media"
            value={exportPath}
            disabled={mounted}
            onChange={(event) => setExportPath(event.target.value)}
          />
        </Row>
        {!mounted && browsing && !exports && (
          <p className="col-start-2 text-xs text-muted-foreground">
            Looking for exports on {server.trim()}…
          </p>
        )}
        {!mounted && exports && exports.length > 0 && (
          <div className="col-start-2 flex flex-col gap-0.5">
            {exports.map((item) => {
              const selected = item.path === exportPath;
              const size = formatSize(item.totalBytes);
              return (
                <button
                  key={item.path}
                  type="button"
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-xs ${selected ? "bg-primary/15" : "hover:bg-secondary"}`}
                  onClick={() => setExportPath(item.path)}
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.path}</span>
                  {size && <span className="text-muted-foreground">{size}</span>}
                  {selected && <CheckIcon className="size-3.5 shrink-0 text-primary" />}
                </button>
              );
            })}
            <p className="px-2.5 pt-0.5 text-xs text-muted-foreground">
              {exports.length} {exports.length === 1 ? "export" : "exports"} on {server.trim()}
            </p>
          </div>
        )}
        {!mounted && exports && exports.length === 0 && (
          <p className="col-start-2 text-xs text-muted-foreground">
            No exports found on {server.trim()}.
          </p>
        )}
        {browseError && <p className="col-start-2 text-xs text-destructive">{browseError}</p>}
        <Row label="Media folder" htmlFor="nfs-media">
          <div className="flex gap-1.5">
            <IconInput
              id="nfs-media"
              icon={<FolderIcon />}
              placeholder="/ (export root)"
              value={mediaPath}
              disabled={mounted}
              onChange={(event) => setMediaPath(event.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-7"
              disabled={mounted || !complete}
              onClick={() => openFolder(mediaPath.split("/").filter(Boolean).join("/"))}
            >
              Choose…
            </Button>
          </div>
        </Row>
        {folderBrowser && (
          <FolderBrowser
            state={folderBrowser}
            onOpen={openFolder}
            onUse={(path) => {
              setMediaPath(path);
              setFolderBrowser(null);
            }}
            onCancel={() => setFolderBrowser(null)}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex size-[34px] shrink-0 items-center justify-center rounded-lg border bg-secondary text-muted-foreground">
            <HardDriveIcon className="size-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-mono text-xs font-medium">
              {complete
                ? `${server}:${exportPath}${mediaPath ? `/${mediaPath.replace(/^\/+/, "")}` : ""}`
                : "No share configured"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {mounted ? "Writing media directly over NFSv3" : "Saving to the local folder"}
            </span>
          </div>
          <Badge
            variant="outline"
            className={mounted ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"}
          >
            <span className={`size-1.5 rounded-full ${mounted ? "bg-success" : "bg-muted-foreground"}`} />
            {mounted ? "Mounted" : "Not mounted"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-destructive">{error}</span>
          {mounted ? (
            <Button disabled={busy} onClick={() => run(() => disconnectNfsShare(), false)}>
              <UnplugIcon />
              {busy ? "Unmounting…" : "Unmount"}
            </Button>
          ) : (
            <Button
              disabled={busy || !complete}
              onClick={() => run(() => connectNfsShare({ server, exportPath, mediaPath }), true)}
            >
              <PlugIcon />
              {busy ? "Mounting…" : "Mount"}
            </Button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
