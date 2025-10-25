// Blake3 hashing functions

/// Computes the Blake3 hash of the input data
/// Returns a 32-byte hash
pub fn blake3_hash(data: &[u8]) -> [u8; 32] {
    *blake3::hash(data).as_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_hash() {
        let result = blake3_hash(&[]);
        let result_hex = hex::encode(result);
        // Known Blake3 hash of empty input
        let expected = "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262";
        assert_eq!(result_hex, expected);
    }

    #[test]
    fn test_known_input() {
        let input = b"hello world";
        let result = blake3_hash(input);
        let result_hex = hex::encode(result);
        // Known Blake3 hash of "hello world"
        let expected = "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24";
        assert_eq!(result_hex, expected);
    }
}
