import type { RawRecord, ScoredRecord, Task, TasksDoc } from "../types.js";

/**
 * Deliberately not an LLM-as-judge: for small task sets this is small enough
 * to also spot-check by hand. Short alphanumeric keywords match on word
 * boundaries (so "33" doesn't false-positive inside "1233"); longer or
 * punctuated keywords (an npm package name, a hyphenated directory name)
 * fall back to plain substring, since \b behaves oddly around characters
 * like "@" and "/". This is a heuristic, not proof the match is semantically
 * right -- keep spot-checking PARTIAL/FAIL results.
 */
export function keywordPresent(keyword: string, textLower: string): boolean {
  const kwLower = keyword.toLowerCase();
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
