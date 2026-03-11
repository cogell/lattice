# ADR-004: tsup CJS bundling for CLI npm publishing

## Status

Accepted

## Context

The CLI (`packages/cli`) depends on `@lattice/shared` (a workspace package) and several npm packages (commander, chalk, cli-table3). For `npm i -g @cogell/lattice` to work, all dependencies must be resolvable at install time. The workspace package `@lattice/shared` is not published to npm, so it cannot be listed as a regular dependency.

Options considered:

1. **Publish `@lattice/shared` to npm** — adds a second package to maintain, version, and publish in lockstep.
2. **Bundle everything with tsup** — produce a single self-contained file with zero runtime dependencies.
3. **Use `tsc` and list all deps in `dependencies`** — still can't resolve `@lattice/shared` for global installs.

ESM bundling was attempted first but failed because commander.js uses `require('events')`, which is not supported in ESM bundles ("Dynamic require of events is not supported").

## Decision

Bundle the CLI into a single CJS file using tsup. All npm and workspace dependencies are inlined (`noExternal: [/.*/]`). Only Node.js built-in modules are externalized. The shebang (`#!/usr/bin/env node`) is injected via tsup's `banner` option rather than in source code (to avoid double shebangs).

Configuration (`tsup.config.ts`):

```typescript
import { defineConfig } from "tsup";
import { builtinModules } from "node:module";

const nodeBuiltins = builtinModules.flatMap((m) => [m, `node:${m}`]);

export default defineConfig({
  entry: ["src/index.ts"],
  format: "cjs",
  target: "node20",
  outDir: "dist",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/.*/],
  external: nodeBuiltins,
});
```

The `bin` field in `package.json` points to `./dist/index.cjs`, and all runtime dependencies are moved to `devDependencies` (since they're bundled, not needed at install time).

## Consequences

- The installed CLI has zero runtime dependencies — `npm i -g` is fast and reliable
- Single ~850 KB file, acceptable for a CLI tool
- CJS format required (not ESM) due to commander.js's dynamic `require()` calls
- `@lattice/shared` changes require rebuilding the CLI (`pnpm build`)
- Local development uses `tsx` for direct TypeScript execution; the bundled artifact is only for distribution
