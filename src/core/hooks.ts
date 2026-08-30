import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
