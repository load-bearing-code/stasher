import type { FileLayoutConfig } from "@stasher/protocol";
import { invoke } from "@tauri-apps/api/core";

export function getFileLayout(): Promise<FileLayoutConfig | null> {
  return invoke<FileLayoutConfig | null>("get_file_layout");
}

export function setFileLayout(config: FileLayoutConfig): Promise<void> {
  return invoke("set_file_layout", { config });
}
