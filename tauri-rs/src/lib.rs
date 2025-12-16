fn get_api_url() -> &'static str {
    match std::env::var("KEYPEARS_ENV").as_deref() {
        Ok("development") => "http://keypears.localhost:4273",
        _ => "https://keypears.com",
    }
}

// State to hold database path
struct DbPathState {
    path: String,
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
fn get_db_path(state: tauri::State<DbPathState>) -> String {
    state.path.clone()
}

#[tauri::command]
fn get_db_file_info(state: tauri::State<DbPathState>) -> DbFileInfo {
    let path = &state.path;
    if path.is_empty() {
        return DbFileInfo {
            path: "keypears.db".to_string(),
            size: None,
        };
    }

    let size = std::fs::metadata(path).ok().map(|m| m.len());
    DbFileInfo {
        path: path.clone(),
        size,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(db_path: String) {
    tauri::Builder::default()
        .manage(DbPathState { path: db_path })
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_api_url_command,
            get_db_path,
            get_db_file_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
