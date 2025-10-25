// Data models module
// Will contain Secret, Vault, User, and other shared types

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Secret {
    pub id: String,
    pub title: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_serialization() {
        let secret = Secret {
            id: "test123".to_string(),
            title: "Test Secret".to_string(),
        };
        let json = serde_json::to_string(&secret).unwrap();
        assert!(json.contains("test123"));
    }
}
