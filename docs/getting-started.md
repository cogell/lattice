# Getting Started

## Prerequisites

- Node.js 20+
- pnpm
- Wrangler CLI (`pnpm add -g wrangler`)

## Setup

```bash
# Clone and install
git clone <repo-url>
cd lattice
pnpm install

# Apply local D1 migrations
pnpm --filter api run db:migrate:local

# Create .dev.vars for local dev secrets
cat > packages/api/.dev.vars << 'EOF'
DEV_AUTH_BYPASS=true
EOF
```

> **Note**: `DEV_AUTH_BYPASS=true` skips authentication and injects a deterministic dev user, so the web frontend works without a real email provider.

## Development

```bash
# Start API dev server (wrangler)
pnpm --filter api dev

# Start web dev server (Vite, proxies /api/v1 to wrangler)
pnpm --filter web dev
```

## CLI

The Lattice CLI is published as `@cogell/lattice` on npm.

```bash
# Install globally
npm i -g @cogell/lattice

# Log in (defaults to production API)
lattice login

# Or point at a local dev server
lattice login --api-url http://localhost:8787/api/v1 --token <pat-token>
```

See the [CLI reference](../packages/cli/skill/REFERENCE.md) for all commands.

## Project structure

```
packages/
├── api/       Cloudflare Worker (Hono) — REST API
├── web/       React SPA (Vite + TanStack Router)
├── cli/       CLI client (@cogell/lattice on npm)
├── shared/    Shared types, Zod schemas, API client
```
