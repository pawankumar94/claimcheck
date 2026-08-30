import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAgentProfile } from "../agents/profile.js";
import type { AgentProfile } from "../types.js";

/**
 * Root of the installed package, so built-in profiles and bundled examples
 * are findable no matter where the caller's cwd is. This matters most when
 * diedinchat runs as an MCP server: the calling agent has no idea where npm
 * put the package, so it can only refer to built-ins by name.
 */
function findPackageRoot(startDir: string): string {
  // Walk up to the nearest package.json rather than assuming a fixed depth:
  // bundled code sits at dist/ (one level down) while source sits at
  // src/core/ (two), so a hardcoded "../" is correct in only one of them.
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir, "..");
}

export const PACKAGE_ROOT = findPackageRoot(dirname(fileURLToPath(import.meta.url)));

/**
 * Read from package.json rather than repeated as a literal. Two hardcoded
 * copies had already drifted: 0.1.1 shipped reporting itself as 0.1.0 from
 * both `--version` and the MCP handshake.
 */
export const VERSION: string = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8")
).version;

export const PROFILES_DIR = join(PACKAGE_ROOT, "profiles");
export const EXAMPLES_DIR = join(PACKAGE_ROOT, "examples");

/**
 * Resolves an agent reference that is either a built-in profile name
 * ("claude-code") or a filesystem path to a profile JSON file. Paths win
 * when both could match, so a local file can shadow a built-in.
 */
export async function resolveAgentProfile(nameOrPath: string): Promise<AgentProfile> {
  if (existsSync(nameOrPath)) return loadAgentProfile(nameOrPath);

  const builtin = join(PROFILES_DIR, `${nameOrPath}.json`);
  if (existsSync(builtin)) return loadAgentProfile(builtin);

  const available = await listBuiltinProfileNames();
  throw new Error(
    `No agent profile found for "${nameOrPath}". It is neither an existing file path ` +
      `nor a built-in profile. Built-in profiles: ${available.join(", ") || "(none)"}.`
  );
}

export async function listBuiltinProfileNames(): Promise<string[]> {
  if (!existsSync(PROFILES_DIR)) return [];
  const files = await readdir(PROFILES_DIR);
  return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
}

export interface BuiltinProfileSummary {
  name: string;
  description: string;
  command: string;
  policies: string[];
  verified: boolean;
  verificationNote?: string;
}

export async function describeBuiltinProfiles(): Promise<BuiltinProfileSummary[]> {
  const names = await listBuiltinProfileNames();
  const summaries: BuiltinProfileSummary[] = [];
  for (const name of names) {
    const profile = await loadAgentProfile(join(PROFILES_DIR, `${name}.json`));
    summaries.push({
      name: profile.name,
      description: profile.description ?? "",
      command: profile.command,
      policies: Object.keys(profile.policyArgs).sort(),
      verified: profile.verified === true,
      ...(profile.verificationNote ? { verificationNote: profile.verificationNote } : {}),
    });
  }
  return summaries;
}

/** Path to a task set bundled with the package, e.g. "claim-001-tool-count". */
export function builtinExampleTasksPath(exampleName: string): string {
  return join(EXAMPLES_DIR, exampleName, "tasks.json");
}

export async function listBuiltinExamples(): Promise<string[]> {
  if (!existsSync(EXAMPLES_DIR)) return [];
  const entries = await readdir(EXAMPLES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && existsSync(join(EXAMPLES_DIR, e.name, "tasks.json")))
    .map((e) => e.name)
    .sort();
}
