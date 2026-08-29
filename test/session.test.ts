import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listRuns,
  loadRun,
  makeRunId,
  sessionToRecords,
  startRun,
  submitAnswers,
} from "../src/core/session.js";
import { scoreRecords } from "../src/core/scorer.js";
import type { TasksDoc } from "../src/types.js";

const tasksDoc: TasksDoc = {
  repo_url: "https://example.com/r.git",
  pinned_sha: "abc",
  tasks: [
    { id: "t1", prompt: "License?", expected_keywords: ["MIT"], verified: true },
    { id: "t2", prompt: "Precommit?", expected_keywords: ["typecheck"], verified: true },
  ],
};

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "claimcheck-home-"));
  process.env.CLAIMCHECK_HOME = home;
});

afterAll(async () => {
  delete process.env.CLAIMCHECK_HOME;
  await rm(home, { recursive: true, force: true });
});

async function newRun(label: string) {
  return startRun({
    label,
    configNote: "all MCP servers connected",
    agent: "test-agent",
    tasksPath: "/tmp/tasks.json",
    tasksDoc,
  });
}

describe("makeRunId", () => {
  it("is filesystem-safe and carries the label", () => {
    const id = makeRunId("All Tools / Broad!", new Date("2026-08-29T12:34:56Z"));
    expect(id).toMatch(/^20260829-123456-all-tools-broad$/);
  });

  it("falls back to a default slug when the label has no usable characters", () => {
    expect(makeRunId("!!!", new Date("2026-08-29T00:00:00Z"))).toMatch(/-run$/);
  });
});

describe("run lifecycle", () => {
  it("starts incomplete and completes only when every task is answered", async () => {
    const run = await newRun("broad");
    expect(run.complete).toBe(false);

    const first = await submitAnswers(run.id, [{ task_id: "t1", answer_text: "MIT" }]);
    expect(first.session.complete).toBe(false);
    expect(first.remaining).toEqual(["t2"]);

    const second = await submitAnswers(run.id, [{ task_id: "t2", answer_text: "npm run typecheck" }]);
    expect(second.session.complete).toBe(true);
    expect(second.remaining).toEqual([]);
  });

  it("replaces a re-answered task instead of duplicating it", async () => {
    const run = await newRun("broad");
    await submitAnswers(run.id, [{ task_id: "t1", answer_text: "wrong" }]);
    await submitAnswers(run.id, [{ task_id: "t1", answer_text: "MIT" }]);

    const reloaded = await loadRun(run.id);
    expect(reloaded.answers.filter((a) => a.task_id === "t1")).toHaveLength(1);
    expect(reloaded.answers[0]!.answer_text).toBe("MIT");
  });

  it("reports unknown task ids rather than silently storing them", async () => {
    const run = await newRun("broad");
    const res = await submitAnswers(run.id, [{ task_id: "nope", answer_text: "x" }]);
    expect(res.unknown).toEqual(["nope"]);
    expect(res.accepted).toEqual([]);
  });

  it("gives an actionable error for an unknown run id", async () => {
    await newRun("broad");
    await expect(loadRun("does-not-exist")).rejects.toThrow(/No run with id/);
  });

  it("persists runs across loads and lists them newest first", async () => {
    await startRun({ ...{ label: "older", configNote: "x".repeat(10), agent: "a", tasksPath: "/t", tasksDoc }, now: new Date("2026-01-01T00:00:00Z") });
    await startRun({ ...{ label: "newer", configNote: "x".repeat(10), agent: "a", tasksPath: "/t", tasksDoc }, now: new Date("2026-06-01T00:00:00Z") });
    const runs = await listRuns();
    expect(runs.map((r) => r.label)).toEqual(["newer", "older"]);
  });
});

describe("sessionToRecords", () => {
  it("projects answers into records the existing scorer accepts", async () => {
    const run = await newRun("read-only");
    await submitAnswers(run.id, [
      { task_id: "t1", answer_text: "This uses the MIT license." },
      { task_id: "t2", answer_text: "It runs the linter." },
    ]);

    const scored = scoreRecords(sessionToRecords(await loadRun(run.id)), tasksDoc);
    expect(scored).toHaveLength(2);
    // The label becomes the policy, so in-agent runs flow through the same analysis.
    expect(scored.every((r) => r.policy_name === "read-only")).toBe(true);
    expect(scored.find((r) => r.task_id === "t1")!.score).toBe("PASS");
    expect(scored.find((r) => r.task_id === "t2")!.score).toBe("FAIL");
  });
});
