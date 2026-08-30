/**
 * M0 — stale false-alarm rate. See PLANNER.md Phase 1b.
 *
 * Pins a ticket at some commit, replays the commits that follow, and records
 * how often the ticket reports `stale` while its frozen evidence still holds.
 *
 * A `stale` on an evidence-bearing ticket means exactly this: the files moved,
 * the belief still checks out, and we raised a flag anyway. That is the noise
 * this measures. No agent, no network, no API spend -- pure mechanism, so it
 * can gate a fix in CI.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluateClaim, computeHashes } from "../dist/index.js";

const run = promisify(execFile);
const REPO = resolve(process.argv[2] ?? process.cwd());
const DEPTH = Number(process.argv[3] ?? 30);
const SAMPLES = Number(process.argv[4] ?? 12);

const git = (args, cwd) => run("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });

/** A distinctive identifier from the file, used as frozen evidence. */
function evidenceFrom(text) {
  const m = text.match(/export (?:async )?(?:function|const|class|interface|type) (\w{4,})/);
  if (m) return m[1];
  const line = text.split("\n").map(l => l.trim()).filter(l => l.length > 24 && !l.startsWith("//"))[0];
  return line ? line.slice(0, 40) : null;
}

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "m0-"));
  const clone = join(tmp, "repo");
  await git(["clone", "--quiet", "--no-local", REPO, clone], tmp);

  const { stdout } = await git(["log", "--reverse", "--format=%H"], clone);
  const commits = stdout.trim().split("\n");
  // Leave room for DEPTH commits of replay after each sampled start point.
  const usable = commits.slice(0, Math.max(1, commits.length - DEPTH));
  const step = Math.max(1, Math.floor(usable.length / SAMPLES));
  const starts = usable.filter((_, i) => i % step === 0).slice(0, SAMPLES);

  const rows = [];
  for (const start of starts) {
    await git(["checkout", "--quiet", start], clone);
    const { stdout: ls } = await git(["ls-files", "src"], clone);
    const files = ls.trim().split("\n").filter(f => f.endsWith(".ts"));
    if (files.length === 0) continue;

    const targetFile = files[Math.floor(files.length / 2)];
    const text = await readFile(join(clone, targetFile), "utf-8").catch(() => "");
    const ev = evidenceFrom(text);
    if (!ev) continue;

    const idx0 = commits.indexOf(start);
    const lastSha = commits[Math.min(idx0 + DEPTH, commits.length - 1)];

    // Detection arm: an identifier that is present now and GONE by the end of
    // the replay window. Without this the harness only measures silence, and a
    // change that muted every alarm would score a perfect zero.
    let vanishing = null;
    for (const m of text.matchAll(/export (?:async )?(?:function|const|class|interface|type) (\w{5,})/g)) {
      // `git grep` against the tree at lastSha: no checkout, exact answer.
      const present = await git(["grep", "-q", "--fixed-strings", m[1], lastSha, "--", "src"], clone)
        .then(() => true).catch(() => false);
      if (!present) { vanishing = m[1]; break; }
    }

    const arms = [
      ["file", [targetFile], [ev], "noise"],
      ["directory", ["src"], [ev], "noise"],
      ["no-evidence", [targetFile], [], "blunt"],
    ];
    if (vanishing) arms.push(["detection", [targetFile], [vanishing], "detection"]);

    for (const [kind, paths, evidence, arm] of arms) {
      const idx = commits.indexOf(start);
      const replay = commits.slice(idx + 1, idx + 1 + DEPTH);

      // Pin at `start`: snapshot hashes exactly as pinClaim would.
      await git(["checkout", "--quiet", start], clone);
      const hashes = await computeHashes(clone, paths);

      const claim = {
        id: "m0", text: "measurement ticket", files: paths, evidence,
        status: "open", hashes, created_at: "", updated_at: "",
      };

      let firstStale = null, stale = 0, contradicted = 0, supported = 0, n = 0;
      for (const [i, sha] of replay.entries()) {
        await git(["checkout", "--quiet", sha], clone);
        const e = await evaluateClaim(clone, claim);
        n++;
        if (e.status === "stale") { stale++; if (firstStale === null) firstStale = i + 1; }
        else if (e.status === "contradicted") contradicted++;
        else if (e.status === "supported") supported++;
      }
      if (n > 0) rows.push({ kind, arm, start: start.slice(0, 7), target: paths.join(","), evidence: evidence[0] ?? null, n, stale, contradicted, supported, firstStale });
    }
  }

  // ---- Mutation arm: does a real breakage still get caught? ----------------
  //
  // The false-alarm number alone cannot distinguish "fixed the noise" from
  // "deleted the alarm". So: walk to a commit where the file has already
  // churned, remove the frozen evidence from the real file, and require
  // `contradicted`. Real code, real history, injected break.
  const mutation = { attempted: 0, caught: 0, missedStatus: {} };
  for (const start of starts) {
    await git(["checkout", "--quiet", "--force", start], clone);
    const { stdout: ls } = await git(["ls-files", "src"], clone);
    const files = ls.trim().split("\n").filter(f => f.endsWith(".ts"));
    if (files.length === 0) continue;
    const targetFile = files[Math.floor(files.length / 2)];
    const text = await readFile(join(clone, targetFile), "utf-8").catch(() => "");
    const ev = evidenceFrom(text);
    if (!ev) continue;

    const hashes = await computeHashes(clone, [targetFile]);
    const claim = { id: "m0m", text: "mutation ticket", files: [targetFile], evidence: [ev],
                    status: "open", hashes, created_at: "", updated_at: "" };

    const idx = commits.indexOf(start);
    // Two thirds into the replay window, so the file has genuinely drifted.
    const at = commits[Math.min(idx + Math.floor(DEPTH * 0.66), commits.length - 1)];
    await git(["checkout", "--quiet", "--force", at], clone);
    if (!existsSync(join(clone, targetFile))) continue;

    const cur = await readFile(join(clone, targetFile), "utf-8");
    if (!cur.includes(ev)) continue;             // evidence already gone; not a clean injection
    const before = await evaluateClaim(clone, claim);
    if (before.status !== "supported") continue; // only inject where it was healthy

    await writeFile(join(clone, targetFile), cur.split(ev).join("EVIDENCE_REMOVED_BY_M0"));
    const after = await evaluateClaim(clone, claim);
    mutation.attempted++;
    if (after.status === "contradicted") mutation.caught++;
    else mutation.missedStatus[after.status] = (mutation.missedStatus[after.status] ?? 0) + 1;
    await git(["checkout", "--quiet", "--force", "--", targetFile], clone);
  }
  mutation.ratePct = mutation.attempted ? Math.round((100 * mutation.caught) / mutation.attempted) : 0;

  await rm(tmp, { recursive: true, force: true });

  const by = k => rows.filter(r => r.kind === k);
  const pct = (a, b) => b ? Math.round((100 * a) / b) : 0;
  const summarize = k => {
    const rs = by(k);
    const n = rs.reduce((a, r) => a + r.n, 0);
    const stale = rs.reduce((a, r) => a + r.stale, 0);
    const firsts = rs.map(r => r.firstStale).filter(v => v !== null);
    return {
      kind: k, tickets: rs.length, observations: n, stale,
      falseAlarmPct: pct(stale, n),
      medianCommitsToStale: firsts.length ? firsts.sort((a, b) => a - b)[Math.floor(firsts.length / 2)] : null,
      neverStale: rs.filter(r => r.firstStale === null).length,
    };
  };
  const detect = by("detection");
  const detected = detect.filter(r => r.contradicted > 0).length;
  const summary = [summarize("file"), summarize("directory"), summarize("no-evidence")];
  const detection = { tickets: detect.length, caught: detected, ratePct: pct(detected, detect.length) };

  await mkdir("docs/evidence", { recursive: true });
  await writeFile("docs/evidence/stale-noise.json", JSON.stringify({ repo: REPO, depth: DEPTH, summary, detection, mutation, rows }, null, 2) + "\n");

  console.log(`M0 — stale false-alarm rate   repo=${REPO}  replay depth=${DEPTH}\n`);
  console.log("kind        tickets  obs   stale   false-alarm   median commits to stale   never stale");
  for (const s of summary) {
    console.log(
      `${s.kind.padEnd(11)} ${String(s.tickets).padStart(6)} ${String(s.observations).padStart(5)} ` +
      `${String(s.stale).padStart(6)} ${String(s.falseAlarmPct + "%").padStart(12)} ` +
      `${String(s.medianCommitsToStale ?? "n/a").padStart(24)} ${String(s.neverStale).padStart(12)}`
    );
  }
  console.log(
    `\nnatural detection: ${detection.caught}/${detection.tickets} tickets whose evidence vanished ` +
    `in real history reported contradicted` +
    (detection.tickets === 0 ? "  (none available in this repo's history)" : ` (${detection.ratePct}%)`)
  );
  console.log(
    `mutation detection: ${mutation.caught}/${mutation.attempted} injected breakages caught ` +
    `(${mutation.ratePct}%)` +
    (Object.keys(mutation.missedStatus).length ? `  missed as: ${JSON.stringify(mutation.missedStatus)}` : "")
  );
}
main().catch(e => { console.error(e); process.exit(1); });
