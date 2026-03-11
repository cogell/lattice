# Architecture

Lattice is a flexible graph builder deployed as a single Cloudflare Worker serving both the API and SPA.

## Stack

- **API**: Cloudflare Worker + Hono, base path `/api/v1`
- **Database**: Cloudflare D1 (SQLite) — relational tables for structure, JSON columns for flexible field storage
- **Frontend**: Vite + React + TypeScript + Tailwind CSS + shadcn/ui + TanStack Router + TanStack Table
- **Graph visualization**: React Flow + @dagrejs/dagre for auto-layout
- **Auth**: BetterAuth with email magic link via Resend; PAT tokens for API/CLI
- **Monorepo**: pnpm workspaces — `packages/api`, `packages/web`, `packages/cli`, `packages/shared`

## CLI

The CLI (`packages/cli`) is published as `@cogell/lattice` on npm. It bundles all dependencies (including `@lattice/shared`) into a single CJS file via tsup, so the installed package has zero runtime dependencies. See [ADR-004](decisions/004-tsup-cjs-bundling-for-cli.md).

Authentication: `lattice login` stores a PAT token and API URL in `~/.lattice/config.json`. Defaults to the production API URL when none is specified.

Edge CSV import supports display-name resolution: column headers matching node type names (or `Source <Type>`/`Target <Type>` for same-type edges) are resolved to node IDs client-side before upload. See [ADR-005](decisions/005-edge-display-name-resolution.md).

## Key design decisions

- **Hybrid schema**: relational tables define graph structure (types, fields); node/edge instance data stored as JSON in `data` columns
- **Single Worker**: production serves API routes and static SPA assets from one Worker
- **Offset-based pagination**: `?offset=&limit=` with max 100
- **Hard deletes with cascade**: deleting a type removes its instances and connected edges
- **Slug immutability**: type and field slugs are generated on create and never change

For the full list of architectural decisions, see the [implementation plan](../plans/mvp/implementation-plan.md). For individual decisions, see [docs/decisions/](decisions/).
