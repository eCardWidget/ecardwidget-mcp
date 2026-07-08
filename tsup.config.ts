import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  minify: false,
  sourcemap: true,
  // Prepend a shebang so `npx ecardwidget-mcp` / direct execution works.
  banner: { js: "#!/usr/bin/env node" },
});
