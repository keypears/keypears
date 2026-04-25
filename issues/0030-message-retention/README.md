+++
status = "open"
opened = "2026-04-25"
+++

# Message retention and old-message cleanup

## Goal

Add configurable per-channel message retention so users can delete old stored
messages without complicating the cryptographic protocol.

This is a retention-based compromise mitigation, not cryptographic forward
secrecy. KeyPears messages are currently encrypted to long-term ML-KEM keys. If
an encrypted message remains stored and the recipient's decapsulation key is
later compromised, that ciphertext may be decryptable. Deleting old ciphertext
reduces the amount of stored data available after a later key compromise while
preserving the current simple protocol.

## Product behavior

Each channel should have a retention setting:

- Keep forever
- Delete after 1 day
- Delete after 7 days
- Delete after 30 days
- Delete after 90 days
- Delete after 1 year

Default new channels to 7 days unless a global user setting overrides it.

The channel screen should expose an action such as:

> Delete messages older than 7 days

The action deletes this user's local/server-side copies for that channel only.
It does not delete the counterparty's copies, remote server backups, screenshots,
exports, or any message data already stored elsewhere.

## Implementation plan

1. Add a global user message retention preference.
2. Add a per-channel retention override.
3. Add a server function that deletes messages in a channel older than the
   effective retention cutoff.
4. Add a channel-screen cleanup button that shows the effective retention window
   and deletes matching messages after confirmation.
5. Apply retention automatically when opening a channel or loading messages.
6. Consider a later background cleanup job, but do not require one for the first
   implementation.

## Data model

Likely schema additions:

- `users.defaultMessageRetentionDays` nullable integer
- `channels.messageRetentionDays` nullable integer

`null` means keep forever. A channel-level value overrides the user default.

For privacy, delete whole message rows rather than blanking only
`encryptedContent`. Keeping stubs preserves metadata and can confuse users.

## Security wording

The whitepaper and docs should describe this precisely:

> KeyPears supports configurable message retention. Users may delete encrypted
> message bodies after a chosen interval, reducing the amount of ciphertext
> available to an attacker after later key compromise. This is a
> retention-based mitigation rather than cryptographic forward secrecy.

## Non-goals

- Do not add signed prekeys, one-time prekeys, or a double ratchet.
- Do not attempt remote deletion from the counterparty's account.
- Do not call this cryptographic forward secrecy.
- Do not change the message encryption format.

## Open questions

- Should the default be 7 days globally, or should existing users/channels keep
  forever until they opt in?
- Should cleanup run automatically on channel open, message send, message
  receive, or only via the manual button in the first version?
- Should the UI offer channel-specific retention in the channel settings only,
  or also in a global settings page?
