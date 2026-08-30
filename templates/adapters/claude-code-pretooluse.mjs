#!/usr/bin/env node
/**
 * diedinchat adapter for Claude Code's PreToolUse hook.
 *
 * A thin projection over `diedinchat gate`. It holds no matching logic of its
 * own: every adapter shells out to the same command so nine hosts cannot drift
 * into nine different answers about which rules cover a path.
 *
 * Two jobs, and surfacing is the more valuable one. In the measured honor run,
 * one failure was the agent editing a generated file having never consulted the
 * ticket -- `additionalContext` puts the rule in front of it before the write,
 * which no instruction file can guarantee.
 *
 *   contradicted rule covers the path  -> deny, with the reason
 *   healthy rules cover the path       -> allow, and inject them as context
 *   nothing covers the path            -> stay silent
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const raw = await new Promise((resolve) => {
  let buf = "";
  process.stdin.on("data", (d) => (buf += d));
  process.stdin.on("end", () => resolve(buf));
});

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0); // Malformed input is not the user's problem; never block on it.
}

const filePath = payload?.tool_input?.file_path ?? payload?.tool_input?.notebook_path;
const cwd = payload?.cwd ?? process.cwd();
if (!filePath) process.exit(0);

let stdout = "";
let code = 0;
try {
  ({ stdout } = await run("diedinchat", ["gate", "--path", filePath, "--dir", cwd, "--json"]));
} catch (err) {
  // Exit 2 is a real block. Anything else means diedinchat itself failed, and a
  // broken tool must not read as either permission or refusal.
  if (err.code !== 2) process.exit(0);
  code = 2;
  stdout = err.stdout ?? "";
}

let result;
try {
  result = JSON.parse(stdout);
} catch {
  process.exit(0);
}

if (code === 2 && result.blocking?.length) {
  const reasons = result.blocking
    .map((b) => `${b.text} (frozen evidence gone: ${b.missingEvidence.join(", ")})`)
    .join("; ");
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `A pinned rule covering ${filePath} is contradicted: ${reasons}. ` +
          `Re-check it with \`diedinchat check\`, then either honor it or close it with ` +
          `\`diedinchat close <id>\` if it is no longer true.`,
      },
    })
  );
  process.exit(0);
}

if (result.rules?.length) {
  const lines = result.rules.map((r) => `- ${r.text} [${r.status}]`).join("\n");
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: `Rules pinned to ${filePath} in .diedinchat/:\n${lines}`,
      },
    })
  );
}
process.exit(0);
