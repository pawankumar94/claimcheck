import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { statusClaims, ticketCoversPath, type ClaimEvaluation } from "./claims.js";

const execFileAsync = promisify(execFile);

export interface ReviewedClaim {
  evaluation: ClaimEvaluation;
  /** Which of the changed files this claim covers. */
  touched: string[];
}

export interface Review {
  base: string;
  changedFiles: string[];
  claims: ReviewedClaim[];
  contradicted: number;
}

/**
 * Files changed against a base ref, including uncommitted work.
 *
 * Three-dot diff on purpose: a PR should be judged against where it branched,
 * not against whatever has since landed on the base branch. Otherwise someone
 * else's commits show up as yours.
 */
async function changedFiles(root: string, base: string): Promise<string[]> {
  const out = new Set<string>();
  const collect = async (args: string[]) => {
    try {
      const { stdout } = await execFileAsync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
      for (const line of stdout.split("\n")) if (line.trim()) out.add(line.trim());
    } catch {
      // A missing base ref is reported by resolveBase; nothing to add here.
    }
  };
  await collect(["diff", "--name-only", `${base}...HEAD`]);
  await collect(["diff", "--name-only", "HEAD"]);          // unstaged
  await collect(["diff", "--name-only", "--cached"]);       // staged
  // Untracked files matter most: the canonical failure is an agent *adding* a
  // handler that breaks a rule, and `git diff` never sees a new file.
  await collect(["ls-files", "--others", "--exclude-standard"]);
  return [...out].sort();
}

/** The ref a change should be measured against, preferring an actual merge base. */
export async function resolveBase(root: string, requested?: string): Promise<string> {
  if (requested) return requested;
  for (const candidate of ["origin/HEAD", "origin/main", "main", "origin/master", "master"]) {
    try {
      const { stdout } = await execFileAsync("git", ["merge-base", "HEAD", candidate], { cwd: root });
      if (stdout.trim()) return candidate;
    } catch {
      // Not every repo has these; fall through.
    }
  }
  return "HEAD~1";
}

/**
 * Which pinned rules this change touches, and what state they are in.
 *
 * This is the editor-independent view: it needs no hook and no cooperation from
 * whatever wrote the code, so it works for an agent, a teammate, or someone
 * editing by hand.
 */
export async function reviewDiff(root: string, requestedBase?: string): Promise<Review> {
  const base = await resolveBase(root, requestedBase);
  const files = await changedFiles(root, base);
  const evals = await statusClaims(root);

  const claims: ReviewedClaim[] = [];
  for (const evaluation of evals) {
    const touched = files.filter((f) => ticketCoversPath(evaluation.claim, f));
    if (touched.length > 0) claims.push({ evaluation, touched });
  }

  // Worst first: a reviewer should not have to scroll to find the failure.
  const rank = { contradicted: 0, stale: 1, open: 2, supported: 3, closed: 4 } as const;
  claims.sort((a, b) => rank[a.evaluation.status] - rank[b.evaluation.status]);

  return {
    base,
    changedFiles: files,
    claims,
    contradicted: claims.filter((c) => c.evaluation.status === "contradicted").length,
  };
}

/** A PR comment. Deliberately quiet when nothing is wrong. */
export function reviewMarkdown(review: Review): string {
  if (review.claims.length === 0) {
    return `No pinned rules cover the ${review.changedFiles.length} file(s) changed against \`${review.base}\`.`;
  }
  const lines = [
    `**${review.claims.length} pinned rule${review.claims.length === 1 ? " applies" : "s apply"} to this change** ` +
      `(${review.changedFiles.length} file${review.changedFiles.length === 1 ? "" : "s"} vs \`${review.base}\`)`,
    "",
    "| | Rule | Touches |",
    "|---|---|---|",
  ];
  const icon = { contradicted: "🔴", stale: "🟡", open: "⚪", supported: "🟢", closed: "⚫" } as const;
  for (const { evaluation: e, touched } of review.claims) {
    lines.push(`| ${icon[e.status]} \`${e.status}\` | ${e.claim.text} | ${touched.map((t) => `\`${t}\``).join(", ")} |`);
  }
  if (review.contradicted > 0) {
    lines.push("", "**Lost evidence:**");
    for (const { evaluation: e } of review.claims.filter((c) => c.evaluation.status === "contradicted")) {
      lines.push(`- \`${e.claim.id}\` — ${e.missingEvidence.join(", ")}`);
    }
  }
  return lines.join("\n");
}
