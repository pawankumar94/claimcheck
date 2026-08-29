import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectAgents, explainNoAgent, isOnPath, pickDefaultAgent } from "../src/core/detect.js";

const ORIGINAL_PATH = process.env.PATH;
const TOUCHED = [
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_USE_VERTEX",
  "ANTHROPIC_VERTEX_PROJECT_ID",
  "GOOGLE_APPLICATION_CREDENTIALS",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of TOUCHED) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function fakeBinDir(names: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "claimcheck-bin-"));
  for (const n of names) {
    const p = join(dir, n);
    await writeFile(p, "#!/bin/sh\nexit 0\n");
    await chmod(p, 0o755);
  }
  return dir;
}

describe("isOnPath", () => {
  it("finds a command that exists on PATH", async () => {
    process.env.PATH = await fakeBinDir(["some-agent"]);
    expect(isOnPath("some-agent")).toBe(true);
    expect(isOnPath("definitely-not-here")).toBe(false);
  });

  it("treats a path-like command as a file check, not a PATH lookup", async () => {
    const dir = await fakeBinDir(["thing"]);
    expect(isOnPath(join(dir, "thing"))).toBe(true);
    expect(isOnPath(join(dir, "missing"))).toBe(false);
  });
});

describe("detectAgents", () => {
  it("reports install state and exactly which env vars are missing", async () => {
    process.env.PATH = await fakeBinDir(["gemini"]);
    const agents = await detectAgents();

    const gemini = agents.find((a) => a.name === "gemini-cli")!;
    expect(gemini.installed).toBe(true);
    expect(gemini.missingEnv).toEqual(["GEMINI_API_KEY"]);

    const claude = agents.find((a) => a.name === "claude-code")!;
    expect(claude.installed).toBe(false);
  });

  it("clears missingEnv once the variable is set", async () => {
    process.env.PATH = await fakeBinDir(["gemini"]);
    process.env.GEMINI_API_KEY = "x";
    const gemini = (await detectAgents()).find((a) => a.name === "gemini-cli")!;
    expect(gemini.missingEnv).toEqual([]);
  });
});

describe("pickDefaultAgent", () => {
  it("picks an agent that is installed and fully configured", async () => {
    process.env.PATH = await fakeBinDir(["gemini"]);
    process.env.GEMINI_API_KEY = "x";
    const { chosen } = await pickDefaultAgent();
    expect(chosen?.name).toBe("gemini-cli");
  });

  it("does not pick an installed agent whose credentials are missing", async () => {
    process.env.PATH = await fakeBinDir(["gemini"]);
    const { chosen } = await pickDefaultAgent();
    expect(chosen).toBeNull();
  });

  it("returns null when nothing is installed, rather than guessing", async () => {
    process.env.PATH = await fakeBinDir([]);
    const { chosen, all } = await pickDefaultAgent();
    expect(chosen).toBeNull();
    expect(all.length).toBeGreaterThan(0);
  });
});

describe("explainNoAgent", () => {
  it("tells the user what to install and what is missing, per agent", async () => {
    process.env.PATH = await fakeBinDir(["gemini"]);
    const { all } = await pickDefaultAgent();
    const msg = explainNoAgent(all);

    expect(msg).toMatch(/gemini-cli\s+installed, but missing GEMINI_API_KEY/);
    expect(msg).toMatch(/claude-code\s+not installed \(needs `claude` on PATH\)/);
    // The whole point of zero-config: no task authoring is implied anywhere.
    expect(msg).toMatch(/tasks and answer keys ship with claimcheck/);
  });
});
