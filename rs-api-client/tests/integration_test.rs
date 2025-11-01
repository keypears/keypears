use rs_api_client::{KeyPearsClient, KeyPearsClientConfig};

#[tokio::test]
#[ignore] // Requires server running on localhost:4274
async fn test_blake3_integration() {
    let client = KeyPearsClient::new(KeyPearsClientConfig {
        url: Some("http://localhost:4274".to_string()),
        api_key: None,
    });

    let input = Vec::from("hello world");
    let result: [u8; 32] = client.blake3(input).await.expect("blake3 should succeed");

    // Verify against known Blake3 hash of "hello world"
    let expected = hex::decode("d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24")
        .expect("valid hex");
    let expected_array: [u8; 32] = expected.try_into().expect("32 bytes");

    assert_eq!(result, expected_array);
}

#[tokio::test]
#[ignore] // Requires server running on localhost:4274
async fn test_blake3_empty_data() {
    let client = KeyPearsClient::new(KeyPearsClientConfig {
        url: Some("http://localhost:4274".to_string()),
        api_key: None,
    });

    let input = Vec::new(); // Empty data
    let result: [u8; 32] = client.blake3(input).await.expect("blake3 should succeed");

    // Verify it returns 32 bytes
    assert_eq!(result.len(), 32);
}
