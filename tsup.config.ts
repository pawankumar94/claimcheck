import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    "mcp-bin": "src/mcp-bin.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node18",
  platform: "node",
  sourcemap: true,
  clean: true,
  dts: false,
  banner: ({ entry }) =>
    entry?.includes("cli") || entry?.includes("mcp-bin") ? { js: "#!/usr/bin/env node" } : {},
});
