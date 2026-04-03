pub mod blake3_reference;
use blake3_reference::blake3_reference_hash;
use wasm_bindgen::prelude::*;

// =============================================================================
// pow5-217a: 217-byte input (earthbucks header format)
// =============================================================================

const HEADER_SIZE_217A: usize = 1 + 32 + 32 + 8 + 8 + 4 + 32 + 32 + 2 + 32 + 2 + 32; // 217
const NONCE_START_217A: usize = 1 + 32 + 32 + 8 + 8 + 4 + 32; // 117
const NONCE_END_217A: usize = 1 + 32 + 32 + 8 + 8 + 4 + 32 + 4; // 121
const HASH_SIZE: usize = 32;
const WORK_PAR_START_217A: usize = 1 + 32 + 32 + 8 + 8 + 4 + 32 + 32 + 2 + 32 + 2;
const WORK_PAR_END_217A: usize = 1 + 32 + 32 + 8 + 8 + 4 + 32 + 32 + 2 + 32 + 2 + 32;

/// Compute work_par for 217-byte input (earthbucks format).
/// This is the ASIC-resistant matmul computation.
#[wasm_bindgen]
pub fn get_work_par_217a(header: Vec<u8>) -> Result<Vec<u8>, String> {
    if header.len() != HEADER_SIZE_217A {
        return Err(format!(
            "header is not the correct size: expected {}, got {}",
            HEADER_SIZE_217A,
            header.len()
        ));
    }
    // first, hash the header with blake3
    let matrix_a_row_1 = blake3_reference_hash(header.clone());

    // next, we will do the following. we will hash this hash over and over, 32
    // times. we will then multiply and add (similar to matmul) each value of
    // matrix_A_row_1 against each value of the new columns, of which there are
    // 32. these values will go into the final hash.
    let mut matrix_c_working_column = matrix_a_row_1.clone();
    let mut matrix_c_row_1 = [0u32; HASH_SIZE];
    #[allow(clippy::needless_range_loop)]
    for i in 0..32 {
        // now, hash the working column to get a new matrix_B_working_column
        matrix_c_working_column = blake3_reference_hash(matrix_c_working_column.to_vec());

        // the working column has been updated. now we "multiply and add" it
        // against the header hash.
        for j in 0..32 {
            matrix_c_row_1[i] += (matrix_a_row_1[j] as u32) * (matrix_c_working_column[j] as u32);
        }
    }

    // now we need to convert the matrix_c_row_1 to a u8 array - in *big-endian*
    // format
    let mut final_pre_hash: [u8; 32 * 4] = [0u8; 32 * 4];
    #[allow(clippy::needless_range_loop)]
    for i in 0..32 {
        let x = matrix_c_row_1[i];
        let j = i * 4;
        final_pre_hash[j] = (x >> 24) as u8;
        final_pre_hash[j + 1] = (x >> 16) as u8;
        final_pre_hash[j + 2] = (x >> 8) as u8;
        final_pre_hash[j + 3] = x as u8;
    }

    // we have now produced the first row of a matrix C via a matmul-esque operation. we will now
    // hash this row to get the "parallel work" or "work_par".
    let work_par = blake3_reference_hash(final_pre_hash.to_vec());

    Ok(work_par.to_vec())
}

/// Elementary iteration for 217-byte input (earthbucks format).
/// Computes work_par, inserts it into the header, then double-hashes.
#[wasm_bindgen]
pub fn elementary_iteration_217a(header: Vec<u8>) -> Result<Vec<u8>, String> {
    if header.len() != HEADER_SIZE_217A {
        return Err(format!(
            "header is not the correct size: expected {}, got {}",
            HEADER_SIZE_217A,
            header.len()
        ));
    }

    let work_par = get_work_par_217a(header.clone())?;

    // now we need to insert to the work_par into the header
    let mut working_header = header.clone();
    #[allow(clippy::manual_memcpy)]
    for i in WORK_PAR_START_217A..WORK_PAR_END_217A {
        working_header[i] = work_par[i - WORK_PAR_START_217A];
    }

    // now we need to hash the header
    let hash_1 = blake3_reference_hash(working_header);

    // now we need to hash it again because the "id" is actually the hash of the hash
    let hash_2 = blake3_reference_hash(hash_1);

    Ok(hash_2)
}

/// Insert 4-byte nonce into 217-byte header at bytes 117-121.
#[wasm_bindgen]
pub fn insert_nonce_217a(header: Vec<u8>, nonce: u32) -> Result<Vec<u8>, String> {
    if header.len() != HEADER_SIZE_217A {
        return Err(format!(
            "header is not the correct size: expected {}, got {}",
            HEADER_SIZE_217A,
            header.len()
        ));
    }
    let mut header = header.clone();
    header[NONCE_START_217A..NONCE_END_217A].copy_from_slice(&nonce.to_be_bytes());
    Ok(header)
}

// =============================================================================
// pow5-64b: 64-byte input (32-byte nonce + 32-byte challenge)
// =============================================================================

const HEADER_SIZE_64B: usize = 64;
const NONCE_START_64B: usize = 0;
const NONCE_END_64B: usize = 32;

/// Matmul work computation for 64-byte input.
/// Same ASIC-resistant algorithm as 217a, just with different input size.
#[wasm_bindgen]
pub fn matmul_work_64b(header: Vec<u8>) -> Result<Vec<u8>, String> {
    if header.len() != HEADER_SIZE_64B {
        return Err(format!(
            "header is not the correct size: expected {}, got {}",
            HEADER_SIZE_64B,
            header.len()
        ));
    }
    // first, hash the header with blake3
    let matrix_a_row_1 = blake3_reference_hash(header.clone());

    // next, we will do the following. we will hash this hash over and over, 32
    // times. we will then multiply and add (similar to matmul) each value of
    // matrix_A_row_1 against each value of the new columns, of which there are
    // 32. these values will go into the final hash.
    let mut matrix_c_working_column = matrix_a_row_1.clone();
    let mut matrix_c_row_1 = [0u32; HASH_SIZE];
    #[allow(clippy::needless_range_loop)]
    for i in 0..32 {
        // now, hash the working column to get a new matrix_B_working_column
        matrix_c_working_column = blake3_reference_hash(matrix_c_working_column.to_vec());

        // the working column has been updated. now we "multiply and add" it
        // against the header hash.
        for j in 0..32 {
            matrix_c_row_1[i] += (matrix_a_row_1[j] as u32) * (matrix_c_working_column[j] as u32);
        }
    }

    // now we need to convert the matrix_c_row_1 to a u8 array - in *big-endian*
    // format
    let mut final_pre_hash: [u8; 32 * 4] = [0u8; 32 * 4];
    #[allow(clippy::needless_range_loop)]
    for i in 0..32 {
        let x = matrix_c_row_1[i];
        let j = i * 4;
        final_pre_hash[j] = (x >> 24) as u8;
        final_pre_hash[j + 1] = (x >> 16) as u8;
        final_pre_hash[j + 2] = (x >> 8) as u8;
        final_pre_hash[j + 3] = x as u8;
    }

    // hash the 128-byte matmul result to get the final 32-byte output
    let result = blake3_reference_hash(final_pre_hash.to_vec());

    Ok(result.to_vec())
}

/// Elementary iteration for 64-byte input.
/// Unlike 217a, we don't insert work_par into the header.
/// We simply double-hash the matmul result to produce the final PoW hash.
#[wasm_bindgen]
pub fn elementary_iteration_64b(header: Vec<u8>) -> Result<Vec<u8>, String> {
    if header.len() != HEADER_SIZE_64B {
        return Err(format!(
            "header is not the correct size: expected {}, got {}",
            HEADER_SIZE_64B,
            header.len()
        ));
    }

    let work = matmul_work_64b(header)?;

    // double-hash the matmul result
    let hash_1 = blake3_reference_hash(work);
    let hash_2 = blake3_reference_hash(hash_1);

    Ok(hash_2)
}

/// Insert nonce into the last 4 bytes of the 32-byte nonce field (bytes 28-31).
/// This matches the WGSL implementation where the GPU iterates the last 4 bytes.
#[wasm_bindgen]
pub fn insert_nonce_64b(header: Vec<u8>, nonce: u32) -> Result<Vec<u8>, String> {
    if header.len() != HEADER_SIZE_64B {
        return Err(format!(
            "header is not the correct size: expected {}, got {}",
            HEADER_SIZE_64B,
            header.len()
        ));
    }
    let mut header = header.clone();
    // Insert nonce into bytes 28-31 (last 4 bytes of the 32-byte nonce)
    header[28..32].copy_from_slice(&nonce.to_be_bytes());
    Ok(header)
}

/// Set the full 32-byte nonce (bytes 0-31).
#[wasm_bindgen]
pub fn set_nonce_64b(header: Vec<u8>, nonce: Vec<u8>) -> Result<Vec<u8>, String> {
    if header.len() != HEADER_SIZE_64B {
        return Err(format!(
            "header is not the correct size: expected {}, got {}",
            HEADER_SIZE_64B,
            header.len()
        ));
    }
    if nonce.len() != 32 {
        return Err(format!(
            "nonce is not the correct size: expected 32, got {}",
            nonce.len()
        ));
    }
    let mut header = header.clone();
    header[NONCE_START_64B..NONCE_END_64B].copy_from_slice(&nonce);
    Ok(header)
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // pow5-217a tests
    // =========================================================================

    #[test]
    fn test_get_work_par_217a() {
        let expect_hex = "6fe9eddc39bb4183c44853c41876801be94a138ea9adea89f40a08442d2f79b8";
        let header_all_zeroes = vec![0; HEADER_SIZE_217A];
        let result = get_work_par_217a(header_all_zeroes).unwrap();
        assert_eq!(hex::encode(result), expect_hex);

        let expect_hex = "09d125453a1a5e9f75c770e3580e8b8035069b39816036b38207e8e152fa6871";
        let header_all_ones = vec![0x11; HEADER_SIZE_217A];
        let result = get_work_par_217a(header_all_ones).unwrap();
        assert_eq!(hex::encode(result), expect_hex);
    }

    #[test]
    fn test_elementary_iteration_217a() {
        let expect_hex = "c88f591bfa80126e9a14d76d473ca8ae7ac578ed1eac0150fcbc06742f4f7d6f";
        let header_all_zeroes = vec![0; HEADER_SIZE_217A];
        let result = elementary_iteration_217a(header_all_zeroes).unwrap();
        assert_eq!(hex::encode(result), expect_hex);

        let expect_hex = "a0c84664c6489150ffdd9755c5fad8fe08339d923ad2a3fda6369e1e74be9184";
        let header_all_ones = vec![0x11; HEADER_SIZE_217A];
        let result = elementary_iteration_217a(header_all_ones).unwrap();
        assert_eq!(hex::encode(result), expect_hex);
    }

    #[test]
    fn test_work_217a() {
        let expect_hex = "00000004f0ac89d75f135f184abbf0a82fad1e07fb4a29adb159648d70adf474";
        let header_all_zeroes = vec![0; HEADER_SIZE_217A];
        let header = insert_nonce_217a(header_all_zeroes.clone(), 376413).unwrap();
        let result = elementary_iteration_217a(header).unwrap();
        assert_eq!(hex::encode(result), expect_hex);

        let expect_hex = "0000004bd2d60b7b67702281a87b14e45c65d40465dc41fa2639ef84f050164a";
        let header_all_ones = vec![0x11; HEADER_SIZE_217A];
        let header = insert_nonce_217a(header_all_ones.clone(), 424378).unwrap();
        let result = elementary_iteration_217a(header).unwrap();
        assert_eq!(hex::encode(result), expect_hex);
    }

    // =========================================================================
    // pow5-64b tests
    // =========================================================================

    #[test]
    fn test_matmul_work_64b() {
        // Test with all zeroes
        let header_all_zeroes = vec![0; HEADER_SIZE_64B];
        let result = matmul_work_64b(header_all_zeroes).unwrap();
        assert_eq!(result.len(), 32);
        // Store the expected hex for comparison with WGSL
        println!("matmul_work_64b all zeroes: {}", hex::encode(&result));

        // Test with all ones (0x11)
        let header_all_ones = vec![0x11; HEADER_SIZE_64B];
        let result = matmul_work_64b(header_all_ones).unwrap();
        assert_eq!(result.len(), 32);
        println!("matmul_work_64b all ones: {}", hex::encode(&result));
    }

    #[test]
    fn test_elementary_iteration_64b() {
        // Test with all zeroes
        let header_all_zeroes = vec![0; HEADER_SIZE_64B];
        let result = elementary_iteration_64b(header_all_zeroes).unwrap();
        assert_eq!(result.len(), 32);
        println!(
            "elementary_iteration_64b all zeroes: {}",
            hex::encode(&result)
        );

        // Test with all ones (0x11)
        let header_all_ones = vec![0x11; HEADER_SIZE_64B];
        let result = elementary_iteration_64b(header_all_ones).unwrap();
        assert_eq!(result.len(), 32);
        println!(
            "elementary_iteration_64b all ones: {}",
            hex::encode(&result)
        );
    }

    #[test]
    fn test_insert_nonce_64b() {
        let header = vec![0; HEADER_SIZE_64B];
        let result = insert_nonce_64b(header, 0x12345678).unwrap();
        // Nonce should be in bytes 28-31 in big-endian
        assert_eq!(result[28], 0x12);
        assert_eq!(result[29], 0x34);
        assert_eq!(result[30], 0x56);
        assert_eq!(result[31], 0x78);
    }

    #[test]
    fn test_set_nonce_64b() {
        let header = vec![0; HEADER_SIZE_64B];
        let nonce = vec![0x11; 32];
        let result = set_nonce_64b(header, nonce).unwrap();
        // First 32 bytes should be 0x11
        for i in 0..32 {
            assert_eq!(result[i], 0x11);
        }
        // Last 32 bytes should still be 0
        for i in 32..64 {
            assert_eq!(result[i], 0);
        }
    }
}
