//! Persists app settings as JSON files in the app's config directory. Loaded
//! once at startup into shared state (see `lib.rs`); saved back out whenever
//! the settings UI submits a new value.

use std::fs;
use std::path::PathBuf;

use serde::{de::DeserializeOwned, Serialize};
use stasher_protocol::{FileLayoutConfig, NfsShareConfig, SourcesConfig, StashConfig};
use tauri::{AppHandle, Manager};

const STASH_CONFIG_FILE: &str = "stash-config.json";
const NFS_CONFIG_FILE: &str = "nfs-share.json";
const FILE_LAYOUT_FILE: &str = "file-layout.json";
const SOURCES_CONFIG_FILE: &str = "sources.json";

fn config_path(app: &AppHandle, file: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    Ok(dir.join(file))
}

fn load_json<T: DeserializeOwned>(app: &AppHandle, file: &str) -> Option<T> {
    let path = config_path(app, file).ok()?;
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn save_json<T: Serialize>(app: &AppHandle, file: &str, value: &T) -> Result<(), String> {
    let path = config_path(app, file)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(value).map_err(|err| err.to_string())?;
    fs::write(path, bytes).map_err(|err| err.to_string())
}

pub fn load(app: &AppHandle) -> Option<StashConfig> {
    load_json(app, STASH_CONFIG_FILE)
}

pub fn save(app: &AppHandle, config: &StashConfig) -> Result<(), String> {
    save_json(app, STASH_CONFIG_FILE, config)
}

pub fn load_nfs(app: &AppHandle) -> Option<NfsShareConfig> {
    load_json(app, NFS_CONFIG_FILE)
}

pub fn clear_nfs(app: &AppHandle) -> Result<(), String> {
    match fs::remove_file(config_path(app, NFS_CONFIG_FILE)?) {
        Err(err) if err.kind() != std::io::ErrorKind::NotFound => Err(err.to_string()),
        _ => Ok(()),
    }
}

pub fn save_nfs(app: &AppHandle, config: &NfsShareConfig) -> Result<(), String> {
    save_json(app, NFS_CONFIG_FILE, config)
}

pub fn load_file_layout(app: &AppHandle) -> Option<FileLayoutConfig> {
    load_json(app, FILE_LAYOUT_FILE)
}

pub fn save_file_layout(app: &AppHandle, config: &FileLayoutConfig) -> Result<(), String> {
    save_json(app, FILE_LAYOUT_FILE, config)
}

pub fn load_sources(app: &AppHandle) -> Option<SourcesConfig> {
    load_json(app, SOURCES_CONFIG_FILE)
}

pub fn save_sources(app: &AppHandle, config: &SourcesConfig) -> Result<(), String> {
    save_json(app, SOURCES_CONFIG_FILE, config)
}
