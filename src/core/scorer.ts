import type { RawRecord, ScoredRecord, Task, TasksDoc } from "../types.js";

/**
 * Deliberately not an LLM-as-judge: for small task sets this is small enough
 * to also spot-check by hand. Matching rules, in order:
 *
 *   "advisor*"  -> explicit stem match: matches "advisor", "advisory",
 *                  "advisories". Use this when any inflection of a word is an
 *                  acceptable answer.
 *   "33"        -> bare alphanumeric keywords match on word boundaries, so
 *                  "33" doesn't false-positive inside "1233".
 *   "@scope/pkg" -> keywords containing punctuation fall back to plain
 *                  substring, since \b behaves oddly around "@" and "/".
 *
 * The stem form exists because word-boundary matching silently breaks answer
 * keys that meant to match a word family: "advisor" does NOT match
 * "advisories" under \b, which reads as a wrong answer rather than as a
 * too-strict key. Say "advisor*" when that's what you mean.
 *
 * This is a heuristic, not proof the match is semantically right -- keep
 * spot-checking PARTIAL/FAIL results.
 */
export function keywordPresent(keyword: string, textLower: string): boolean {
  const kwLower = keyword.toLowerCase();

  if (kwLower.endsWith("*") && kwLower.length > 1) {
    const stem = kwLower.slice(0, -1);
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Anchor the start on a word boundary only when the stem starts with a
    // word character, so punctuated stems ("@scope/pkg*") still work.
    const prefix = /^[a-z0-9]/.test(stem) ? "\\b" : "";
    return new RegExp(`${prefix}${escaped}`).test(textLower);
  }

  if (/^[a-z0-9]+$/.test(kwLower)) {
    const escaped = kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(textLower);
  }

  return textLower.includes(kwLower);
}

export function scoreOne(
  resultText: string,
  expectedKeywords: string[]
): { verdict: "PASS" | "PARTIAL" | "FAIL"; missing: string[] } {
  const textLower = resultText.toLowerCase();
  const missing = expectedKeywords.filter((kw) => !keywordPresent(kw, textLower));
  if (missing.length === 0) return { verdict: "PASS", missing: [] };
  if (missing.length < expectedKeywords.length) return { verdict: "PARTIAL", missing };
  return { verdict: "FAIL", missing };
}

export function scoreRecords(records: RawRecord[], tasksDoc: TasksDoc): ScoredRecord[] {
  const answerKeys = new Map<string, Task>(tasksDoc.tasks.map((t) => [t.id, t]));
  const scored: ScoredRecord[] = [];

  for (const rec of records) {
    const task = answerKeys.get(rec.task_id);
    if (!task) {
      // eslint-disable-next-line no-console
      console.warn(`WARNING: ${rec.task_id} not found in tasks doc, skipping`);
      continue;
    }

    if (!rec.ok) {
      scored.push({ ...rec, score: "ERROR", missing_keywords: null });
      continue;
    }

    const resultText = rec.metrics?.result_text ?? "";
    const { verdict, missing } = scoreOne(resultText, task.expected_keywords);
    const finalVerdict = task.verified
      ? verdict
      : `${verdict} (UNVERIFIED ANSWER KEY -- ${task.note ?? ""})`;

    scored.push({ ...rec, score: finalVerdict, missing_keywords: missing });
  }

  return scored;
}
