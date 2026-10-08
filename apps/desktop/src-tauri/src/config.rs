//! Persists `StashConfig` as JSON in the app's config directory. Loaded once
//! at startup into shared state (see `lib.rs`); saved back out whenever the
//! settings UI submits a new config.

use std::fs;
use std::path::PathBuf;

use stasher_protocol::StashConfig;
use tauri::{AppHandle, Manager};

const CONFIG_FILE_NAME: &str = "stash-config.json";

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    Ok(dir.join(CONFIG_FILE_NAME))
}

pub fn load(app: &AppHandle) -> Option<StashConfig> {
    let path = config_path(app).ok()?;
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn save(app: &AppHandle, config: &StashConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(config).map_err(|err| err.to_string())?;
    fs::write(path, bytes).map_err(|err| err.to_string())
}
