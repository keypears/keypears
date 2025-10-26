use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct Blake3Request {
    pub data: String, // base64-encoded
}

#[derive(Debug, Deserialize)]
pub struct Blake3Response {
    pub hash: String, // hex-encoded 32 bytes
}
