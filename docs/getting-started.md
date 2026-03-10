# Getting Started

## Prerequisites

- Node.js 18+
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
cp packages/api/.dev.vars.example packages/api/.dev.vars  # if available
```

## Development

```bash
# Start API dev server (wrangler)
pnpm --filter api dev

# Start web dev server (Vite, proxies /api/v1 to wrangler)
pnpm --filter web dev
```

## Project structure

```
packages/
├── api/       Cloudflare Worker (Hono) — REST API
├── web/       React SPA (Vite + TanStack Router)
├── cli/       CLI client
├── shared/    Shared types, Zod schemas, API client
```
