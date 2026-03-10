# ADR-002: BetterAuth magic link auth with PAT tokens

## Status

Accepted

## Context

Lattice needs authentication for three contexts:

1. **Browser sessions** — users interacting with the web UI
2. **API/CLI access** — programmatic access from CLI tools and AI agents
3. **Local development** — frontend dev without a real email provider

We considered:

- **Custom auth** (session table, magic link via Resend, cookie management) — full control but significant implementation surface
- **OAuth providers** (Google, GitHub) — familiar but adds third-party dependency and doesn't fit the "email-first" model
- **BetterAuth** — library that handles session management, cookie security, and plugin ecosystem (magic link, OAuth) with D1 adapter support

For programmatic access, we needed tokens that work with `Authorization: Bearer` headers, are safe to store (not reversible if leaked from DB), and are easy to distinguish visually.

## Decision

**BetterAuth with magic link plugin** for browser sessions, **custom PAT tokens** for API/CLI, and a **3-tier auth middleware** that chains them.

### Browser auth: BetterAuth + Resend

- BetterAuth configured with Kysely D1 adapter and CamelCasePlugin for snake_case column mapping
- Magic link plugin sends sign-in emails via Resend
- Email/password disabled — magic link is the only sign-in method
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`
- Same-origin in production (single Worker serves API + SPA); Vite proxy in dev

### PAT tokens: custom implementation

- Format: `lat_` prefix + 32 hex chars (128 bits of entropy)
- SHA-256 hashed before storage — raw token shown once at creation, never stored
- Looked up by hash on each request; `last_used_at` updated via `waitUntil` (non-blocking)

### Auth middleware: 3-tier check

The middleware tries each method in order, stopping at the first match:

1. **`DEV_AUTH_BYPASS`** — if `"true"`, injects a deterministic dev user (ULID `01AAAAAAAAAAAAAAAAAAAADEV`, email `dev@lattice.local`) and auto-inserts the user row so FK constraints work
2. **Session cookie** — delegates to `BetterAuth.api.getSession()`
3. **Bearer token** — hashes the token, looks up `pat_tokens` by hash, joins to `users`
4. If none match → `401 Authentication required`

### Dev auth bypass

Extended to also intercept BetterAuth's `GET /api/auth/get-session` endpoint, returning a synthetic session response so the web frontend's auth guard works without a real session cookie during local development.

## Consequences

- Magic link eliminates password storage and reset flows — simpler and more secure
- BetterAuth handles session lifecycle, cookie security, and CSRF — less custom code
- PAT tokens are independent of BetterAuth — if we ever replace the session library, API auth is unaffected
- `lat_` prefix makes tokens visually identifiable and greppable in logs/config
- SHA-256 hashing means a database leak doesn't expose usable tokens
- `waitUntil` for `last_used_at` avoids adding latency to every authenticated request
- DEV_AUTH_BYPASS must be carefully guarded — only set via `.dev.vars` (gitignored), never in production secrets
- BetterAuth's Kysely D1 adapter required a CamelCasePlugin workaround for snake_case column names, and the D1 `exec()` method had issues with SQL comments in test environments (worked around with `batch()`)
