import type {
  AcceptanceCriterion,
  HonorSpec,
  RawRecord,
  ScoredRecord,
  Task,
  TasksDoc,
} from "../types.js";

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

/** Human-readable name for a criterion, used to report what was missing. */
export function describeCriterion(c: AcceptanceCriterion): string {
  if (typeof c === "string") return c;
  if (c.label) return c.label;
  if ("any_of" in c)
    return `any of [${c.any_of.map((a) => (typeof a === "string" ? a : a.all_of.join(" + "))).join(" | ")}]`;
  if ("all_of" in c) return `all of [${c.all_of.join(" + ")}]`;
  return `/${c.regex}/`;
}

export function criterionSatisfied(c: AcceptanceCriterion, textLower: string): boolean {
  if (typeof c === "string") return keywordPresent(c, textLower);
  if ("any_of" in c)
    return c.any_of.some((alt) =>
      typeof alt === "string"
        ? keywordPresent(alt, textLower)
        : alt.all_of.every((k) => keywordPresent(k, textLower))
    );
  if ("all_of" in c) return c.all_of.every((k) => keywordPresent(k, textLower));
  try {
    return new RegExp(c.regex, c.flags ?? "i").test(textLower);
  } catch {
    // A malformed pattern must not silently pass; surface it as unmet.
    return false;
  }
}

/** Criteria for a task: `accept` when present, else the legacy keyword list. */
export function criteriaFor(task: Task): AcceptanceCriterion[] {
  if (task.accept && task.accept.length > 0) return task.accept;
  return task.expected_keywords ?? [];
}

export function scoreOne(
  resultText: string,
  criteria: AcceptanceCriterion[]
): { verdict: "PASS" | "PARTIAL" | "FAIL"; missing: string[] } {
  const textLower = resultText.toLowerCase();
  const missing = criteria.filter((c) => !criterionSatisfied(c, textLower)).map(describeCriterion);
  if (criteria.length === 0) return { verdict: "FAIL", missing: ["(task declares no acceptance criteria)"] };
  if (missing.length === 0) return { verdict: "PASS", missing: [] };
  if (missing.length < criteria.length) return { verdict: "PARTIAL", missing };
  return { verdict: "FAIL", missing };
}


/**
 * The single definition of "the agent got it right", used by the reporter,
 * the charts, and the interval math. Honor tasks report HONORED/VIOLATED
 * rather than PASS/FAIL, and every consumer that counted only `PASS` would
 * have silently reported a 0% honor rate.
 *
 * The prefix match is deliberate: an unverified answer key appends a suffix
 * ("PASS (UNVERIFIED ANSWER KEY -- ...)") and still counts, because the
 * reporter flags that caveat separately rather than by zeroing the row.
 */
export function isPass(score: string): boolean {
  return score.startsWith("PASS") || score.startsWith("HONORED");
}

/**
 * Scores whether a pinned constraint was obeyed, against what the agent wrote
 * to the files rather than what it said about them. An agent that explains the
 * rule in prose and then violates it in code is VIOLATED, which is the whole
 * reason honor is not scored on `result_text`.
 *
 * VIOLATED beats missing-requirement: if a forbidden pattern is present, that
 * is the finding, and listing an unmet `require` alongside it would double-count
 * one failure.
 */
export function scoreHonor(
  workspaceText: string,
  honor: HonorSpec
): { verdict: "HONORED" | "VIOLATED"; missing: string[] } {
  const textLower = workspaceText.toLowerCase();

  const violated = (honor.forbid ?? []).filter((c) => criterionSatisfied(c, textLower));
  if (violated.length > 0) {
    return { verdict: "VIOLATED", missing: violated.map((c) => `forbidden: ${describeCriterion(c)}`) };
  }

  const unmet = (honor.require ?? []).filter((c) => !criterionSatisfied(c, textLower));
  if (unmet.length > 0) {
    return { verdict: "VIOLATED", missing: unmet.map((c) => `required: ${describeCriterion(c)}`) };
  }

  if ((honor.forbid ?? []).length === 0 && (honor.require ?? []).length === 0) {
    return { verdict: "VIOLATED", missing: ["(task declares an empty honor spec)"] };
  }

  return { verdict: "HONORED", missing: [] };
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

    // An honor task is asking a different question -- did the agent obey a
    // constraint it was never told -- so it is scored on the files it left
    // behind, not on its prose.
    const { verdict, missing } = task.honor
      ? scoreHonor(rec.metrics?.workspace_text ?? "", task.honor)
      : scoreOne(rec.metrics?.result_text ?? "", criteriaFor(task));
    const finalVerdict = task.verified
      ? verdict
      : `${verdict} (UNVERIFIED ANSWER KEY -- ${task.note ?? ""})`;

    scored.push({ ...rec, score: finalVerdict, missing_keywords: missing });
  }

  return scored;
}
