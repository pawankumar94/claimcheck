import { describe, expect, it } from "vitest";
import { buildReport } from "../src/core/reporter.js";
import type { ScoredRecord } from "../src/types.js";

const records: ScoredRecord[] = [
  {
    task_id: "t1",
    agent_name: "claude-code",
    policy_name: "full",
    trial: 0,
    prompt: "?",
    ok: true,
    latency_ms: 100,
    metrics: { result_text: "MIT", cost: 0.01, session_id: "s1" },
    score: "PASS",
    missing_keywords: [],
  },
  {
    task_id: "t1",
    agent_name: "claude-code",
    policy_name: "curated",
    trial: 0,
    prompt: "?",
    ok: true,
    latency_ms: 80,
    metrics: { result_text: "MIT", cost: 0.008, session_id: "s2" },
    score: "PASS",
    missing_keywords: [],
  },
  {
    task_id: "t2",
    agent_name: "claude-code",
    policy_name: "curated",
    trial: 0,
    prompt: "?",
    ok: false,
    latency_ms: 300000,
    error: "timeout",
    score: "ERROR",
    missing_keywords: null,
  },
];

describe("buildReport", () => {
  const report = buildReport(records);

  it("includes a per-task detail row for every record", () => {
    expect(report).toContain("| t1 | claude-code | full | PASS | 0.01 | 100 |");
    expect(report).toContain("| t1 | claude-code | curated | PASS | 0.008 | 80 |");
  });

  it("computes pass rate excluding ERROR rows from the denominator", () => {
    // curated: 1 ok record (PASS) + 1 ERROR -> pass rate should be 1/1, n=2 with 1 error excluded
    expect(report).toMatch(/claude-code \| curated \| 2 \(1 error excluded\) \| 1\/1 \(100%\)/);
  });

  it("shows 100% pass rate for the full policy with no errors", () => {
    expect(report).toMatch(/claude-code \| full \| 1 \| 1\/1 \(100%\)/);
  });

  it("includes the caveats section", () => {
    expect(report).toContain("Read this before drawing any conclusion");
    expect(report).toContain("UNVERIFIED ANSWER KEY");
    expect(report).toContain("harness failures");
  });
});
