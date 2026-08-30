#!/usr/bin/env node
/**
 * diedinchat adapter for Cursor's preToolUse hook.
 *
 * A thin projection over `diedinchat gate`, structurally identical to the
 * Claude Code adapter. Only the wire format differs: Cursor wants
 * {permission, agent_message}; Claude Code wants hookSpecificOutput. Both ask
 * the same command the same question, so the two hosts cannot disagree about
 * which rules cover a path.
 *
 * Deliberately self-contained rather than importing a shared helper: this file
 * is copied into the user's project, and a copied script with an import is a
 * script that breaks the first time someone moves it.
 *
 * Note on Cursor specifically: preToolUse can deny a write, but afterFileEdit
 * is observational only, and neither covers a human editing by hand. The git
 * hook remains the floor.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const allow = (extra = {}) => {
  console.log(JSON.stringify({ permission: "allow", ...extra }));
  process.exit(0);
};

const raw = await new Promise((resolve) => {
  let buf = "";
  process.stdin.on("data", (d) => (buf += d));
  process.stdin.on("end", () => resolve(buf));
});

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  allow(); // Malformed input is not the user's problem; never block on it.
}

const input = payload?.tool_input ?? {};
const filePath = input.file_path ?? input.path ?? input.target_file;
const cwd = payload?.cwd ?? process.cwd();
if (!filePath) allow();

let stdout = "";
let blocked = false;
try {
  ({ stdout } = await run("diedinchat", ["gate", "--path", filePath, "--dir", cwd, "--json"]));
} catch (err) {
  // Exit 2 is a real block. Anything else means diedinchat itself failed, and a
  // broken tool must not read as either permission or refusal.
  if (err.code !== 2) allow();
  blocked = true;
  stdout = err.stdout ?? "";
}

let result;
try {
  result = JSON.parse(stdout);
} catch {
  allow();
}

if (blocked && result.blocking?.length) {
  const reasons = result.blocking
    .map((b) => `${b.text} (frozen evidence gone: ${b.missingEvidence.join(", ")})`)
    .join("; ");
  console.log(
    JSON.stringify({
      permission: "deny",
      user_message: `diedinchat blocked a write to ${filePath}: a pinned rule is contradicted.`,
      agent_message:
        `A pinned rule covering ${filePath} is contradicted: ${reasons}. ` +
        `Re-check it with \`diedinchat check\`, then either honor it or close it with ` +
        `\`diedinchat close <id>\` if it is no longer true.`,
    })
  );
  process.exit(0);
}

if (result.rules?.length) {
  const lines = result.rules.map((r) => `- ${r.text} [${r.status}]`).join("\n");
  allow({ agent_message: `Rules pinned to ${filePath} in .diedinchat/:\n${lines}` });
}
allow();
