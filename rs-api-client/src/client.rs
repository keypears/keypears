use crate::error::ClientError;
use crate::models::{Blake3Request, Blake3Response, RpcRequest, RpcResponse};
use base64::Engine;

pub struct KeyPearsClient {
    url: String,
    #[allow(dead_code)]
    api_key: Option<String>,
    client: reqwest::Client,
}

pub struct KeyPearsClientConfig {
    pub url: Option<String>,
    pub api_key: Option<String>,
}

impl KeyPearsClient {
    pub fn new(config: KeyPearsClientConfig) -> Self {
        Self {
            url: config.url.unwrap_or_default(),
            api_key: config.api_key,
            client: reqwest::Client::new(),
        }
    }

    pub async fn blake3(&self, data: Vec<u8>) -> Result<[u8; 32], ClientError> {
        let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);

        let request = Blake3Request { data: base64_data };
        let wrapped_request = RpcRequest { json: request };

        let response = self
            .client
            .post(format!("{}/api/blake3", self.url))
            .json(&wrapped_request)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(ClientError::HttpError(format!(
                "HTTP error: {}",
                response.status()
            )));
        }

        let wrapped_response: RpcResponse<Blake3Response> = response.json().await?;
        let response_data = wrapped_response.json;

        let hash_bytes = hex::decode(&response_data.hash)
            .map_err(|e| ClientError::InvalidResponse(format!("Invalid hex: {e}")))?;

        let hash: [u8; 32] = hash_bytes.try_into().map_err(|_| {
            ClientError::InvalidResponse("Hash must be exactly 32 bytes".to_string())
        })?;

        Ok(hash)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_blake3_success() {
        let mut server = mockito::Server::new_async().await;

        let mock = server
            .mock("POST", "/api/blake3")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{"json":{"hash":"d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24"}}"#,
            )
            .create_async()
            .await;

        let client = KeyPearsClient::new(KeyPearsClientConfig {
            url: Some(server.url()),
            api_key: None,
        });

        let input = Vec::from("hello world");
        let result: [u8; 32] = client.blake3(input).await.unwrap();

        assert_eq!(result.len(), 32);
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_blake3_http_error() {
        let mut server = mockito::Server::new_async().await;

        let mock = server
            .mock("POST", "/api/blake3")
            .with_status(400)
            .create_async()
            .await;

        let client = KeyPearsClient::new(KeyPearsClientConfig {
            url: Some(server.url()),
            api_key: None,
        });

        let input = Vec::from("test");
        let result = client.blake3(input).await;

        assert!(result.is_err());
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_blake3_invalid_json() {
        let mut server = mockito::Server::new_async().await;

        let mock = server
            .mock("POST", "/api/blake3")
            .with_status(200)
            .with_body(r#"{"json":{"invalid":"response"}}"#)
            .create_async()
            .await;

        let client = KeyPearsClient::new(KeyPearsClientConfig {
            url: Some(server.url()),
            api_key: None,
        });

        let input = Vec::from("test");
        let result = client.blake3(input).await;

        assert!(result.is_err());
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_blake3_invalid_hex() {
        let mut server = mockito::Server::new_async().await;

        let mock = server
            .mock("POST", "/api/blake3")
            .with_status(200)
            .with_body(r#"{"json":{"hash":"not-valid-hex"}}"#)
            .create_async()
            .await;

        let client = KeyPearsClient::new(KeyPearsClientConfig {
            url: Some(server.url()),
            api_key: None,
        });

        let input = Vec::from("test");
        let result = client.blake3(input).await;

        assert!(result.is_err());
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_blake3_wrong_hash_length() {
        let mut server = mockito::Server::new_async().await;

        let mock = server
            .mock("POST", "/api/blake3")
            .with_status(200)
            .with_body(r#"{"json":{"hash":"abcd"}}"#) // Too short
            .create_async()
            .await;

        let client = KeyPearsClient::new(KeyPearsClientConfig {
            url: Some(server.url()),
            api_key: None,
        });

        let input = Vec::from("test");
        let result = client.blake3(input).await;

        assert!(result.is_err());
        mock.assert_async().await;
    }
}
