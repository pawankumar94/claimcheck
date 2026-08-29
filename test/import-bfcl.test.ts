import { describe, expect, it } from "vitest";
import { buildPrompt, expectedFunctionNames, importBfcl, parseJsonl, type BfclEntry, type BfclGroundTruth } from "../src/core/import-bfcl.js";
import { criteriaFor, scoreOne } from "../src/core/scorer.js";

function entry(id: string, fnNames: string[], question = "do the thing"): BfclEntry {
  return {
    id,
    question: [[{ role: "user", content: question }]],
    function: fnNames.map((n) => ({ name: n, description: `does ${n}`, parameters: { type: "object" } })),
  };
}

const entries: BfclEntry[] = [
  entry("m0", ["triangle.get", "circle.get"]),
  entry("m1", ["weather.today", "weather.week"]),
  entry("m2", ["stock.price", "stock.history"]),
  entry("m3", ["math.sqrt", "math.pow"]),
];

const gts: BfclGroundTruth[] = [
  { id: "m0", ground_truth: [{ "triangle.get": { side1: [5] } }] },
  { id: "m1", ground_truth: [{ "weather.today": {} }] },
  { id: "m2", ground_truth: [{ "stock.price": {} }] },
  { id: "m3", ground_truth: [{ "math.sqrt": {} }] },
];

describe("parseJsonl", () => {
  it("parses line-delimited JSON and ignores blank lines", () => {
    expect(parseJsonl<{ a: number }>('{"a":1}\n\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe("expectedFunctionNames", () => {
  it("pulls every function named in the ground truth", () => {
    expect(expectedFunctionNames({ id: "x", ground_truth: [{ a: {} }, { b: {} }] })).toEqual(["a", "b"]);
  });
});

describe("importBfcl", () => {
  const doc = importBfcl(entries, gts, { fewDistractors: 0, manyDistractors: 5, seed: 42 });

  it("attributes the source rather than presenting the tasks as ours", () => {
    expect(doc.source?.name).toMatch(/Berkeley Function Calling/);
    expect(doc.source?.note).toMatch(/NOT comparable to BFCL leaderboard/);
  });

  it("needs no repository, since each prompt is self-contained", () => {
    expect(doc.repo_url).toBeUndefined();
    expect(doc.pinned_sha).toBeUndefined();
  });

  it("keeps the question identical across arms so only tool count differs", () => {
    for (const t of doc.tasks) {
      const few = t.prompt_by_policy!["few-tools"]!;
      const many = t.prompt_by_policy!["many-tools"]!;
      expect(few.split("User request:")[1]).toBe(many.split("User request:")[1]);
    }
  });

  it("shows more functions in the wide arm", () => {
    const t = doc.tasks[0]!;
    const count = (p: string) => p.split("\n").filter((l) => l.startsWith("- ")).length;
    expect(count(t.prompt_by_policy!["few-tools"]!)).toBe(2);
    expect(count(t.prompt_by_policy!["many-tools"]!)).toBe(7);
  });

  it("never drops the correct function from either arm", () => {
    for (const t of doc.tasks) {
      const correct = typeof t.accept![0] === "string" ? [t.accept![0] as string] : (t.accept![0] as { any_of: string[] }).any_of;
      for (const arm of Object.values(t.prompt_by_policy!)) {
        expect(correct.some((c) => arm.includes(c))).toBe(true);
      }
    }
  });

  it("never uses a correct answer as a distractor in another task", () => {
    // A distractor that is the right answer elsewhere is fine; a distractor
    // equal to THIS task's answer would make the wide arm trivially different.
    for (const t of doc.tasks) {
      const correct = typeof t.accept![0] === "string" ? (t.accept![0] as string) : "";
      const many = t.prompt_by_policy!["many-tools"]!;
      const occurrences = many.split("\n").filter((l) => l.startsWith(`- ${correct}:`)).length;
      if (correct) expect(occurrences).toBe(1);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = importBfcl(entries, gts, { fewDistractors: 0, manyDistractors: 3, seed: 7 });
    const b = importBfcl(entries, gts, { fewDistractors: 0, manyDistractors: 3, seed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("skips entries with no ground truth instead of emitting unscorable tasks", () => {
    const d = importBfcl([...entries, entry("orphan", ["x.y"])], gts, { fewDistractors: 0, manyDistractors: 1 });
    expect(d.tasks.map((t) => t.id)).not.toContain("orphan");
  });

  it("respects the limit", () => {
    expect(importBfcl(entries, gts, { fewDistractors: 0, manyDistractors: 1, limit: 2 }).tasks).toHaveLength(2);
  });

  it("produces criteria the scorer accepts for a correct answer", () => {
    const t = doc.tasks[0]!;
    const answer = 'triangle.get({"side1": 5, "side2": 4, "side3": 3})';
    expect(scoreOne(answer, criteriaFor(t)).verdict).toBe("PASS");
    expect(scoreOne("circle.get({})", criteriaFor(t)).verdict).toBe("FAIL");
  });
});

describe("buildPrompt", () => {
  it("lists every offered function and asks for the name first", () => {
    const p = buildPrompt(entries[0]!, entries[0]!.function);
    expect(p).toContain("- triangle.get");
    expect(p).toContain("- circle.get");
    expect(p).toContain("do the thing");
    expect(p).toMatch(/Start your reply with the function name/);
  });
});
