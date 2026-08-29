import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { describeBuiltinProfiles, type BuiltinProfileSummary } from "./resolve.js";

/**
 * Zero-config agent detection.
 *
 * The first run must not require the user to know which profile names exist,
 * let alone author one. We look at what is actually installed on PATH and pick
 * a profile whose command is present, preferring verified profiles so a first
 * result is not silently produced by unchecked CLI flags.
 */

export function isOnPath(command: string): boolean {
  if (command.includes("/")) return existsSync(command);
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  return dirs.some((d) => existsSync(join(d, command)));
}

export interface DetectedAgent extends BuiltinProfileSummary {
  installed: boolean;
  /** Environment variables the profile needs that are currently unset. */
  missingEnv: string[];
}

/**
 * Environment a profile needs beyond its command being present. Kept here
 * rather than in the profile because it describes the host, not the
 * invocation, and a profile carrying a project id would not be portable.
 */
const REQUIRED_ENV: Record<string, string[]> = {
  "gemini-cli": ["GEMINI_API_KEY"],
  "claude-code": ["ANTHROPIC_API_KEY"],
  "claude-code-vertex": [
    "CLAUDE_CODE_USE_VERTEX",
    "ANTHROPIC_VERTEX_PROJECT_ID",
    "GOOGLE_APPLICATION_CREDENTIALS",
  ],
};

export async function detectAgents(): Promise<DetectedAgent[]> {
  const profiles = await describeBuiltinProfiles();
  return profiles.map((p) => ({
    ...p,
    installed: isOnPath(p.command),
    missingEnv: (REQUIRED_ENV[p.name] ?? []).filter((v) => !process.env[v]),
  }));
}

/**
 * The agent a zero-argument run should use: installed, fully configured, and
 * verified, in that order of importance. Returns null when nothing qualifies,
 * so the caller can explain what to install rather than fail obscurely.
 */
export async function pickDefaultAgent(): Promise<{ chosen: DetectedAgent | null; all: DetectedAgent[] }> {
  const all = await detectAgents();
  const ready = all.filter((a) => a.installed && a.missingEnv.length === 0);
  const chosen =
    ready.find((a) => a.verified) ?? ready[0] ?? null;
  return { chosen, all };
}

/** Human-readable explanation of why no agent could be selected. */
export function explainNoAgent(all: DetectedAgent[]): string {
  const lines = ["No coding agent is ready to measure. diedinchat found:", ""];
  for (const a of all) {
    const status = !a.installed
      ? `not installed (needs \`${a.command}\` on PATH)`
      : a.missingEnv.length > 0
        ? `installed, but missing ${a.missingEnv.join(", ")}`
        : "ready";
    lines.push(`  ${a.name.padEnd(20)} ${status}`);
  }
  lines.push(
    "",
    "Install one of those CLIs and authenticate it, then run this again.",
    "Nothing else needs configuring: the tasks and answer keys ship with diedinchat."
  );
  return lines.join("\n");
}
