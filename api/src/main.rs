// KeyPears API Server
// Rust backend for KeyPears decentralized key exchange system

use axum::{routing::get, Router};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    // Build our application with routes
    let app = Router::new()
        .route("/api/health", get(health_check));

    // Run the server
    let addr = SocketAddr::from(([0, 0, 0, 0], 4274));
    println!("API server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    "OK"
}
