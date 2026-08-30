import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pinClaim } from "../src/core/claims.js";
import { installClaudeCodeHook } from "../src/core/hooks.js";

const execFileAsync = promisify(execFile);

describe("gate — the primitive every adapter projects over", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "gate-"));
    await execFileAsync("git", ["init", "--quiet", root]);
    await mkdir(join(root, "src", "routes"), { recursive: true });
    await writeFile(join(root, "src", "middleware.ts"), "export const withAuth = 1;\n");
    await writeFile(join(root, "src", "routes", "home.ts"), "export const home = 1;\n");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const gate = async (path: string) => {
    const cli = new URL("../dist/cli.js", import.meta.url).pathname;
    try {
      const { stdout } = await execFileAsync(process.execPath, [cli, "gate", "--path", path, "--dir", root, "--json"]);
      return { code: 0, payload: JSON.parse(stdout) };
    } catch (err) {
      return { code: (err as { code: number }).code, payload: JSON.parse((err as { stdout: string }).stdout) };
    }
  };

  it("allows and stays quiet when no rule covers the path", async () => {
    const { code, payload } = await gate("src/untouched.ts");
    expect(code).toBe(0);
    expect(payload.decision).toBe("allow");
    expect(payload.rules).toHaveLength(0);
  });

  it("allows but surfaces a healthy rule, which is the point of the pre-write hook", async () => {
    await pinClaim({ root, text: "Auth only in middleware.", files: ["src/middleware.ts"], evidence: ["withAuth"], id: "auth" });
    const { code, payload } = await gate("src/middleware.ts");
    expect(code).toBe(0);
    expect(payload.decision).toBe("allow");
    expect(payload.rules[0].text).toContain("Auth only in middleware");
  });

  it("blocks with exit 2 when frozen evidence is gone", async () => {
    await pinClaim({ root, text: "Auth only in middleware.", files: ["src/middleware.ts"], evidence: ["withAuth"], id: "auth" });
    await writeFile(join(root, "src", "middleware.ts"), "export const gone = 1;\n");
    const { code, payload } = await gate("src/middleware.ts");
    expect(code).toBe(2);
    expect(payload.decision).toBe("block");
    expect(payload.blocking[0].missingEvidence).toContain("withAuth");
  });

  it("never blocks on a ticket with no evidence, however stale it is", async () => {
    // This is the safety rule. `stale` fired on 65% of real commits for a
    // file-pinned ticket and 97% for a directory one (docs/evidence/stale-noise.md).
    // A gate that blocks on that stops people's work for noise and gets switched off.
    await pinClaim({ root, text: "Routes stay thin.", files: ["src/routes"], id: "routes" });
    await writeFile(join(root, "src", "routes", "admin.ts"), "export const admin = 1;\n");
    const { code, payload } = await gate("src/routes");
    expect(code).toBe(0);
    expect(payload.decision).toBe("allow");
    expect(payload.rules[0].status).toBe("stale");
  });
});

describe("Claude Code PreToolUse adapter", () => {
  it("merges into settings.json without clobbering it, and stays idempotent", async () => {
    const root = await mkdtemp(join(tmpdir(), "hook-"));
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude", "settings.json"), JSON.stringify({ env: { KEEP: "me" } }));

    const first = await installClaudeCodeHook(root);
    expect(first.action).toBe("created");
    const second = await installClaudeCodeHook(root);
    expect(second.action).toBe("updated");

    const settings = JSON.parse(await readFile(join(root, ".claude", "settings.json"), "utf-8"));
    expect(settings.env.KEEP, "someone else's settings must survive").toBe("me");
    expect(settings.hooks.PreToolUse, "re-running must not duplicate the entry").toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].matcher).toContain("Write");

    await rm(root, { recursive: true, force: true });
  });
});
