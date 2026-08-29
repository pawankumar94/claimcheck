import { describe, expect, it } from "vitest";
import { criteriaFor, keywordPresent, scoreOne, scoreRecords } from "../src/core/scorer.js";
import type { RawRecord, TasksDoc } from "../src/types.js";

describe("keywordPresent", () => {
  it("matches short numeric keywords only on word boundaries", () => {
    expect(keywordPresent("33", "the p@1 improved by 33 to 83 points")).toBe(true);
    expect(keywordPresent("33", "it went from 1233 to 3383")).toBe(false);
  });

  it("falls back to substring for punctuated keywords", () => {
    expect(keywordPresent("@huggingface/transformers", "requires @huggingface/transformers as an opt-in dep")).toBe(true);
    expect(keywordPresent("stuffed-index", "see examples/stuffed-index/ for the adversarial case")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(keywordPresent("MIT", "this project uses the mit license")).toBe(true);
  });

  describe("explicit stem matching with a trailing *", () => {
    it("matches any inflection of the stem", () => {
      const text = "that release carries real transitive advisories";
      expect(keywordPresent("advisor*", text)).toBe(true);
      expect(keywordPresent("advisor*", "a security advisory was filed")).toBe(true);
      expect(keywordPresent("advisor*", "ask your advisor")).toBe(true);
    });

    it("still anchors on a word boundary, so it does not match mid-word", () => {
      expect(keywordPresent("advisor*", "the subadvisory board")).toBe(false);
    });

    it("does not match when the stem is absent", () => {
      expect(keywordPresent("advisor*", "no such word here")).toBe(false);
    });

    it("supports punctuated stems", () => {
      expect(keywordPresent("@huggingface/transformer*", "install @huggingface/transformers")).toBe(true);
    });

    it("treats a bare * as a literal, not a stem", () => {
      expect(keywordPresent("*", "no asterisk in this text")).toBe(false);
      expect(keywordPresent("*", "a literal * character")).toBe(true);
    });
  });
});

describe("scoreOne", () => {
  it("PASSes when every keyword is present", () => {
    const { verdict, missing } = scoreOne("MIT license", ["MIT"]);
    expect(verdict).toBe("PASS");
    expect(missing).toEqual([]);
  });

  it("PARTIALs when some but not all keywords are present", () => {
    const { verdict, missing } = scoreOne("it improved P@1 by 33 points", ["33", "83", "not"]);
    expect(verdict).toBe("PARTIAL");
    expect(missing).toEqual(["83", "not"]);
  });

  it("FAILs when no keywords are present", () => {
    const { verdict, missing } = scoreOne("I could not find that information", ["stuffed-index"]);
    expect(verdict).toBe("FAIL");
    expect(missing).toEqual(["stuffed-index"]);
  });
});

describe("scoreRecords", () => {
  const tasksDoc: TasksDoc = {
    repo_url: "https://example.com/repo.git",
    pinned_sha: "abc123",
    tasks: [
      { id: "t1", prompt: "?", expected_keywords: ["MIT"], verified: true },
      { id: "t2", prompt: "?", expected_keywords: ["rejected"], verified: false, note: "not confirmed against source" },
    ],
  };

  it("scores ERROR records without touching keywords", () => {
    const records: RawRecord[] = [
      { task_id: "t1", agent_name: "a", policy_name: "p", trial: 0, prompt: "?", ok: false, latency_ms: 100, error: "timeout" },
    ];
    const scored = scoreRecords(records, tasksDoc);
    expect(scored[0]!.score).toBe("ERROR");
    expect(scored[0]!.missing_keywords).toBeNull();
  });

  it("tags unverified answer keys in the verdict", () => {
    const records: RawRecord[] = [
      {
        task_id: "t2",
        agent_name: "a",
        policy_name: "p",
        trial: 0,
        prompt: "?",
        ok: true,
        latency_ms: 100,
        metrics: { result_text: "covers what gets rejected", cost: 0.01, session_id: "s1" },
      },
    ];
    const scored = scoreRecords(records, tasksDoc);
    expect(scored[0]!.score).toContain("PASS");
    expect(scored[0]!.score).toContain("UNVERIFIED ANSWER KEY");
  });

  it("skips records whose task_id isn't in the tasks doc", () => {
    const records: RawRecord[] = [
      { task_id: "unknown", agent_name: "a", policy_name: "p", trial: 0, prompt: "?", ok: true, latency_ms: 1 },
    ];
    expect(scoreRecords(records, tasksDoc)).toEqual([]);
  });
});

describe("acceptance criteria (v2)", () => {
  const answer =
    "No, this repository does not currently ship an MCP server. It is planned for Phase 5, gated on Phase 4.";

  it("any_of accepts a correct paraphrase that a literal keyword rejects", () => {
    // The exact failure both the Gemini and Codex runs hit independently.
    expect(scoreOne(answer, ["not started"]).verdict).toBe("FAIL");
    expect(
      scoreOne(answer, [{ any_of: ["not started", "does not currently ship", "no MCP server"] }, "Phase 4"])
        .verdict
    ).toBe("PASS");
  });

  it("any_of still fails when no alternative appears", () => {
    expect(scoreOne("Completely unrelated.", [{ any_of: ["alpha", "beta"] }]).verdict).toBe("FAIL");
  });

  it("all_of requires every member", () => {
    expect(scoreOne("only alpha here", [{ all_of: ["alpha", "beta"] }]).verdict).toBe("FAIL");
    expect(scoreOne("alpha and beta", [{ all_of: ["alpha", "beta"] }]).verdict).toBe("PASS");
  });

  it("regex criteria match case-insensitively by default", () => {
    expect(scoreOne("improved by 33 to 83 points", [{ regex: "33\\s*(to|-|–)\\s*83" }]).verdict).toBe("PASS");
  });

  it("treats a malformed regex as unmet rather than silently passing", () => {
    const res = scoreOne("anything", [{ regex: "([unclosed" }]);
    expect(res.verdict).toBe("FAIL");
  });

  it("reports a readable label for what was missing", () => {
    const res = scoreOne("nothing relevant", [{ any_of: ["x", "y"], label: "MCP status" }]);
    expect(res.missing).toEqual(["MCP status"]);
  });

  it("fails loudly when a task declares no criteria at all", () => {
    expect(scoreOne("anything", []).verdict).toBe("FAIL");
  });

  it("criteriaFor prefers accept but falls back to legacy keywords", () => {
    expect(criteriaFor({ id: "a", prompt: "?", expected_keywords: ["k"], verified: true })).toEqual(["k"]);
    expect(
      criteriaFor({ id: "a", prompt: "?", expected_keywords: ["k"], accept: [{ any_of: ["x"] }], verified: true })
    ).toEqual([{ any_of: ["x"] }]);
  });
});
