+++
title = "Privacy Policy"
date = "2026-04-10"
+++

# Privacy Policy

**Effective date: April 10, 2026**

KeyPears is designed to protect your privacy. This policy explains what
data we collect, how we use it, and your rights.

## 1. End-to-End Encryption

All messages are encrypted on your device using hybrid post-quantum
cryptography (X25519 + ML-KEM-768) before being sent. The server stores
only ciphertext. Neither the server operator nor any third party can read
your messages.

## 2. What We Collect

- **Account data**: Your username, domain, and public keys. Your password
  is never stored — only a cryptographic hash derived from it.
- **Encrypted messages**: Stored as ciphertext. We cannot decrypt them.
- **Proof-of-work history**: Computational work performed by your device,
  logged as difficulty values and timestamps.
- **Session data**: Hashed session tokens with expiration dates. Raw
  tokens are never stored on the server.

## 3. What We Do Not Collect

- Your password (only a hash of a hash is stored)
- Your encryption key (it never leaves your device)
- Your private key in plaintext (only encrypted versions are stored)
- Message content in plaintext (only ciphertext is stored)

## 4. How We Use Your Data

- To deliver encrypted messages between users
- To verify your identity during login
- To prevent spam via proof-of-work
- To display your public profile (username, public keys, PoW history)

## 5. Data Sharing

We do not sell, trade, or share your data with third parties. In a
federated deployment, your data is stored on the server you connect to.
Each server operator controls their own data.

## 6. Data Retention

- Account data is retained as long as your account exists.
- Encrypted messages are retained until deleted.
- Session tokens expire and are cleaned up automatically.
- Unsaved accounts expire after 24 hours.

## 7. Your Rights

- You can change your password at any time.
- You can rotate your cryptographic keys at any time.
- You can delete your unsaved account.
- You can request deletion of your account by contacting the server
  operator.

## 8. Federation

KeyPears is federated. If your address is on a third-party domain, that
domain's server operator controls your data. This privacy policy applies
to the keypears.com server. Other operators may have their own policies.

## 9. Changes to This Policy

We may update this policy at any time. Continued use of KeyPears after
changes constitutes acceptance.

## 10. Contact

For questions about this policy, visit
[keypears.com](https://keypears.com).
