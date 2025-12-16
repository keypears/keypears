// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "KeyPears")]
#[command(version = "0.1.0")]
#[command(about = "KeyPears - Federated Diffie-Hellman Key Exchange System", long_about = None)]
struct CliArgs {
    /// Custom database file path
    #[arg(long, value_name = "PATH")]
    db_path: Option<String>,
}

fn main() {
    let args = CliArgs::parse();

    // Capture current working directory BEFORE Tauri changes it
    let cwd = std::env::current_dir().ok();

    // Resolve the full database path if provided
    let db_path = if let Some(custom) = args.db_path {
        // Expand ~ to home directory
        let expanded = shellexpand::tilde(&custom);
        let path = PathBuf::from(expanded.as_ref());

        // Try to canonicalize (works if file exists)
        // Otherwise, resolve relative paths manually using the original cwd
        path.canonicalize()
            .unwrap_or_else(|_| {
                if path.is_absolute() {
                    path
                } else if let Some(ref cwd) = cwd {
                    cwd.join(&path)
                } else {
                    path
                }
            })
            .to_string_lossy()
            .to_string()
    } else {
        // Empty string means use default (TypeScript will determine)
        String::new()
    };

    keypears_tauri_lib::run(db_path)
}
