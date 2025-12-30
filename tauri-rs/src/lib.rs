use std::collections::HashMap;
use std::sync::Mutex;

fn get_api_url() -> &'static str {
    match std::env::var("KEYPEARS_ENV").as_deref() {
        Ok("development") => "http://keypears.localhost:4273",
        _ => "https://keypears.com",
    }
}

// State to hold database file
struct DbFileState {
    path: String,
}

// Unlocked vault data (keys stored as hex strings)
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnlockedVault {
    vault_id: String,
    vault_name: String,
    vault_domain: String,
    password_key: String,
    encryption_key: String,
    login_key: String,
    vault_key: String,
    vault_public_key: String,
    encrypted_vault_key: String,
    vault_pub_key_hash: String,
    device_id: String,
    device_description: Option<String>,
}

// Session state for authenticated API calls
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionState {
    session_token: String,
    expires_at: i64,
}

// Application state that persists across webview reloads
struct AppState {
    unlocked_vaults: Mutex<HashMap<String, UnlockedVault>>,
    sessions: Mutex<HashMap<String, SessionState>>,
}

// Response for database file info
#[derive(serde::Serialize)]
struct DbFileInfo {
    path: String,
    size: Option<u64>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

#[tauri::command]
fn get_api_url_command() -> String {
    get_api_url().to_string()
}

#[tauri::command]
fn get_db_file(state: tauri::State<DbFileState>) -> String {
    state.path.clone()
}

#[tauri::command]
fn get_db_file_info(state: tauri::State<DbFileState>) -> DbFileInfo {
    let path = if state.path.is_empty() {
        "keypears.db".to_string()
    } else {
        state.path.clone()
    };

    let size = std::fs::metadata(&path).ok().map(|m| m.len());
    DbFileInfo { path, size }
}

// Vault state management commands

#[tauri::command]
fn store_unlocked_vault(state: tauri::State<AppState>, vault: UnlockedVault) -> Result<(), String> {
    let mut vaults = state.unlocked_vaults.lock().map_err(|e| e.to_string())?;
    vaults.insert(vault.vault_id.clone(), vault);
    Ok(())
}

#[tauri::command]
fn remove_unlocked_vault(state: tauri::State<AppState>, vault_id: String) -> Result<(), String> {
    let mut vaults = state.unlocked_vaults.lock().map_err(|e| e.to_string())?;
    vaults.remove(&vault_id);
    Ok(())
}

#[tauri::command]
fn get_all_unlocked_vaults(
    state: tauri::State<AppState>,
) -> Result<HashMap<String, UnlockedVault>, String> {
    let vaults = state.unlocked_vaults.lock().map_err(|e| e.to_string())?;
    Ok(vaults.clone())
}

#[tauri::command]
fn store_session(
    state: tauri::State<AppState>,
    vault_id: String,
    session: SessionState,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.insert(vault_id, session);
    Ok(())
}

#[tauri::command]
fn remove_session(state: tauri::State<AppState>, vault_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.remove(&vault_id);
    Ok(())
}

#[tauri::command]
fn get_all_sessions(
    state: tauri::State<AppState>,
) -> Result<HashMap<String, SessionState>, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    Ok(sessions.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(db_file: String) {
    tauri::Builder::default()
        .manage(DbFileState { path: db_file })
        .manage(AppState {
            unlocked_vaults: Mutex::new(HashMap::new()),
            sessions: Mutex::new(HashMap::new()),
        })
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_api_url_command,
            get_db_file,
            get_db_file_info,
            store_unlocked_vault,
            remove_unlocked_vault,
            get_all_unlocked_vaults,
            store_session,
            remove_session,
            get_all_sessions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
