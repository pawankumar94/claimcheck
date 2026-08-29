import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvaluation } from "../src/core/runner.js";
import type { AgentProfile, TasksDoc } from "../src/types.js";

const execFileAsync = promisify(execFile);

describe("runEvaluation (end to end, no network)", () => {
  let localRepo: string;
  let workDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "diedinchat-test-"));
    localRepo = join(workDir, "fixture-repo");
    await execFileAsync("git", ["init", "--quiet", localRepo]);
    await writeFile(join(localRepo, "LICENSE"), "MIT License\n");
    await execFileAsync("git", ["-c", "user.email=t@t.com", "-c", "user.name=t", "add", "."], { cwd: localRepo });
    await execFileAsync("git", ["-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "init"], {
      cwd: localRepo,
    });
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("runs every task x agent x policy x trial and writes raw records", async () => {
    const { stdout: sha } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: localRepo });

    const tasksDoc: TasksDoc = {
      repo_url: localRepo,
      pinned_sha: sha.trim(),
      tasks: [{ id: "t1-license", prompt: "what license?", expected_keywords: ["MIT"], verified: true }],
    };

    // Reads the LICENSE file it was checked out with, so a real (fake) "agent" behavior is exercised end to end.
    const script = `
      const fs = require("fs");
      const license = fs.readFileSync("LICENSE", "utf-8");
      console.log(JSON.stringify({ result: license.includes("MIT") ? "This repo uses the MIT license." : "unknown" }));
    `;
    const agent: AgentProfile = {
      name: "fixture-agent",
      command: process.execPath,
      baseArgs: ["-e", script],
      policyArgs: { curated: [], full: [] },
      output: { type: "json", resultField: "result" },
    };

    const outDir = join(workDir, "raw");
    const records = await runEvaluation({
      tasksDoc,
      agents: [agent],
      policyNames: ["curated", "full"],
      outDir,
      trials: 2,
    });

    expect(records).toHaveLength(4); // 1 task x 2 policies x 2 trials
    expect(records.every((r) => r.ok)).toBe(true);
    expect(records.every((r) => r.metrics?.result_text.includes("MIT"))).toBe(true);
    expect(new Set(records.map((r) => r.policy_name))).toEqual(new Set(["curated", "full"]));
  }, 20000);
});
