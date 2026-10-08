import type { NfsExport, NfsShareConfig } from "@stasher/protocol";
import { invoke } from "@tauri-apps/api/core";

export function getNfsShare(): Promise<NfsShareConfig | null> {
  return invoke<NfsShareConfig | null>("get_nfs_share");
}

export function connectNfsShare(config: NfsShareConfig): Promise<void> {
  return invoke("connect_nfs_share", { config });
}

export function disconnectNfsShare(): Promise<void> {
  return invoke("disconnect_nfs_share");
}

export function listNfsExports(server: string): Promise<NfsExport[]> {
  return invoke<NfsExport[]>("list_nfs_exports", { server });
}

export function listNfsDirs(args: {
  server: string;
  exportPath: string;
  path: string;
}): Promise<string[]> {
  return invoke<string[]>("list_nfs_dirs", args);
}
