import { readFile } from "node:fs/promises";
import type { AcceptanceCriterion, Task, TasksDoc } from "../types.js";

/**
 * Imports the Berkeley Function Calling Leaderboard (BFCL) into a diedinchat
 * task set.
 *
 * Why BFCL specifically: claim 001 is about how many tools an agent sees, and
 * BFCL is the public benchmark built around exactly that -- each entry pairs a
 * user request with a set of candidate function specifications and a ground
 * truth call. Using it means the questions and the correct answers come from
 * someone else, which removes the obvious objection to a self-authored corpus.
 *
 * The contrast is constructed by holding the question and its correct answer
 * fixed while varying only how many *irrelevant* functions are shown alongside
 * the right one. Distractors are drawn from other entries in the same file, so
 * they are real function specs rather than synthetic filler, and any distractor
 * sharing a name with a correct answer is skipped so the contrast can never
 * make a task unanswerable.
 */

export interface BfclEntry {
  id: string;
  question: Array<Array<{ role: string; content: string }>>;
  function: Array<{ name: string; description?: string; parameters?: unknown }>;
}

export interface BfclGroundTruth {
  id: string;
  ground_truth: Array<Record<string, unknown>>;
}

export function parseJsonl<T>(text: string): T[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

/** The function names BFCL considers correct for an entry. */
export function expectedFunctionNames(gt: BfclGroundTruth): string[] {
  return gt.ground_truth.flatMap((call) => Object.keys(call));
}

function renderFunction(fn: BfclEntry["function"][number]): string {
  const params = fn.parameters ? JSON.stringify(fn.parameters) : "{}";
  return `- ${fn.name}: ${fn.description ?? "(no description)"}\n  parameters: ${params}`;
}

function userQuestion(entry: BfclEntry): string {
  const turns = entry.question.flat();
  return turns
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join("\n");
}

export function buildPrompt(entry: BfclEntry, functions: BfclEntry["function"]): string {
  return [
    "You have access to the following functions:",
    "",
    ...functions.map(renderFunction),
    "",
    `User request: ${userQuestion(entry)}`,
    "",
    "Reply with the single function you would call and its arguments. " +
      "Start your reply with the function name exactly as written above. " +
      "Do not call any tool; just state the function name and arguments.",
  ].join("\n");
}

export interface ImportOptions {
  /**
   * When true, acceptance also requires each REQUIRED argument value to appear
   * in the answer, not just the function name. BFCL's own evaluation checks
   * arguments, so name-only scoring measures something easier than the
   * benchmark does and saturates: frontier models hit 100% on the `multiple`
   * category by name alone, leaving no headroom to detect anything.
   *
   * The rule is mechanical, taken from BFCL's ground-truth format: a parameter
   * whose accepted-value list contains "" is optional and is skipped; every
   * other parameter must have one of its accepted values present. Nothing is
   * hand-tuned per task.
   */
  strictArgs?: boolean;
  /** Distractors shown in the narrow arm. */
  fewDistractors: number;
  /** Distractors shown in the wide arm -- this is the variable under test. */
  manyDistractors: number;
  /** Cap on how many entries to import. */
  limit?: number;
  fewLabel?: string;
  manyLabel?: string;
  /** Seed so the distractor sample is identical across runs. */
  seed?: number;
}

/** Deterministic PRNG: the same import must reproduce byte-identically. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample<T>(pool: T[], n: number, rand: () => number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]!);
  }
  return out;
}

export function importBfcl(
  entries: BfclEntry[],
  groundTruths: BfclGroundTruth[],
  opts: ImportOptions
): TasksDoc {
  const gtById = new Map(groundTruths.map((g) => [g.id, g]));
  const rand = mulberry32(opts.seed ?? 1);
  const fewLabel = opts.fewLabel ?? "few-tools";
  const manyLabel = opts.manyLabel ?? "many-tools";

  const usable = entries.filter((e) => gtById.has(e.id));
  const selected = usable.slice(0, opts.limit ?? usable.length);

  // Every function spec in the file is a candidate distractor.
  const allFunctions = entries.flatMap((e) => e.function);

  const tasks: Task[] = selected.map((entry) => {
    const gt = gtById.get(entry.id)!;
    const correctNames = new Set(expectedFunctionNames(gt));
    const ownNames = new Set(entry.function.map((f) => f.name));

    // A distractor must not be a correct answer and must not duplicate a
    // function the entry already offers, or the wide arm could accidentally
    // change what the right answer is.
    const distractorPool = allFunctions.filter((f) => !correctNames.has(f.name) && !ownNames.has(f.name));

    const few = sample(distractorPool, opts.fewDistractors, rand);
    const many = sample(distractorPool, opts.manyDistractors, rand);

    const shuffle = (fns: BfclEntry["function"]) => sample(fns, fns.length, rand);

    const accept: AcceptanceCriterion[] = [
      correctNames.size === 1
        ? [...correctNames][0]!
        : { any_of: [...correctNames], label: `one of ${[...correctNames].join(" | ")}` },
    ];

    if (opts.strictArgs) {
      for (const call of gt.ground_truth) {
        for (const [fnName, params] of Object.entries(call)) {
          for (const [param, accepted] of Object.entries(params as Record<string, unknown[]>)) {
            if (!Array.isArray(accepted) || accepted.includes("")) continue; // optional
            // An accepted value may itself be an array (an argument that takes
            // a list). Those need every element present, not a comma-joined
            // stringification, which is what String([a,b]) would produce.
            const alternatives: Array<string | { all_of: string[] }> = [];
            for (const v of accepted) {
              if (v === null || v === undefined) continue;
              if (Array.isArray(v)) {
                const parts = v.map((x) => String(x)).filter((x) => x.length > 0);
                if (parts.length > 0) alternatives.push({ all_of: parts });
                continue;
              }
              const str = String(v);
              if (str.length === 0) continue;
              alternatives.push(str);
              // Models format arguments inconsistently ("3x + 2" vs "3x+2"),
              // so accept the space-free spelling of the same value too.
              const tight = str.replace(/\s+/g, "");
              if (tight !== str && tight.length > 0) alternatives.push(tight);
            }
            if (alternatives.length === 0) continue;
            accept.push({ any_of: alternatives, label: `${fnName}.${param}` });
          }
        }
      }
    }

    return {
      id: entry.id,
      prompt: buildPrompt(entry, entry.function),
      prompt_by_policy: {
        [fewLabel]: buildPrompt(entry, shuffle([...entry.function, ...few])),
        [manyLabel]: buildPrompt(entry, shuffle([...entry.function, ...many])),
      },
      accept,
      verified: true,
      note:
        `Imported from BFCL entry ${entry.id}. Correct function(s): ${[...correctNames].join(", ")}. ` +
        `Question and ground truth are BFCL's, not authored here. The two arms show the same ` +
        `${entry.function.length} original candidate(s) plus ${opts.fewDistractors} vs ` +
        `${opts.manyDistractors} irrelevant distractors, so only tool count differs.` +
        (opts.strictArgs ? ` Acceptance requires the required argument values too, matching what BFCL itself checks.` : ""),
    };
  });

  return {
    source: {
      name: "Berkeley Function Calling Leaderboard (BFCL)",
      url: "https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard",
      license: "Apache-2.0",
      note:
        `Questions and ground-truth calls are BFCL's. diedinchat adds only the distractor contrast ` +
        `(${opts.fewDistractors} vs ${opts.manyDistractors} irrelevant functions) and scores by whether ` +
        (opts.strictArgs
          ? `the correct function name and every required argument value appear in the answer. That is closer to `
          : `the correct function name appears in the answer -- a weaker check than `) +
        `BFCL's own AST match, but still not identical to it (values are matched as substrings, not parsed), ` +
        `so these numbers are NOT comparable to BFCL leaderboard scores.`,
    },
    note:
      `Self-contained task set: no repository is cloned, since each prompt carries its own function specs.`,
    tasks,
  };
}

export async function importBfclFromFiles(
  entriesPath: string,
  groundTruthPath: string,
  opts: ImportOptions
): Promise<TasksDoc> {
  const [entriesRaw, gtRaw] = await Promise.all([
    readFile(entriesPath, "utf-8"),
    readFile(groundTruthPath, "utf-8"),
  ]);
  return importBfcl(parseJsonl<BfclEntry>(entriesRaw), parseJsonl<BfclGroundTruth>(gtRaw), opts);
}
