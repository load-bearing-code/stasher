import type { SourceStatus, SourcesConfig } from "@stasher/protocol";
import { invoke } from "@tauri-apps/api/core";

/**
 * What the desktop knows about the browser extension. The extension opens a
 * fresh connection per request rather than holding one open, so the backend
 * can only report when it last heard from it; the UI decides whether that's
 * recent enough to call "connected".
 */
export interface ExtensionStatus {
  lastSeenMs: number | null;
}

export function getExtensionStatus(): Promise<ExtensionStatus> {
  return invoke<ExtensionStatus>("get_extension_status");
}

export function getSourcesConfig(): Promise<SourcesConfig | null> {
  return invoke<SourcesConfig | null>("get_sources_config");
}

export function getSourceStatuses(): Promise<SourceStatus[]> {
  return invoke<SourceStatus[]>("get_source_statuses");
}

export function setSourcesConfig(config: SourcesConfig): Promise<void> {
  return invoke("set_sources_config", { config });
}
