// KeyPears API Server
// Rust backend for KeyPears decentralized key exchange system

use axum::{
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use utoipa::OpenApi;
use utoipa::ToSchema;
use utoipa_swagger_ui::SwaggerUi;

fn init_tracing() {
    let env = std::env::var("KEYPEARS_ENV").unwrap_or_else(|_| "production".to_string());

    let level = if env == "development" {
        tracing::Level::DEBUG
    } else {
        tracing::Level::WARN
    };

    tracing_subscriber::fmt()
        .with_max_level(level)
        .with_target(false)
        .init();

    tracing::info!("Logging initialized in {} mode (level: {:?})", env, level);
}

#[derive(Deserialize, ToSchema)]
struct Blake3Request {
    /// Base64-encoded data to hash (max 10KB)
    data: String,
}

#[derive(Serialize, ToSchema)]
struct Blake3Response {
    /// Hex-encoded Blake3 hash (64 characters)
    hash: String,
}

#[derive(OpenApi)]
#[openapi(
    paths(blake3_handler),
    components(schemas(Blake3Request, Blake3Response)),
    tags(
        (name = "crypto", description = "Cryptographic operations")
    )
)]
struct ApiDoc;

#[utoipa::path(
    post,
    path = "/api/blake3",
    request_body = Blake3Request,
    responses(
        (status = 200, description = "Hash computed successfully", body = Blake3Response),
        (status = 400, description = "Invalid request - bad base64 or data too large")
    ),
    tag = "crypto"
)]
async fn blake3_handler(
    Json(req): Json<Blake3Request>,
) -> Result<Json<Blake3Response>, StatusCode> {
    tracing::debug!("Received blake3 request");

    // 1. Decode base64
    let data = base64::prelude::BASE64_STANDARD
        .decode(&req.data)
        .map_err(|e| {
            tracing::warn!("Failed to decode base64: {}", e);
            StatusCode::BAD_REQUEST
        })?;

    tracing::debug!("Decoded {} bytes of data", data.len());

    // 2. Check size limit (10KB)
    if data.len() > 10 * 1024 {
        tracing::warn!("Data too large: {} bytes (max 10KB)", data.len());
        return Err(StatusCode::BAD_REQUEST);
    }

    // 3. Hash with rs-lib
    let hash = rs_lib::blake3::blake3_hash(&data);
    let hash_hex = hex::encode(hash);

    tracing::debug!("Computed blake3 hash: {}", hash_hex);

    // 4. Return hex-encoded result
    Ok(Json(Blake3Response { hash: hash_hex }))
}

async fn health_check() -> &'static str {
    "OK"
}

#[tokio::main]
async fn main() {
    // Initialize logging
    init_tracing();

    // Build our application with routes
    let app = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/blake3", post(blake3_handler))
        .merge(SwaggerUi::new("/api/docs").url("/api/openapi.json", ApiDoc::openapi()));

    // Run the server
    let addr = SocketAddr::from(([0, 0, 0, 0], 4274));
    tracing::info!("API server listening on http://{}", addr);
    tracing::info!("API docs available at http://{}/api/docs", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
