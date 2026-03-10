# Architecture

Lattice is a flexible graph builder deployed as a single Cloudflare Worker serving both the API and SPA.

## Stack

- **API**: Cloudflare Worker + Hono, base path `/api/v1`
- **Database**: Cloudflare D1 (SQLite) — relational tables for structure, JSON columns for flexible field storage
- **Frontend**: Vite + React + TypeScript + Tailwind CSS + shadcn/ui + TanStack Router + TanStack Table
- **Graph visualization**: React Flow + @dagrejs/dagre for auto-layout
- **Auth**: BetterAuth with email magic link via Resend; PAT tokens for API/CLI
- **Monorepo**: pnpm workspaces — `packages/api`, `packages/web`, `packages/cli`, `packages/shared`

## Key design decisions

- **Hybrid schema**: relational tables define graph structure (types, fields); node/edge instance data stored as JSON in `data` columns
- **Single Worker**: production serves API routes and static SPA assets from one Worker
- **Offset-based pagination**: `?offset=&limit=` with max 100
- **Hard deletes with cascade**: deleting a type removes its instances and connected edges
- **Slug immutability**: type and field slugs are generated on create and never change

For the full list of architectural decisions, see the [implementation plan](../plans/mvp/implementation-plan.md).
