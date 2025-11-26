# KeyPears Vision

## Overview

KeyPears is building the future of private, decentralized communication and
identity management. We start with password management and DH key exchange, but
our long-term vision extends far beyond.

## Current MVP

The KeyPears MVP provides:

- Secure password management
- Diffie-Hellman key exchange
- Email-based identity (alice@example.com)

This foundation is immediately useful and sets the stage for our broader vision.

## Long-Term Features

### 1. End-to-End Encrypted Messaging

A fully encrypted secret messaging system - essentially a decentralized Signal.

**Key characteristics:**

- True end-to-end encryption using DH key exchange infrastructure
- Decentralized architecture (no central server vulnerability)
- User experience as simple as existing messaging apps
- Built on the same email-based identity system established in MVP

**Dependencies**: Requires MVP Phase 2 (DH key exchange) as foundation.

Users communicate securely by default, with no intermediary able to read
messages.

### 2. Backwards-Compatible Email Support

Support for the legacy email protocol (SMTP/IMAP) with strong privacy nudges.

**Approach:**

- Full compatibility with existing email infrastructure
- Strong UI/UX nudges toward encrypted messaging
- Use encrypted messaging by default unless recipient only supports legacy email
- Clear indicators showing when you're using encrypted vs. legacy mode

We acknowledge email's ubiquity while steering users toward the more secure
option.

### 3. Cryptocurrency Wallet Integration

Native support for cryptocurrency keys and transactions using email-based
addresses.

**Capabilities:**

- Store cryptocurrency private keys securely (uses existing secret management)
- Send money using the same identity format: alice@example.com sends 1 ETH to
  bob@example2.com
- No more copying and pasting long addresses
- Multi-chain support (Bitcoin, Ethereum, etc.)

**Dependencies**: Requires MVP Phase 2 (DH key exchange) for secure key sharing
and address resolution.

Email-based addresses become universal identifiers for both communication and
payments.

### 4. Sustainable Open Source Business Model

KeyPears is an open source project built on sound business principles.

**Core principles:**

- **Not a non-profit**: We need revenue to be sustainable
- **Not a VC-backed growth startup**: We reject the "grow fast or die" mentality
- **Slow-growth small business**: Sustainable revenue is success, not unicorn
  exits
- **Never compromise principles for money**: Privacy, security, and open source
  are non-negotiable

**What this means in practice:**

- Open source codebase (transparency and auditability)
- No selling user data
- No backdoors or intentional security weaknesses
- No pivoting away from core mission to chase higher revenue
- Sustainable is enough - we don't need to be a billion-dollar company

**Funding approach:**

- Bootstrapped if possible
- Open to raising capital from mission-aligned investors
- We'll accept VC funding only from investors who:
  - Respect our commitment to privacy, security, and open source
  - Support sustainable growth over hypergrowth
  - Understand we're building for decades, not a quick exit
- Revenue from sustainable business model (premium features, enterprise hosting,
  support)

## Why This Matters

Current solutions fail in critical ways:

- Password managers don't integrate communication
- Messaging apps are centralized (Signal) or insecure (email)
- Cryptocurrency addresses are user-hostile
- Most privacy tools are non-profit (unsustainable) or venture-backed (eventual
  compromise)

KeyPears combines all these needs into one coherent system with a business model
that ensures long-term sustainability without compromising on values.

## Timeline

We're taking a deliberate, staged approach:

1. **Now**: MVP with 4 phases (sync, DH key exchange, multi-domain, payments -
   see [mvp.md](mvp.md))
2. **Post-MVP Phase 1**: End-to-end encrypted messaging
3. **Post-MVP Phase 2**: Legacy email support (SMTP/IMAP compatibility)
4. **Post-MVP Phase 3**: Cryptocurrency wallet integration

The MVP establishes the foundation (15-20 days), then each post-MVP phase builds
on it, creating a cohesive ecosystem where your email address is your universal
identity for private communication and digital value transfer.

## Success Criteria

KeyPears succeeds when:

- Users trust us with their most sensitive data
- The system is provably secure (open source + audits)
- We're financially sustainable
- We never compromise on privacy, security, or open source
- We remain independent and mission-driven

We're not building KeyPears to sell it or chase hypergrowth. We're building it
to exist for decades, serving users who value privacy and security above
convenience and network effects.
