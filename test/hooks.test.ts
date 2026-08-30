import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { installCheckHook } from "../src/core/hooks.js";

const execFileAsync = promisify(execFile);
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "diedinchat-hook-"));
  await execFileAsync("git", ["init", "--quiet"], { cwd: root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("installCheckHook", () => {
  it("creates an executable post-merge hook and updates it idempotently", async () => {
    const first = await installCheckHook(root, "post-merge");
    const second = await installCheckHook(root, "post-merge");
    const body = await readFile(first.path, "utf8");
    expect(first.action).toBe("created");
    expect(second.action).toBe("updated");
    expect(body.match(/# diedinchat:start/g)).toHaveLength(1);
    expect(body).toContain('diedinchat check --dir "$repo_root"');
    expect((await stat(first.path)).mode & 0o111).not.toBe(0);
  });

  it("preserves an existing hook while appending its fenced block", async () => {
    const hookPath = join(root, ".git", "hooks", "pre-commit");
    await writeFile(hookPath, "#!/bin/sh\necho user-hook\n");
    const result = await installCheckHook(root, "pre-commit");
    const body = await readFile(hookPath, "utf8");
    expect(result.action).toBe("appended");
    expect(body).toContain("echo user-hook");
    expect(body).toContain("# diedinchat:start");
  });

  it("rejects unsupported hook names", async () => {
    await expect(installCheckHook(root, "pre-push" as never)).rejects.toThrow(/Unsupported hook/);
  });
});
