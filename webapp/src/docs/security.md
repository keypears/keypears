
KeyPears is designed to protect user data even if the server is fully
compromised. This page describes what the system protects against, and what it
does not.

## Server compromise

The server stores only ciphertext (messages, vault entries, encrypted private
keys) and hashed credentials (login key hashed with 100,000 additional BLAKE3
rounds). An attacker who captures the database cannot read any user content.

To impersonate a user, the attacker must reverse 200,000 rounds of BLAKE3 PBKDF
to recover the login key, or 300,000 rounds to recover the password.

## Password brute-force

An offline attack against the stored hash requires 300,000 BLAKE3 rounds per
guess. On a modern CPU core, BLAKE3-MAC processes approximately 4.3 million
rounds per second, so a single password guess takes approximately 70
milliseconds.

For an 8-character password drawn from lowercase letters and digits (36^8 ≈ 2.8
× 10^12 candidates), exhaustive search takes approximately 6,300 CPU-core-years.
An attacker with 100 cores would still require over 60 years.

Online attacks are further throttled by the login PoW requirement.

## Spam and Sybil attacks

Every account creation, login, and message requires proof of work, and the
difficulty is tunable. The cost of an attack scales linearly with the number of
targets and with the difficulty level.

Operators can raise difficulty in response to attacks. Recipients who set high
message difficulty impose additional per-message costs that make targeted spam
impractical.

## Social-graph probing

Proof-of-work challenge requests for messaging are authenticated: the sender
must sign the request with their secp256k1 private key, and the recipient's
server verifies the signature via federation.

An unauthenticated party cannot request a challenge, and therefore cannot probe
whether two users have a communication channel. Both addresses are signed into
the challenge payload, preventing cross-conversation reuse.

## Domain spoofing

The pull model prevents domain spoofing without any additional signing
infrastructure. When Bob's server receives a notification from Alice's domain, it
does not trust the notification's claimed origin. Instead, it independently
resolves Alice's domain via DNS and TLS, fetching `keypears.json` to discover
the API endpoint.

A malicious server cannot forge another domain's identity because TLS guarantees
the response came from the real domain.

## Client storage theft

An attacker who compromises a user's client storage obtains the encryption key,
which can decrypt the user's secp256k1 private keys. However, the login key is a
cryptographic sibling of the encryption key (derived from the same parent with a
different salt), not a child.

The attacker cannot derive the login key, cannot impersonate the user on the
server, and cannot access the server-side session. The attack surface is limited
to decrypting data already present on the compromised device.

## Limitations

KeyPears does not protect against:

- **Compromised endpoints** — an attacker with access to the running client can
  read decrypted content.
- **Weak passwords** — an entropy meter guides users but the protocol does not
  enforce a minimum.
- **DNS-level attacks** — BGP hijacking could redirect domain resolution.
  Mitigated by DNSSEC where deployed.
- **Forward secrecy** — the protocol does not provide forward secrecy in the
  Signal sense. All communication is transported over HTTPS/TLS, so passive
  recording of ciphertext in transit requires compromising TLS. Messages persist
  on the server for later retrieval, so the client must retain decryption keys.
