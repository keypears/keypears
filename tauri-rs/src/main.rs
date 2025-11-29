// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "KeyPears")]
#[command(version = "0.1.0")]
#[command(about = "KeyPears - Decentralized Password Manager", long_about = None)]
struct CliArgs {
    /// Custom database file path
    #[arg(long, value_name = "PATH")]
    db_path: Option<String>,
}

fn main() {
    let args = CliArgs::parse();

    // Resolve the full database path if provided
    let db_path = if let Some(custom) = args.db_path {
        // Expand ~ and resolve to absolute path
        let expanded = shellexpand::tilde(&custom);
        PathBuf::from(expanded.as_ref())
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(expanded.as_ref()))
            .to_string_lossy()
            .to_string()
    } else {
        // Empty string means use default (TypeScript will determine)
        String::new()
    };

    keypears_tauri_lib::run(db_path)
}
