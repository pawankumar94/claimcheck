import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { PACKAGE_ROOT } from "./resolve.js";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const START = "# diedinchat:start";
const END = "# diedinchat:end";

export type SupportedHook = "pre-commit" | "post-merge";

function hookBlock(): string {
  return `${START}
repo_root="$(git rev-parse --show-toplevel)"
if command -v diedinchat >/dev/null 2>&1; then
  diedinchat check --dir "$repo_root"
elif [ -x "$repo_root/node_modules/.bin/diedinchat" ]; then
  "$repo_root/node_modules/.bin/diedinchat" check --dir "$repo_root"
else
  echo "diedinchat: CLI not found; skipping ticket check" >&2
fi
${END}`;
}

export async function installCheckHook(
  root: string,
  hook: SupportedHook
): Promise<{ hook: SupportedHook; path: string; action: "created" | "updated" | "appended" }> {
  if (hook !== "pre-commit" && hook !== "post-merge") {
    throw new Error(`Unsupported hook "${hook}". Use pre-commit or post-merge.`);
  }

  const { stdout } = await execFileAsync("git", ["rev-parse", "--git-path", `hooks/${hook}`], {
    cwd: root,
    encoding: "utf8",
  });
  const reported = stdout.trim();
  const path = resolve(root, reported);
  const block = hookBlock();
  let action: "created" | "updated" | "appended";
  let next: string;

  if (!existsSync(path)) {
    action = "created";
    next = `#!/bin/sh\n\n${block}\n`;
  } else {
    const current = await readFile(path, "utf8");
    if (current.includes(START) && current.includes(END)) {
      action = "updated";
      next = current.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
    } else {
      action = "appended";
      next = `${current.trimEnd()}\n\n${block}\n`;
    }
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next);
  await chmod(path, 0o755);
  return { hook, path, action };
}


/**
 * Installs the Claude Code PreToolUse adapter: the script, plus the settings
 * entry that fires it before Edit/Write/MultiEdit.
 *
 * Merged into settings.json rather than overwriting it, and matched on our own
 * command string so re-running is idempotent and someone else's hooks survive.
 */
export async function installClaudeCodeHook(
  root: string
): Promise<{ script: string; settings: string; action: "created" | "updated" }> {
  const scriptDir = join(root, ".claude", "hooks");
  const script = join(scriptDir, "diedinchat-gate.mjs");
  await mkdir(scriptDir, { recursive: true });
  await copyFile(join(PACKAGE_ROOT, "templates", "adapters", "claude-code-pretooluse.mjs"), script);
  await chmod(script, 0o755);

  const settingsPath = join(root, ".claude", "settings.json");
  const settings: Record<string, any> = existsSync(settingsPath)
    ? JSON.parse(await readFile(settingsPath, "utf8"))
    : {};
  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];

  const command = "$CLAUDE_PROJECT_DIR/.claude/hooks/diedinchat-gate.mjs";
  const entry = {
    matcher: "Edit|Write|MultiEdit|NotebookEdit",
    hooks: [{ type: "command", command: `node ${command}`, timeout: 10 }],
  };

  const existing = settings.hooks.PreToolUse.findIndex((g: any) =>
    (g?.hooks ?? []).some((h: any) => typeof h?.command === "string" && h.command.includes("diedinchat-gate"))
  );
  const action = existing >= 0 ? "updated" : "created";
  if (existing >= 0) settings.hooks.PreToolUse[existing] = entry;
  else settings.hooks.PreToolUse.push(entry);

  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  return { script, settings: settingsPath, action };
}
