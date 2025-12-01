# Task: Third-Party API Hosting Support

## Overview

This task implements the foundation for third-party KeyPears API hosting.
Similar to how email works (you can run your website at `example.com` but have
Gmail host your email), KeyPears will support hosting your API at a different
domain than your website.

**Current behavior**: The API URL is constructed from the domain name using
`buildServerUrl(domain)`. For example, `keypears.com` →
`https://keypears.com/api`.

**New behavior**: The API URL is read from the `apiUrl` field in
`.well-known/keypears.json`. The client fetches this file and uses the URL
directly.

## Motivation

1. **Third-party hosting**: Users can run their own website at `example.com`
   while using a hosted KeyPears API provider (like `keypears.com/api`)
2. **Future-proofing**: Establishes the protocol for the decentralized,
   email-like architecture
3. **Flexibility**: API can be hosted on a different subdomain, path, or
   entirely different domain

## Protocol Change

### Before

```json
// .well-known/keypears.json
{
  "version": 1
}
```

Client constructs URL: `buildServerUrl("keypears.com")` →
`https://keypears.com/api`

### After

```json
// .well-known/keypears.json
{
  "version": 1,
  "apiUrl": "https://keypears.com/api"
}
```

Client reads `apiUrl` directly from the JSON file.

## Security Considerations

### Known Issue: Domain Ownership Verification (NOT addressed in this task)

Currently, there is no way to verify that the owner of `example.com` authorized
the API at `thirdparty.com/api` to host their vaults. This means anyone could
potentially create a vault claiming to be at `example.com` on any API server.

**Future solution**: Add a cryptographic proof (e.g., a signed challenge or DNS
TXT record) that proves domain ownership. This is out of scope for this task.

### What This Task Does Address

- Validates `keypears.json` structure with Zod schema
- Ensures `apiUrl` is a valid HTTPS URL (or HTTP for localhost in development)
- Maintains existing server validation flow

## Implementation Plan

### Phase 1: Library Changes (`@keypears/lib`)

- [ ] **1.1** Create `KeypearsJsonSchema` Zod schema in
      `lib/src/keypears-json.ts`
  - `version`: number (must be ≥ 1)
  - `apiUrl`: string (valid URL ending in `/api`)
- [ ] **1.2** Export schema from `lib/src/index.ts`
- [ ] **1.3** Run lib checks:
      `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`

### Phase 2: API Server Changes (`@keypears/api-server`)

- [ ] **2.1** Update `validateKeypearsServer()` in
      `api-server/src/validation.ts`
  - Parse response with `KeypearsJsonSchema` from lib
  - Return `apiUrl` in the validation result
  - Update `ServerValidationResult` interface to include `apiUrl?: string`
- [ ] **2.2** Run api-server checks:
      `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`

### Phase 3: Webapp Changes (`@keypears/webapp`)

- [ ] **3.1** Create React Router resource route at
      `webapp/app/routes/.well-known.keypears[.]json.ts`
  - Return JSON with `version: 1` and dynamic `apiUrl`
  - In production (`NODE_ENV=production`): `apiUrl: "https://keypears.com/api"`
  - In development: `apiUrl: "http://keypears.localhost:4273/api"`
- [ ] **3.2** Delete static file `webapp/public/.well-known/keypears.json`
- [ ] **3.3** Update `webapp/server.ts` to remove `.well-known` static serving
      (route handles it now)
- [ ] **3.4** Run webapp checks:
      `pnpm run lint && pnpm run typecheck && pnpm run build`

### Phase 4: Tauri App Changes (`@keypears/tauri-ts`)

- [ ] **4.1** Update `createApiClient()` in `tauri-ts/app/lib/api-client.ts`
  - Fetch `.well-known/keypears.json` from the domain
  - Parse with `KeypearsJsonSchema`
  - Use `apiUrl` from response instead of `buildServerUrl()`
  - Cache the result to avoid repeated fetches
- [ ] **4.2** Update `validateKeypearsServer` usage in new vault flow to use new
      validation
- [ ] **4.3** Run tauri-ts checks:
      `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`

### Phase 5: Cleanup

- [ ] **5.1** Consider deprecating `buildServerUrl()` in lib (or keep for
      fallback/testing)
- [ ] **5.2** Update any remaining usages of `buildServerUrl()` if necessary

### Phase 6: Integration Testing

- [ ] **6.1** Run full build from root: `pnpm run build:packages`
- [ ] **6.2** Start webapp in development mode
- [ ] **6.3** Verify `.well-known/keypears.json` returns correct JSON with
      `apiUrl`
- [ ] **6.4** Manual testing (user performs):
  - [ ] Create a new vault → verify it registers successfully
  - [ ] Import an existing vault → verify it authenticates successfully
  - [ ] Delete a vault → verify deletion works
  - [ ] Add a secret to a vault → verify it saves and syncs
  - [ ] Edit a secret in a vault → verify changes persist
  - [ ] Test cross-device sync: add secret on one instance, verify it appears on
        another instance that imported the same vault

### Phase 7: Blog Post (after implementation)

- [ ] **7.1** Convert this task document into a blog post describing the feature
- [ ] **7.2** Delete this task document

## Files to Modify

| File                                               | Change                                  |
| -------------------------------------------------- | --------------------------------------- |
| `lib/src/keypears-json.ts`                         | NEW: Zod schema for keypears.json       |
| `lib/src/index.ts`                                 | Export new schema                       |
| `api-server/src/validation.ts`                     | Use Zod schema, return apiUrl           |
| `webapp/app/routes/.well-known.keypears[.]json.ts` | NEW: Dynamic JSON endpoint              |
| `webapp/public/.well-known/keypears.json`          | DELETE                                  |
| `webapp/server.ts`                                 | Remove .well-known static serving       |
| `tauri-ts/app/lib/api-client.ts`                   | Fetch and use apiUrl from keypears.json |

## Testing Strategy

This feature primarily relies on:

1. **TypeScript type checking**: The Zod schema provides compile-time safety
2. **Existing tests**: All existing tests must pass
3. **Manual testing**: Full user flow testing as outlined in Phase 6.4

No new unit tests are required unless natural opportunities arise during
implementation.

## Definition of Done

- [ ] All lint checks pass for all projects
- [ ] All type checks pass for all projects
- [ ] All existing tests pass for all projects
- [ ] All builds succeed for all projects
- [ ] Manual testing confirms all vault operations work correctly
- [ ] `.well-known/keypears.json` returns dynamic `apiUrl` in both dev and prod
