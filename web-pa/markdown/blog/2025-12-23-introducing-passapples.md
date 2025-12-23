+++
title = "Introducing PassApples: The First Alternate KeyPears Node"
date = "2025-12-23T12:00:00Z"
author = "PassApples Team"
+++

We're excited to announce the launch of PassApples, the first alternate node in the KeyPears network. Based in London, England, PassApples provides a fully KeyPears-compatible password management service for users who prefer a European data center.

## What is PassApples?

PassApples is a KeyPears-compatible node running on AWS infrastructure in London. This means:

- **Full interoperability**: Users on PassApples can securely exchange keys and messages with users on keypears.com or any other KeyPears-compatible node
- **Same security guarantees**: We use the same cryptographic protocols and key derivation functions as KeyPears
- **European data residency**: All vault data is stored in the EU-West-2 (London) AWS region

## Why Multiple Nodes?

The KeyPears protocol is designed for federation. Just like email, where users on gmail.com can communicate with users on outlook.com, KeyPears users can perform Diffie-Hellman key exchanges across different nodes.

This architecture provides:

1. **Geographic diversity**: Choose a node closer to you for better performance
2. **Data sovereignty**: Select where your encrypted data is stored
3. **Resilience**: The network doesn't depend on a single provider
4. **Choice**: Users can pick the provider that best fits their needs

## Getting Started

PassApples is fully compatible with the KeyPears Tauri app. Simply create an account at passapples.com and your vault will sync across all your devices.

If you already have a KeyPears account on keypears.com, you can exchange encrypted messages with PassApples users using the standard Diffie-Hellman key exchange - no extra setup required.

## Open Source

Like KeyPears, PassApples runs on the open-source KeyPears codebase licensed under Apache 2.0. You can review the code, run your own node, or contribute to the project at [github.com/keypears/keypears](https://github.com/keypears/keypears).

Welcome to the federated future of password management.
