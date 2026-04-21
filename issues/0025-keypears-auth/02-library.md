# Build `@keypears/auth` library and integrate into RSS Anyway

## Goal

Build the `@keypears/auth` client library and integrate it into RSS Anyway
(`~/dev/rssanyway`) as the first real consumer. By the end, a user can sign into
RSS Anyway using their KeyPears address — the full redirect flow working across
two separate servers.

## Context

The KeyPears `/sign` page is implemented (see [01-init.md](01-init.md),
Experiment 4). What's missing:

1. A library that third-party apps import to handle discovery, redirect URL
   construction, and callback verification.
2. RSS Anyway has no user system — no users table, no sessions, no auth. We need
   to add the minimum to support "signed in as `alice@example.com`."
