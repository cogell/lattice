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
  // Bundle all npm deps so the published package is self-contained
  noExternal: [/.*/],
  // Keep Node builtins as require() calls
  external: nodeBuiltins,
});
