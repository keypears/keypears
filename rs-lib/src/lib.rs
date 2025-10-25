// rs-lib: Rust library for KeyPears
// Provides cryptography, data models, and API client functionality

pub mod crypto;
pub mod models;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
