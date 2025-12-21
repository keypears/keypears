# KeyPears Codebase Audit Guide

This document defines what to look for when auditing the KeyPears codebase. Use
this checklist when performing periodic audits (recommended before each major
phase milestone).

## When to Perform an Audit

- **Before major releases**: Before Phase 3, Phase 4, etc.
- **After significant changes**: New authentication flows, crypto changes, major
  refactors
- **Periodically**: Every 1-2 months during active development
- **After security incidents**: If vulnerabilities are discovered elsewhere

## Audit Process Overview

1. **Run automated checks first**: lint, typecheck, tests for all packages
2. **Check dependencies**: `pnpm outdated` for each package
3. **Review each package** using the checklist below
4. **Document findings** in TODO.md or a dedicated issue
5. **Fix critical/high issues immediately**, schedule others for later

---

## 1. General Software Best Practices

### 1.1 Tooling & Configuration

- [ ] **TypeScript strict mode**: Is `strict: true` enabled in tsconfig.json?
- [ ] **No `any` types**: Are there any `any` types that should be explicit?
- [ ] **ESLint passing**: Does `pnpm run lint` pass with no warnings?
- [ ] **Prettier formatting**: Is code consistently formatted?
- [ ] **Test coverage**: Are critical paths covered by tests?
- [ ] **Build succeeds**: Does `pnpm run build` complete without errors?

### 1.2 Code Quality

- [ ] **Naming conventions**: Are variables, functions, and files named clearly
      and consistently?
  - Variables: camelCase
  - Functions: camelCase, verb-first (e.g., `getUser`, `validateInput`)
  - Types/Interfaces: PascalCase
  - Files: kebab-case for utilities, PascalCase for components
- [ ] **Function length**: Are functions under ~50 lines? Should any be split?
- [ ] **Single responsibility**: Does each function/module do one thing well?
- [ ] **Magic values**: Are constants extracted and named? No unexplained
      numbers/strings?
- [ ] **Comments**: Are complex algorithms explained? No obvious/redundant
      comments?
- [ ] **Dead code**: Are there unused imports, variables, or functions?
- [ ] **Console.log**: Are there debug logs that should be removed?

### 1.3 TypeScript Usage

- [ ] **Explicit return types**: Do exported functions have explicit return
      types?
- [ ] **Interface vs Type**: Are interfaces used for object shapes, types for
      unions/intersections?
- [ ] **Readonly**: Are immutable data structures marked as `readonly`?
- [ ] **Discriminated unions**: Are union types properly discriminated?
- [ ] **Null handling**: Is null/undefined handled explicitly (no `!` assertions
      without good reason)?
- [ ] **Generic constraints**: Are generics constrained where appropriate?

### 1.4 Error Handling

- [ ] **Try/catch**: Are async operations wrapped in try/catch?
- [ ] **Error types**: Are errors typed (not just `catch (e: any)`)?
- [ ] **User-facing errors**: Are error messages user-friendly (not technical
      jargon)?
- [ ] **Error propagation**: Are errors propagated correctly up the call stack?
- [ ] **Fail-fast**: Do functions validate inputs early?

### 1.5 API Design

- [ ] **Consistent patterns**: Do similar operations use similar patterns?
- [ ] **Minimal surface area**: Are only necessary functions exported?
- [ ] **Documentation**: Are public APIs documented with JSDoc?
- [ ] **Backward compatibility**: Do changes break existing callers?

---

## 2. Third-Party Tools & Dependencies

### 2.1 React Router v7

- [ ] **File-based routing**: Are routes using the correct file naming
      conventions?
- [ ] **Type generation**: Is `react-router typegen` being run?
- [ ] **Loader patterns**: Are `clientLoader` functions used correctly?
- [ ] **Navigation**: Is `href()` used for all internal links (type-safe
      routes)?
- [ ] **Redirects**: Are `redirect()` and `throw redirect()` used correctly?
- [ ] **Route params**: Are params properly typed via `Route.ComponentProps`?
- [ ] **Revalidation**: Is `useRevalidator` used appropriately?
- [ ] **Pending states**: Are `useNavigation` pending states shown?

### 2.2 Tauri v2

- [ ] **Version**: Are we on Tauri v2 (not v1)?
- [ ] **Capabilities**: Are Tauri capabilities properly configured in
      `tauri.conf.json`?
- [ ] **IPC commands**: Are Tauri commands defined in Rust and invoked
      correctly?
- [ ] **File system**: Is SQLite database stored in the correct app data
      directory?
- [ ] **Platform differences**: Are platform-specific behaviors handled?
- [ ] **Security**: Is the CSP (Content Security Policy) properly configured?
- [ ] **Updates**: Is auto-update configured (if applicable)?

### 2.3 Drizzle ORM

- [ ] **Schema definition**: Are schemas properly defined with correct types?
- [ ] **Migrations**: Are schema changes managed correctly? (Note: using push,
      not migrations)
- [ ] **Query patterns**: Are queries efficient (no N+1, proper indexes)?
- [ ] **Transactions**: Are related operations wrapped in transactions?
- [ ] **Type safety**: Are Drizzle types used (not raw SQL strings)?

### 2.4 orpc

- [ ] **Procedure definitions**: Are procedures properly typed with input/output
      schemas?
- [ ] **Error handling**: Are orpc errors handled correctly on client and
      server?
- [ ] **Authentication**: Is session auth implemented via middleware?
- [ ] **Client usage**: Is `createClient` / `createClientFromDomain` used
      correctly?

### 2.5 Zod

- [ ] **Schema definitions**: Are all external inputs validated with Zod?
- [ ] **Error messages**: Are custom error messages provided where helpful?
- [ ] **Parsing vs validation**: Is `.parse()` vs `.safeParse()` used
      appropriately?
- [ ] **Type inference**: Is `z.infer<typeof schema>` used for type derivation?

### 2.6 Other Dependencies

- [ ] **Outdated packages**: Run `pnpm outdated` - are there critical updates?
- [ ] **Security vulnerabilities**: Run `pnpm audit` - are there known
      vulnerabilities?
- [ ] **Unused dependencies**: Are all dependencies in package.json actually
      used?
- [ ] **Bundle size**: Are there heavy dependencies that could be replaced?

---

## 3. Security Assessment

### 3.1 Cryptography

- [ ] **Algorithm choices**: Are industry-standard algorithms used?
  - SHA-256 for KDF (PBKDF with 100k rounds)
  - BLAKE3 for PoW (in pow5 algorithm only)
  - AES-256-CBC + SHA-256-HMAC for symmetric encryption (ACS2)
  - secp256k1 for DH key exchange (implemented)
- [ ] **Key derivation**: Is the three-tier key derivation correct?
  - Password + vaultId → passwordKey (100k SHA-256 PBKDF rounds)
  - passwordKey → encryptionKey (100k SHA-256 PBKDF rounds)
  - passwordKey → loginKey (100k SHA-256 PBKDF rounds)
  - encryptionKey and loginKey are cryptographically separate?
- [ ] **Random number generation**: Is `crypto.getRandomValues()` used for all
      randomness?
- [ ] **Key storage**: Are keys stored only in memory (never persisted to disk
      unencrypted)?
- [ ] **Key zeroing**: Are sensitive keys zeroed from memory when no longer
      needed?
- [ ] **IV/Nonce uniqueness**: Are IVs/nonces unique for each encryption
      operation?

### 3.2 Authentication

- [ ] **Session tokens**: Are tokens cryptographically random (sufficient
      entropy)?
- [ ] **Token storage**: Are session tokens stored securely (hashed on server)?
- [ ] **Token expiration**: Do sessions expire appropriately?
- [ ] **Login key handling**: Is the login key properly KDF'd server-side (100k
      rounds)?
- [ ] **Rate limiting**: Are login attempts rate-limited to prevent brute force?
- [ ] **Logout**: Does logout properly invalidate sessions?

### 3.3 Zero-Knowledge Architecture

- [ ] **Server never sees**: Verify the server NEVER receives:
  - Plaintext passwords (user's master password)
  - Plaintext secrets (passwords stored in vault)
  - Unencrypted vault keys
  - Password keys
  - Encryption keys
- [ ] **Server only sees**: Verify the server ONLY receives:
  - Login key (which cannot derive encryption key)
  - Encrypted blobs (cannot be decrypted without vault key)
  - Vault public key hash (identity, not secrets)
- [ ] **Encryption happens client-side**: All encryption/decryption in
      browser/app?

### 3.4 Input Validation

- [ ] **API inputs**: Are all API inputs validated with Zod schemas?
- [ ] **SQL injection**: Are queries parameterized (Drizzle handles this)?
- [ ] **XSS prevention**: Is user content properly escaped in React?
- [ ] **Path traversal**: Are file paths validated?
- [ ] **Size limits**: Are input sizes limited to prevent DoS?

### 3.5 Transport Security

- [ ] **HTTPS only**: Is HTTP redirected to HTTPS?
- [ ] **HSTS**: Is Strict-Transport-Security header set?
- [ ] **Certificate validation**: Does the client validate server certificates?

### 3.6 UI Security

- [ ] **Password masking**: Are passwords hidden by default (type="password")?
- [ ] **Clipboard clearing**: Is clipboard cleared after copy timeout?
- [ ] **Screen lock**: Does the app lock after inactivity? (future feature)
- [ ] **No sensitive data in URLs**: Are secrets never in query params or URL
      paths?
- [ ] **No sensitive data in logs**: Are passwords/keys not logged?

### 3.7 Error Handling Security

- [ ] **No stack traces exposed**: Are internal errors hidden from users?
- [ ] **No information leakage**: Do error messages reveal system internals?
- [ ] **Generic auth errors**: Is "invalid credentials" used (not "user not
      found" vs "wrong password")?

---

## 4. Scalability

### 4.1 Server-Side

- [ ] **Database queries**: Are queries indexed properly?
- [ ] **N+1 queries**: Are there any N+1 query patterns?
- [ ] **Connection pooling**: Is database connection pooling configured?
- [ ] **Pagination**: Are list endpoints paginated?
- [ ] **Caching**: Are expensive operations cached where appropriate?
- [ ] **Stateless**: Is the server stateless (no in-memory sessions)?

### 4.2 Client-Side

- [ ] **Bundle size**: Is the JS bundle reasonably sized?
- [ ] **Lazy loading**: Are routes lazily loaded?
- [ ] **Memory leaks**: Are event listeners and timers cleaned up?
- [ ] **Re-render optimization**: Are components memoized where beneficial?
- [ ] **Virtual scrolling**: Are long lists virtualized?
- [ ] **Local database**: Can SQLite handle thousands of secrets efficiently?

### 4.3 Sync Performance

- [ ] **Incremental sync**: Does sync only fetch new updates (not full resync)?
- [ ] **Batch operations**: Are bulk operations batched?
- [ ] **Polling frequency**: Is 5-second polling appropriate?
- [ ] **Exponential backoff**: Do errors trigger backoff to prevent thundering
      herd?

---

## 5. UI/UX Consistency

### 5.1 Visual Design

- [ ] **Catppuccin theme**: Are colors from Catppuccin palette?
- [ ] **Theme variables**: Use `text-destructive` not `text-red-500` for errors
- [ ] **Primary color**: Is green used as the primary accent?
- [ ] **Consistent spacing**: Are margins/padding consistent (Tailwind scale)?
- [ ] **Typography**: Is font sizing consistent?
- [ ] **Dark/light mode**: Does theming work correctly in both modes?

### 5.2 Components

- [ ] **shadcn components**: Are all UI components from shadcn (not custom)?
- [ ] **Lucide icons**: Are all icons from lucide-react (no inline SVG)?
- [ ] **Button variants**: Are button variants used consistently?
- [ ] **Form patterns**: Are forms structured consistently?

### 5.3 States & Feedback

- [ ] **Loading states**: Are loading indicators shown during async operations?
- [ ] **Error states**: Are errors displayed clearly to users?
- [ ] **Empty states**: Are empty lists handled with helpful messages?
- [ ] **Success feedback**: Are successful actions acknowledged?
- [ ] **Disabled states**: Are buttons disabled during submission?

### 5.4 Accessibility

- [ ] **Keyboard navigation**: Can all actions be done via keyboard?
- [ ] **Focus management**: Is focus properly managed after navigation?
- [ ] **ARIA labels**: Do icons and buttons have aria-labels?
- [ ] **Color contrast**: Is text readable (WCAG AA compliance)?
- [ ] **Screen reader**: Does the app work with screen readers?

### 5.5 Responsiveness

- [ ] **Mobile-first**: Is the layout mobile-first?
- [ ] **Touch targets**: Are buttons at least 44px for touch?
- [ ] **No horizontal scroll**: Does content fit on mobile screens?
- [ ] **Keyboard handling**: Does the keyboard not obscure inputs on mobile?

---

## 6. File-Specific Checks

### 6.1 For Route Files (*.tsx)

- [ ] Does the route have proper TypeScript types from `Route.ComponentProps`?
- [ ] Is the `clientLoader` validating auth and redirecting if needed?
- [ ] Are loader errors handled gracefully?
- [ ] Is the component focused on rendering (logic in loader/hooks)?

### 6.2 For Component Files (*.tsx)

- [ ] Is the component single-purpose?
- [ ] Are props properly typed?
- [ ] Are side effects in useEffect?
- [ ] Is state minimal and co-located?

### 6.3 For Library Files (*.ts)

- [ ] Are functions pure where possible?
- [ ] Are dependencies explicit (no global state where avoidable)?
- [ ] Are errors thrown with clear messages?
- [ ] Is the module's public API minimal?

### 6.4 For Database Files (*.ts)

- [ ] Are queries efficient?
- [ ] Are indexes defined for common queries?
- [ ] Are transactions used for multi-step operations?
- [ ] Is the schema normalized appropriately?

### 6.5 For Config Files

- [ ] Are secrets kept out of config (use environment variables)?
- [ ] Are development and production configs separate?
- [ ] Are config values documented?
- [ ] Are paths correct (watch for typos like `ts-tauri` vs `tauri-ts`)?

---

## Quick Reference: Common Issues Found

### Security Red Flags

- `any` type on user input
- `.innerHTML` or `dangerouslySetInnerHTML`
- Hardcoded secrets
- `console.log` with sensitive data (keys, passwords, tokens)
- Missing auth checks on routes
- Non-parameterized SQL
- Weak random number generation

### Performance Red Flags

- Missing `useMemo`/`useCallback` on expensive operations
- Missing pagination
- No loading states
- Sync operations blocking UI
- Large bundle imports (import entire library vs specific exports)
- N+1 queries in loops

### Maintainability Red Flags

- Functions over 100 lines
- More than 3-4 levels of nesting
- Copy-pasted code
- Unclear variable names (e.g., `x`, `temp`, `data`)
- Missing TypeScript types
- No error handling
- String literals for routes instead of `href()`

### UI Consistency Red Flags

- Hardcoded colors (`text-red-500`) instead of theme variables
  (`text-destructive`)
- Mixed icon libraries
- Inconsistent button sizes/variants
- Missing loading/error/empty states

---

## Lessons Learned from Past Audits

### December 2025 Audit (Phase 2)

**Critical finding - Debug logging exposing secrets:**

Found ~80 `console.log` statements in `import-vault.tsx` and `new-vault.3.tsx`
that logged sensitive cryptographic material:

```typescript
// BAD - Found and removed:
console.log("Password Key:", passwordKey.buf.toHex());
console.log("Login Key:", loginKey.buf.toHex());
console.log("Encryption Key:", encryptionKey.buf.toHex());
console.log("Decrypted Vault Key:", vaultKey.buf.toHex());
```

**Lesson**: Always search for `console.log` containing key-related terms during
security audits. Debug logging during development can become a security
vulnerability if not removed.

**Type safety - String URLs vs href():**

Found string literal URLs (`to="/"`) instead of type-safe `href("/")` in
multiple components. This bypasses React Router's type checking and won't catch
errors when routes are renamed.

```typescript
// BAD:
<Link to="/">Home</Link>

// GOOD:
<Link to={href("/")}>Home</Link>
```

**UI consistency - Theme colors:**

Found inconsistent error colors using `text-red-500` instead of
`text-destructive`. Theme variables ensure consistency across light/dark modes.

**Config typos:**

Found `frontendDist: "../ts-tauri/dist"` instead of `"../tauri-ts/dist"` in
`tauri.conf.json`. Path typos in config files can cause silent build failures.

---

## Audit Severity Levels

When documenting findings, categorize by severity:

- **Critical**: Security issues, data loss risk, production blockers
- **High**: Bugs, significant maintainability issues, performance problems
- **Medium**: Code quality, minor UX issues, technical debt
- **Low**: Style, documentation, minor improvements

Fix critical and high issues before proceeding. Medium and low can be tracked
for later.

---

## 7. Security Findings & Recommendations

This section documents security findings from documentation audits and code
reviews.

### December 2025 Documentation Audit

**Key Rotation Recommendation:**

Following Let's Encrypt's announcement of reducing TLS certificate validity from
90 to 45 days, KeyPears adopts **45-day rotation periods** for:

- **Server derivation entropy**: Rotate `DERIVATION_ENTROPY_N` every 45 days
- **Vault keys**: Recommend users rotate vault keys every 45 days (not yet
  implemented in UI)

**Rationale**: While KeyPears doesn't use TLS certificates directly for key
material, the 45-day period represents industry consensus on balancing security
(limiting exposure window) with operational practicality.

**Message Size Limits:**

The 10KB message size limit serves as DOS mitigation. Large messages could
exhaust server resources. This limit is appropriate for the current use case
(sharing passwords and small secrets).

**Session Token Security:**

Session tokens are:

- 32 bytes of cryptographically random data (256 bits entropy)
- Stored hashed (SHA-256) in database
- Per-device, enabling individual revocation
- Transmitted only over HTTPS

This design follows password manager industry best practices.

**Not Yet Implemented (Planned):**

- Vault key rotation UI/UX
- Session token expiration enforcement
- Rate limiting on authentication endpoints

---

**Last Updated**: 2025-12-21
