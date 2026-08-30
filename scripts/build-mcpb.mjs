/**
 * Builds the MCPB bundle Smithery needs for a stdio server.
 *
 * Layout matters: findPackageRoot in src/core/resolve.ts walks up to the
 * nearest package.json to locate templates/, profiles/ and skills/. So the
 * bundle carries a package.json beside dist/, and PACKAGE_ROOT resolves to
 * server/ once unpacked. Bundling the deps into a single file instead would
 * break that lookup silently -- `install` would find no template.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "build/mcpb";
const SERVER = join(OUT, "server");
const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

rmSync("build", { recursive: true, force: true });
mkdirSync(SERVER, { recursive: true });

for (const dir of ["dist", "templates", "profiles", "skills"]) {
  cpSync(dir, join(SERVER, dir), { recursive: true });
}
cpSync("README.md", join(SERVER, "README.md"));
cpSync("LICENSE", join(SERVER, "LICENSE"));

// Runtime deps only, and no scripts: the bundle must not need a build step.
writeFileSync(
  join(SERVER, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: pkg.type,
      main: pkg.main,
      bin: pkg.bin,
      dependencies: pkg.dependencies,
    },
    null,
    2
  ) + "\n"
);

execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--silent"], {
  cwd: SERVER,
  stdio: "inherit",
});

const manifest = {
  manifest_version: "0.1",
  name: pkg.name,
  display_name: "diedinchat",
  version: pkg.version,
  description: pkg.description,
  long_description:
    "diedinchat stores a constraint as a JSON file in .diedinchat/, addressed to the paths it " +
    "concerns. The next agent -- in any tool, in a fresh session -- reads it before editing. " +
    "Status is recomputed from file hashes and frozen evidence on every read, with no model " +
    "involved. Measured: agents followed pinned rules 18/20 times versus 0/20 without.",
  author: { name: "Pawan Kumar", url: "https://github.com/pawankumar94" },
  homepage: pkg.homepage,
  documentation: pkg.homepage,
  license: pkg.license,
  keywords: ["coding-agents", "context", "developer-tools", "code-review"],
  server: {
    type: "node",
    entry_point: "server/dist/cli.js",
    mcp_config: { command: "node", args: ["${__dirname}/server/dist/cli.js", "mcp"] },
  },
  tools: [
    { name: "pin_claim", description: "Pin a rule to one or more paths" },
    { name: "list_claims_for_file", description: "List rules covering a path, with live status" },
    { name: "check_claim", description: "Re-evaluate a rule against current files" },
    { name: "close_claim", description: "Retire a rule, keeping its history" },
    { name: "unpin_claim", description: "Delete a rule permanently" },
  ],
};
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

execFileSync("npx", ["-y", "@anthropic-ai/mcpb@2", "validate", join(OUT, "manifest.json")], { stdio: "inherit" });
execFileSync("npx", ["-y", "@anthropic-ai/mcpb@2", "pack", OUT, `build/diedinchat-${pkg.version}.mcpb`], {
  stdio: "inherit",
});
