import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
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


/** Coding agents that expose a hook capable of denying a write. */
export type AgentHost = "claude-code" | "cursor";

interface HostSpec {
  adapter: string;
  scriptPath: (root: string) => string;
  settingsPath: (root: string) => string;
  /** Merge our entry into whatever config the user already has. */
  merge: (settings: Record<string, any>, scriptRel: string) => Record<string, any>;
  ignoreDir: string;
  note: string;
}

const HOSTS: Record<AgentHost, HostSpec> = {
  "claude-code": {
    adapter: "claude-code-pretooluse.mjs",
    scriptPath: (root) => join(root, ".claude", "hooks", "diedinchat-gate.mjs"),
    settingsPath: (root) => join(root, ".claude", "settings.json"),
    ignoreDir: ".claude",
    note: "PreToolUse on Edit|Write|MultiEdit",
    merge(settings, scriptRel) {
      settings.hooks ??= {};
      settings.hooks.PreToolUse ??= [];
      const entry = {
        matcher: "Edit|Write|MultiEdit|NotebookEdit",
        hooks: [{ type: "command", command: `node $CLAUDE_PROJECT_DIR/${scriptRel}`, timeout: 10 }],
      };
      const at = settings.hooks.PreToolUse.findIndex((g: any) =>
        (g?.hooks ?? []).some((h: any) => typeof h?.command === "string" && h.command.includes("diedinchat-gate"))
      );
      if (at >= 0) settings.hooks.PreToolUse[at] = entry;
      else settings.hooks.PreToolUse.push(entry);
      return settings;
    },
  },
  cursor: {
    adapter: "cursor-pretooluse.mjs",
    scriptPath: (root) => join(root, ".cursor", "hooks", "diedinchat-gate.mjs"),
    settingsPath: (root) => join(root, ".cursor", "hooks.json"),
    ignoreDir: ".cursor",
    note: "preToolUse",
    merge(settings, scriptRel) {
      // Cursor's hooks.json is versioned and keyed by hook name, with no
      // matcher: the adapter filters on tool_input itself.
      settings.version ??= 1;
      settings.hooks ??= {};
      settings.hooks.preToolUse ??= [];
      const entry = { command: `node ./${scriptRel}`, timeout: 10 };
      const at = settings.hooks.preToolUse.findIndex(
        (h: any) => typeof h?.command === "string" && h.command.includes("diedinchat-gate")
      );
      if (at >= 0) settings.hooks.preToolUse[at] = entry;
      else settings.hooks.preToolUse.push(entry);
      return settings;
    },
  },
};

export const AGENT_HOSTS = Object.keys(HOSTS) as AgentHost[];

/**
 * Installs a pre-write adapter: the script, plus the config entry that fires it.
 *
 * Config is merged rather than overwritten and matched on our own command
 * string, so re-running is idempotent and someone else's hooks survive.
 */
export async function installAgentHook(
  root: string,
  host: AgentHost
): Promise<{ host: AgentHost; script: string; settings: string; note: string; action: "created" | "updated" }> {
  const spec = HOSTS[host];
  if (!spec) throw new Error(`Unsupported agent "${host}". Today: ${AGENT_HOSTS.join(", ")}.`);

  const script = spec.scriptPath(root);
  await mkdir(dirname(script), { recursive: true });
  await copyFile(join(PACKAGE_ROOT, "templates", "adapters", spec.adapter), script);
  await chmod(script, 0o755);

  const settingsPath = spec.settingsPath(root);
  const settings = existsSync(settingsPath) ? JSON.parse(await readFile(settingsPath, "utf8")) : {};

  // "created" vs "updated" describes OUR hook entry, not whether the user
  // happened to have a settings file already. Someone with existing settings
  // installing this for the first time has created something.
  const hadOurs = JSON.stringify(settings).includes("diedinchat-gate");
  const scriptRel = relative(root, script).split(sep).join("/");
  const merged = spec.merge(settings, scriptRel);

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(merged, null, 2) + "\n");
  return { host, script, settings: settingsPath, note: spec.note, action: hadOurs ? "updated" : "created" };
}

export function agentHookIgnoreDir(host: AgentHost): string {
  return HOSTS[host].ignoreDir;
}
