fn get_api_url() -> &'static str {
    match std::env::var("KEYPEARS_ENV").as_deref() {
        Ok("development") => "http://keypears.localhost:4274",
        _ => "https://keypears.com",
    }
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
async fn blake3_hash(data: Vec<u8>) -> Result<String, String> {
    let client = rs_api_client::KeyPearsClient::new(rs_api_client::KeyPearsClientConfig {
        url: Some(get_api_url().to_string()),
        api_key: None,
    });

    let hash: [u8; 32] = client.blake3(data).await.map_err(|e| e.to_string())?;

    // Convert to hex string before returning to TypeScript
    Ok(hex::encode(hash))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_api_url_command,
            blake3_hash
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
