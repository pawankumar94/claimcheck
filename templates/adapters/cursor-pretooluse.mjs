#!/usr/bin/env node
/**
 * diedinchat adapter for Cursor's preToolUse hook.
 *
 * A thin projection over `diedinchat gate`. It holds no matching logic: every
 * adapter asks the same command the same question, so two hosts cannot disagree
 * about which rules cover a path.
 *
 * Self-contained on purpose. This file is copied into your project, and a
 * copied script with an import breaks the first time someone moves it.
 *
 * Cursor specifics: preToolUse can deny a write; afterFileEdit is observational
 * and cannot. Neither covers a human editing by hand -- the git hook is the floor.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";

const run = promisify(execFile);

// Substituted at install time.
const PINNED_VERSION = "__DIEDINCHAT_VERSION__";
const FAIL_CLOSED = __FAIL_CLOSED__;

const say = (obj) => {
  console.log(JSON.stringify(obj));
  process.exit(0);
};
const allow = (extra = {}) => say({ permission: "allow", ...extra });

/**
 * Resolve the CLI without assuming a global install. `npx diedinchat
 * install-agent-hook` leaves no binary on PATH and no local dependency, so
 * assuming PATH would leave this hook silently inert.
 */
async function gate(cwd, filePath) {
  const args = ["gate", "--path", filePath, "--dir", cwd, "--json"];
  const candidates = [];
  const local = join(cwd, "node_modules", ".bin", "diedinchat");
  if (existsSync(local)) candidates.push([local, args]);
  candidates.push(["diedinchat", args]);
  candidates.push(["npx", ["-y", `diedinchat@${PINNED_VERSION}`, ...args]]);

  for (const [cmd, argv] of candidates) {
    try {
      const { stdout } = await run(cmd, argv);
      return { ok: true, blocked: false, stdout };
    } catch (err) {
      if (err.code === 2) return { ok: true, blocked: true, stdout: err.stdout ?? "" };
      // ENOENT or a non-2 exit: try the next candidate.
    }
  }
  return { ok: false, blocked: false, stdout: "" };
}

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

const { ok, blocked, stdout } = await gate(cwd, filePath);

if (!ok) {
  // diedinchat could not be run. Failing open keeps people working; failing
  // closed is for teams that need the guarantee. Neither is silently correct,
  // so it is chosen at install time.
  if (!FAIL_CLOSED) allow();
  say({
    permission: "deny",
    user_message: "diedinchat could not be run, and this hook is fail-closed.",
    agent_message:
      "diedinchat could not be run, and this hook was installed with --fail-closed. " +
      "Install it (npm i -D diedinchat) or reinstall the hook without --fail-closed.",
  });
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
  say({
    permission: "deny",
    user_message: `diedinchat blocked a write to ${filePath}: a pinned rule is contradicted.`,
    agent_message:
      `A pinned rule covering ${filePath} is contradicted: ${reasons}. ` +
      `Re-check it with \`diedinchat check\`, then either honor it or close it with ` +
      `\`diedinchat close <id>\` if it is no longer true.`,
  });
}

if (result.rules?.length) {
  const lines = result.rules.map((r) => `- ${r.text} [${r.status}]`).join("\n");
  allow({ agent_message: `Rules pinned to ${filePath} in .diedinchat/:\n${lines}` });
}
allow();
