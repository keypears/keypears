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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(db_path: String) {
    tauri::Builder::default()
        .manage(DbPathState { path: db_path })
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_api_url_command,
            get_db_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
