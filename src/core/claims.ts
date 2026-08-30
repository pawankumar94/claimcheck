import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { scoreOne } from "./scorer.js";
import type { AcceptanceCriterion, ClaimStatus, FileClaim } from "../types.js";

export const CLAIMS_DIR = ".diedinchat";

export interface ClaimEvaluation {
  claim: FileClaim;
  status: ClaimStatus;
  changed: string[];
  missingEvidence: string[];
  evidenceVerdict: "PASS" | "PARTIAL" | "FAIL" | "NONE";
}

export function claimsDir(root: string): string {
  return join(root, CLAIMS_DIR);
}

export function makeClaimId(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "claim";
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

function resolveInside(root: string, rel: string): string {
  const rootAbs = resolve(root);
  const abs = resolve(rootAbs, rel);
  const prefix = rootAbs.endsWith(sep) ? rootAbs : rootAbs + sep;
  if (abs !== rootAbs && !abs.startsWith(prefix)) {
    throw new Error(`Path escapes the project: ${rel}`);
  }
  return abs;
}

function normalizeRel(rel: string): string {
  return toPosix(rel).replace(/^\.\//, "").replace(/\/$/, "");
}

async function walkFiles(abs: string, root: string): Promise<string[]> {
  const st = await stat(abs);
  if (st.isFile()) return [toPosix(relative(root, abs)) || toPosix(abs)];
  if (!st.isDirectory()) return [];
  const out: string[] = [];
  for (const ent of await readdir(abs, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name === CLAIMS_DIR) continue;
    const child = join(abs, ent.name);
    if (ent.isDirectory()) out.push(...(await walkFiles(child, root)));
    else if (ent.isFile()) out.push(toPosix(relative(root, child)));
  }
  return out.sort();
}

async function hashContents(abs: string): Promise<string> {
  const buf = await readFile(abs);
  return createHash("sha256").update(buf).digest("hex");
}

/** Expand ticket paths (files or dirs) to posix-relative file paths inside root. */
export async function expandFiles(root: string, files: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const rel of files) {
    const abs = resolveInside(root, rel);
    if (!existsSync(abs)) continue;
    found.push(...(await walkFiles(abs, root)));
  }
  return [...new Set(found)].sort();
}

export async function computeHashes(root: string, files: string[]): Promise<Record<string, string>> {
  const expanded = await expandFiles(root, files);
  const hashes: Record<string, string> = {};
  for (const rel of expanded) {
    hashes[rel] = await hashContents(resolveInside(root, rel));
  }
  return hashes;
}

async function currentContents(root: string, files: string[]): Promise<string> {
  const expanded = await expandFiles(root, files);
  const chunks: string[] = [];
  for (const rel of expanded) {
    chunks.push(await readFile(resolveInside(root, rel), "utf-8"));
  }
  return chunks.join("\n");
}

export function ticketCoversPath(claim: FileClaim, path: string): boolean {
  const needle = normalizeRel(path);
  if (!needle) return true;
  return claim.files.some((f) => {
    const bound = normalizeRel(f);
    return needle === bound || needle.startsWith(bound + "/") || bound.startsWith(needle + "/");
  });
}

export async function evaluateClaim(root: string, claim: FileClaim): Promise<ClaimEvaluation> {
  const current = await computeHashes(root, claim.files);
  const previousKeys = Object.keys(claim.hashes).sort();
  const currentKeys = Object.keys(current).sort();
  const changed = new Set<string>();
  for (const k of new Set([...previousKeys, ...currentKeys])) {
    if (claim.hashes[k] !== current[k]) changed.add(k);
  }

  let evidenceVerdict: ClaimEvaluation["evidenceVerdict"] = "NONE";
  let missingEvidence: string[] = [];
  if (claim.evidence.length > 0) {
    const text = await currentContents(root, claim.files);
    const scored = scoreOne(text, claim.evidence);
    evidenceVerdict = scored.verdict;
    missingEvidence = scored.missing;
  }

  // Precedence, and why. Measured on 660 replayed commits (M0, see
  // docs/evidence/stale-noise.md): hashing every byte made `stale` fire on 65%
  // of observations for a file-pinned ticket and 97% for a directory-pinned
  // one, with a directory ticket going red after a single commit. A signal
  // that is almost always on is a signal nobody reads.
  //
  // So a hash change no longer outranks passing evidence. If you froze
  // evidence and it still holds, the evidence *is* the check and the ticket is
  // supported -- the churn is still reported in `changed` for anyone who wants
  // it, it just is not an alarm. `stale` now means the honest thing: the files
  // moved and there is nothing frozen to tell us whether the belief survived.
  let status: ClaimStatus;
  if (claim.closed_at) status = "closed";
  else if (claim.evidence.length > 0) status = evidenceVerdict === "PASS" ? "supported" : "contradicted";
  else if (changed.size > 0) status = "stale";
  else status = "open";

  return { claim, status, changed: [...changed].sort(), missingEvidence, evidenceVerdict };
}

function claimPath(root: string, id: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error(`Invalid claim id "${id}". Use letters, numbers, dot, underscore, hyphen.`);
  }
  return join(claimsDir(root), `${id}.json`);
}

export async function loadClaim(root: string, id: string): Promise<FileClaim> {
  const path = claimPath(root, id);
  if (!existsSync(path)) {
    const known = await listClaims(root);
    throw new Error(`No claim "${id}". Known: ${known.map((c) => c.id).join(", ") || "(none)"}`);
  }
  return JSON.parse(await readFile(path, "utf-8")) as FileClaim;
}

export async function saveClaim(root: string, claim: FileClaim): Promise<string> {
  const dir = claimsDir(root);
  await mkdir(dir, { recursive: true });
  const path = claimPath(root, claim.id);
  await writeFile(path, JSON.stringify(claim, null, 2) + "\n");
  return path;
}

export async function listClaims(root: string): Promise<FileClaim[]> {
  const dir = claimsDir(root);
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const claims: FileClaim[] = [];
  for (const name of names) {
    claims.push(JSON.parse(await readFile(join(dir, name), "utf-8")) as FileClaim);
  }
  return claims;
}

/** Text reduced to comparable words, so wording differences do not hide a duplicate. */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/._-]/g, " ")
    .split(/\s+/)
    // Trailing punctuation would otherwise make "src/mw.ts." a different token
    // from "src/mw.ts", which is exactly the difference this is meant to ignore.
    .map((w) => w.replace(/^[._-]+|[._-]+$/g, ""))
    .filter((w) => w && !["the", "a", "an", "is", "are", "to", "in", "of", "and", "or", "must", "should", "never", "always", "do", "not", "only", "it", "this", "that"].includes(w))
    .sort()
    .join(" ");
}

/** True when two tickets name exactly the same set of paths. */
function sameScope(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
}

/** True when two tickets address any of the same paths. */
function scopesOverlap(a: string[], b: string[]): boolean {
  return a.some((x) => b.some((y) => x === y || x.startsWith(y + "/") || y.startsWith(x + "/")));
}

/**
 * An existing open ticket that already says this about these paths.
 *
 * Agents re-pin: the same constraint arrives phrased slightly differently in a
 * later session, and without this the store fills with near-duplicates that all
 * surface on the same write. Matching is on normalized wording AND overlapping
 * scope, so the same sentence about a different directory is still a new ticket.
 */
export async function findDuplicate(root: string, text: string, files: string[]): Promise<FileClaim | null> {
  const wanted = normalizeText(text);
  const scope = files.map(normalizeRel);
  for (const claim of await listClaims(root)) {
    if (claim.closed_at) continue;
    if (normalizeText(claim.text) === wanted && scopesOverlap(scope, claim.files.map(normalizeRel))) return claim;
  }
  return null;
}

export interface PinInput {
  root: string;
  text: string;
  files: string[];
  evidence?: AcceptanceCriterion[];
  id?: string;
  agent?: string;
  /** Pin even if an equivalent ticket already covers these paths. */
  allowDuplicate?: boolean;
}

export async function pinClaim(input: PinInput): Promise<{ claim: FileClaim; path: string; action: "created" | "updated" }> {
  const files = input.files.map(normalizeRel).filter(Boolean);
  if (files.length === 0) throw new Error("Pin requires at least one --file.");
  if (!input.text.trim()) throw new Error("Pin requires --text.");

  for (const rel of files) {
    const abs = resolveInside(input.root, rel);
    if (!existsSync(abs)) throw new Error(`Cannot pin: ${rel} does not exist.`);
  }

  if (!input.allowDuplicate && !input.id) {
    const existing = await findDuplicate(input.root, input.text, files);
    if (existing) {
      const err = new Error(
        `A ticket already says this about these paths: "${existing.id}". ` +
        `Nothing pinned. Use --id to pin a distinct one anyway, or edit the existing ticket.`
      );
      (err as Error & { duplicateOf?: string }).duplicateOf = existing.id;
      throw err;
    }
  }

  // Ids are derived from the text, so the same sentence about a *different*
  // directory would collide and silently replace the first ticket's scope --
  // losing the original paths. A colliding id with a different scope gets a
  // suffix instead; a colliding id with the same scope is a genuine re-pin.
  let id = input.id ?? makeClaimId(input.text);
  if (!input.id) {
    for (let n = 2; n < 100; n++) {
      const at = claimPath(input.root, id);
      if (!existsSync(at)) break;
      const other = await loadClaim(input.root, id);
      if (sameScope(other.files.map(normalizeRel), files)) break;
      id = `${makeClaimId(input.text)}-${n}`;
    }
  }
  const existing = existsSync(claimPath(input.root, id)) ? await loadClaim(input.root, id) : null;
  const hashes = await computeHashes(input.root, files);
  const now = new Date().toISOString();
  const claim: FileClaim = {
    id,
    text: input.text.trim(),
    files,
    evidence: input.evidence ?? existing?.evidence ?? [],
    status: "open",
    hashes,
    ...(input.agent || existing?.agent ? { agent: input.agent ?? existing?.agent } : {}),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const evaluated = await evaluateClaim(input.root, claim);
  claim.status = evaluated.status;
  const path = await saveClaim(input.root, claim);
  return { claim, path, action: existing ? "updated" : "created" };
}

/** Recompute status from disk, persist it, return the evaluation. */
export async function refreshClaim(root: string, claim: FileClaim): Promise<ClaimEvaluation> {
  const evaluation = await evaluateClaim(root, claim);
  if (evaluation.status !== claim.status) {
    const next = { ...claim, status: evaluation.status, updated_at: new Date().toISOString() };
    await saveClaim(root, next);
    return { ...evaluation, claim: next };
  }
  return evaluation;
}

export async function statusClaims(root: string, pathFilter?: string, includeClosed = false): Promise<ClaimEvaluation[]> {
  const claims = await listClaims(root);
  const visible = includeClosed ? claims : claims.filter((claim) => !claim.closed_at);
  const filtered = pathFilter ? visible.filter((c) => ticketCoversPath(c, pathFilter)) : visible;
  const out: ClaimEvaluation[] = [];
  for (const claim of filtered) out.push(await refreshClaim(root, claim));
  return out;
}

export async function checkClaim(root: string, id: string): Promise<ClaimEvaluation> {
  const claim = await loadClaim(root, id);
  return refreshClaim(root, claim);
}

export async function closeClaim(root: string, id: string): Promise<ClaimEvaluation> {
  const claim = await loadClaim(root, id);
  if (claim.closed_at) return evaluateClaim(root, claim);
  const now = new Date().toISOString();
  const closed: FileClaim = { ...claim, status: "closed", closed_at: now, updated_at: now };
  await saveClaim(root, closed);
  return evaluateClaim(root, closed);
}

export async function unpinClaim(root: string, id: string): Promise<{ id: string; path: string }> {
  const path = claimPath(root, id);
  await loadClaim(root, id);
  await rm(path);
  return { id, path };
}
