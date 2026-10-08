import type { StashConfig } from "@stasher/protocol";
import { invoke } from "@tauri-apps/api/core";

export function getStashConfig(): Promise<StashConfig | null> {
  return invoke<StashConfig | null>("get_stash_config");
}

export function setStashConfig(config: StashConfig): Promise<void> {
  return invoke("set_stash_config", { config });
}

export function testStashConnection(config: StashConfig): Promise<void> {
  return invoke("test_stash_connection", { config });
}
