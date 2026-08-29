import { describe, expect, it } from "vitest";
import { analyze, differenceInterval, summarizeConditions } from "../src/core/analysis.js";
import type { ScoredRecord } from "../src/types.js";

function rec(
  policy: string,
  score: string,
  overrides: Partial<ScoredRecord> = {}
): ScoredRecord {
  return {
    task_id: overrides.task_id ?? "t1",
    agent_name: overrides.agent_name ?? "agent-a",
    policy_name: policy,
    trial: 0,
    prompt: "?",
    ok: score !== "ERROR",
    latency_ms: 100,
    metrics: score === "ERROR" ? undefined : { result_text: "x", cost: 0.01, session_id: "s" },
    score,
    missing_keywords: [],
    ...overrides,
  };
}

function many(policy: string, passes: number, fails: number): ScoredRecord[] {
  return [
    ...Array.from({ length: passes }, (_, i) => rec(policy, "PASS", { task_id: `p${i}` })),
    ...Array.from({ length: fails }, (_, i) => rec(policy, "FAIL", { task_id: `f${i}` })),
  ];
}

describe("differenceInterval", () => {
  it("reports the raw difference in percentage points", () => {
    const { delta } = differenceInterval(8, 10, 5, 10);
    expect(delta).toBeCloseTo(30, 5);
  });

  it("produces an interval spanning zero when the arms are identical", () => {
    const { ci95 } = differenceInterval(5, 10, 5, 10);
    expect(ci95[0]).toBeLessThan(0);
    expect(ci95[1]).toBeGreaterThan(0);
  });

  it("narrows the interval as sample size grows", () => {
    const small = differenceInterval(8, 10, 5, 10);
    const large = differenceInterval(800, 1000, 500, 1000);
    const widthSmall = small.ci95[1] - small.ci95[0];
    const widthLarge = large.ci95[1] - large.ci95[0];
    expect(widthLarge).toBeLessThan(widthSmall);
  });

  it("stays finite at the boundaries where a Wald interval would collapse", () => {
    const { ci95 } = differenceInterval(10, 10, 10, 10);
    expect(Number.isFinite(ci95[0])).toBe(true);
    expect(Number.isFinite(ci95[1])).toBe(true);
    // Two perfect arms must not read as a real difference.
    expect(ci95[0]).toBeLessThanOrEqual(0);
    expect(ci95[1]).toBeGreaterThanOrEqual(0);
  });
});

describe("summarizeConditions", () => {
  it("excludes ERROR rows from n and pass rate", () => {
    const records = [...many("curated", 3, 1), rec("curated", "ERROR")];
    const [stats] = summarizeConditions(records);
    expect(stats!.n).toBe(4);
    expect(stats!.passes).toBe(3);
    expect(stats!.passRate).toBe(75);
    expect(stats!.errors).toBe(1);
  });
});

describe("analyze", () => {
  it("declines to call a small difference distinguishable", () => {
    const records = [...many("curated", 7, 3), ...many("full", 6, 4)];
    const { comparisons } = analyze(records);
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]!.distinguishable).toBe(false);
    expect(comparisons[0]!.verdict).toMatch(/[Nn]ot distinguishable/);
  });

  it("detects a large, well-powered difference", () => {
    const records = [...many("curated", 95, 5), ...many("full", 40, 60)];
    const { comparisons } = analyze(records);
    expect(comparisons[0]!.distinguishable).toBe(true);
    expect(comparisons[0]!.deltaPoints).toBeGreaterThan(0);
    expect(comparisons[0]!.verdict).toMatch(/outperformed/);
  });

  it("names a result that contradicts the claim rather than softening it", () => {
    const records = [...many("curated", 40, 60), ...many("full", 95, 5)];
    const { comparisons } = analyze(records);
    expect(comparisons[0]!.deltaPoints).toBeLessThan(0);
    expect(comparisons[0]!.verdict).toMatch(/evidence against the claim/);
  });

  it("warns about small samples so 'not distinguishable' is not read as 'equivalent'", () => {
    const { warnings } = analyze([...many("curated", 2, 1), ...many("full", 2, 1)]);
    expect(warnings.join(" ")).toMatch(/underpowered, not equivalent/);
  });

  it("warns when harness errors were excluded", () => {
    const records = [...many("curated", 3, 1), rec("curated", "ERROR"), ...many("full", 3, 1)];
    expect(analyze(records).warnings.join(" ")).toMatch(/failed at the harness level/);
  });

  it("warns when any answer key was never verified", () => {
    const records = [
      ...many("curated", 3, 1),
      rec("curated", "PASS (UNVERIFIED ANSWER KEY -- not checked)"),
      ...many("full", 3, 1),
    ];
    expect(analyze(records).warnings.join(" ")).toMatch(/never confirmed against the source/);
  });

  it("does not compare across agents, where prompt interpretation confounds policy", () => {
    const records = [
      ...many("curated", 5, 0).map((r) => ({ ...r, agent_name: "agent-a" })),
      ...many("full", 0, 5).map((r) => ({ ...r, agent_name: "agent-b" })),
    ];
    // Each agent has only one policy, so there is nothing legitimate to compare.
    expect(analyze(records).comparisons).toHaveLength(0);
  });
});

describe("data-quality signals", () => {
  it("flags near-empty answers without changing their score", () => {
    const records: ScoredRecord[] = [
      ...many("curated", 3, 0),
      rec("curated", "FAIL", {
        task_id: "t-degenerate",
        metrics: { result_text: "}", cost: null, session_id: null },
      }),
      ...many("full", 3, 1),
    ];
    const { warnings, stats } = analyze(records);
    expect(warnings.join(" ")).toMatch(/under 20 characters/);
    // The degenerate row is still counted as a failure -- flagged, not rescored.
    const curated = stats.find((s) => s.policy === "curated")!;
    expect(curated.n).toBe(4);
    expect(curated.passes).toBe(3);
  });
});

describe("policy selection", () => {
  it("compares the two arms present when they are not named curated/full", () => {
    const records = [...many("few-tools", 8, 2), ...many("many-tools", 5, 5)];
    const { comparisons } = analyze(records);
    expect(comparisons).toHaveLength(1);
    expect(new Set([comparisons[0]!.baseline.policy, comparisons[0]!.candidate.policy])).toEqual(
      new Set(["few-tools", "many-tools"])
    );
  });

  it("honours explicit baseline/candidate names", () => {
    const records = [...many("before", 8, 2), ...many("after", 5, 5)];
    const { comparisons } = analyze(records, { baselinePolicy: "before", candidatePolicy: "after" });
    expect(comparisons[0]!.baseline.policy).toBe("before");
    expect(comparisons[0]!.candidate.policy).toBe("after");
  });

  it("refuses to guess with three arms, and says so", () => {
    const records = [...many("a", 3, 1), ...many("b", 3, 1), ...many("c", 3, 1)];
    const { comparisons, warnings } = analyze(records);
    expect(comparisons).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/Name them explicitly/);
  });

  it("still prefers curated/full when both are present", () => {
    const records = [...many("curated", 8, 2), ...many("full", 5, 5), ...many("other", 1, 1)];
    const { comparisons } = analyze(records);
    expect(comparisons[0]!.candidate.policy).toBe("curated");
    expect(comparisons[0]!.baseline.policy).toBe("full");
  });
});
