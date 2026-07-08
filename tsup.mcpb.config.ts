import { defineConfig } from "tsup";

/**
 * Self-contained build for the Claude Desktop extension (.mcpb). Unlike the npm
 * build (external deps, resolved by npm install), a desktop extension is a zip
 * with no install step — so we inline ALL dependencies into one file. Output
 * goes to mcpb/server/index.js, which manifest.json points at.
 */
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node18",
  outDir: "mcpb/server",
  noExternal: [/.*/], // bundle every dependency (node: builtins stay external)
  clean: true,
  minify: true,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
});
