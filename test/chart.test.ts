import { describe, expect, it } from "vitest";
import { buildCharts } from "../src/core/chart.js";
import { analyze } from "../src/core/analysis.js";
import type { ScoredRecord } from "../src/types.js";

function rec(policy: string, taskId: string, score: string): ScoredRecord {
  return {
    task_id: taskId,
    agent_name: "agent-a",
    policy_name: policy,
    trial: 0,
    prompt: "?",
    ok: true,
    latency_ms: 100,
    metrics: { result_text: "a sufficiently long answer text", cost: null, session_id: null },
    score,
    missing_keywords: [],
  };
}

const records: ScoredRecord[] = [
  ...["t1", "t2", "t3"].map((t) => rec("curated", t, "PASS")),
  rec("curated", "t4", "FAIL"),
  ...["t1", "t2"].map((t) => rec("full", t, "PASS")),
  ...["t3", "t4"].map((t) => rec("full", t, "FAIL")),
];

describe("buildCharts", () => {
  const [charts] = buildCharts(records);

  it("produces well-formed standalone SVG for both charts", () => {
    for (const svg of [charts!.passRate, charts!.perTask]) {
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      // GitHub strips <style> from embedded SVG, so styling must be attributes.
      expect(svg).not.toContain("<style");
    }
  });

  it("carries an accessible label rather than an unlabelled graphic", () => {
    expect(charts!.passRate).toContain('role="img"');
    expect(charts!.passRate).toContain("aria-label=");
  });

  it("draws the zero line, so an indistinguishable result cannot be misread as a win", () => {
    expect(charts!.passRate).toContain("no difference");
    expect(charts!.passRate).toMatch(/not distinguishable|excludes zero/);
  });

  it("labels both policies and every task", () => {
    expect(charts!.passRate).toContain("curated");
    expect(charts!.passRate).toContain("full");
    for (const t of ["t1", "t2", "t3", "t4"]) expect(charts!.perTask).toContain(t);
  });

  it("keeps all geometry inside the declared viewBox", () => {
    for (const svg of [charts!.passRate, charts!.perTask]) {
      const [, , vbW, vbH] = svg.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/)!.slice(1).map(Number) as number[];
      const xs = [...svg.matchAll(/(?:x|cx|x1|x2)="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      const ys = [...svg.matchAll(/(?:y|cy|y1|y2)="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(vbW!);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ys)).toBeLessThanOrEqual(vbH!);
    }
  });

  it("escapes markup in labels instead of emitting broken XML", () => {
    const nasty = records.map((r) => ({ ...r, policy_name: r.policy_name === "curated" ? "a<b>&c" : r.policy_name }));
    const [c] = buildCharts(nasty, { candidatePolicy: "a<b>&c", baselinePolicy: "full" });
    expect(c!.passRate).toContain("a&lt;b&gt;&amp;c");
    expect(c!.passRate).not.toContain("<b>");
  });

  it("returns nothing to chart when there is no valid comparison", () => {
    const onePolicy = records.filter((r) => r.policy_name === "curated");
    expect(analyze(onePolicy).comparisons).toHaveLength(0);
    expect(buildCharts(onePolicy)).toEqual([]);
  });
});
