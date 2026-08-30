/**
 * The product figure for README.md: what actually happened to the code, per
 * rule, with and without a ticket. Generated from the scored data so the counts
 * cannot drift from the evidence.
 *
 * A unit chart rather than bars -- one dot per trial makes the sample size
 * visible instead of hiding it behind a percentage, which matters when n is 10.
 */
import { readFileSync, writeFileSync } from "node:fs";

const INK = "#6e7781", OK = "#3fa06a", BAD = "#d64550";
const SANS = "system-ui,-apple-system,Segoe UI,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";

const scored = JSON.parse(readFileSync("./results/m1bv2-scored.json", "utf-8"));
const count = (id, arm) => {
  const rows = scored.filter((r) => r.task_id === id && r.policy_name === arm && r.score !== "ERROR");
  return { ok: rows.filter((r) => r.score === "HONORED").length, n: rows.length };
};

const RULES = [
  { id: "i1-generated-config", rule: "config.ts is generated — edit the schema",
    without: "edited the generated file", with_: "edited the schema" },
  { id: "i3-misleading-units", rule: "getPrice returns integer cents",
    without: "converted to decimal currency", with_: "kept integer cents" },
  { id: "i2-banned-dependency", rule: "no lodash in new code", control: true,
    without: "wrote plain TypeScript", with_: "wrote plain TypeScript" },
];

const W = 860, rowH = 96, top = 92, H = top + RULES.length * rowH + 34;
const COL_A = 372, COL_B = 630;

const dots = (x, y, ok, n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const cx = x + (i % 10) * 15, cy = y + Math.floor(i / 10) * 15;
    out.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="${i < ok ? OK : BAD}" opacity="${i < ok ? 1 : 0.85}"/>`);
  }
  return out.join("");
};

const p = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="For each of three rules, what the coding agent wrote with and without a pinned ticket, one dot per trial.">`,
  `<title>What the agent wrote, with and without a ticket</title>`,
  `<text x="24" y="26" font-family="${SANS}" font-size="14" font-weight="600" fill="${INK}">What the agent wrote — one dot per trial, 10 trials each</text>`,
  `<text x="24" y="46" font-family="${SANS}" font-size="11.5" fill="${INK}">Claude Code, same repo, same request. The only difference is whether the rule was pinned in .diedinchat/</text>`,
  `<text x="${COL_A}" y="76" font-family="${SANS}" font-size="12.5" font-weight="600" fill="${INK}">without a ticket</text>`,
  `<text x="${COL_B}" y="76" font-family="${SANS}" font-size="12.5" font-weight="600" fill="${INK}">with a ticket</text>`,
  `<line x1="24" y1="84" x2="${W - 24}" y2="84" stroke="${INK}" stroke-width="1" opacity="0.35"/>`,
];

RULES.forEach((r, i) => {
  const y = top + i * rowH;
  const a = count(r.id, "no-tickets"), b = count(r.id, "with-tickets");
  p.push(`<text x="24" y="${y + 14}" font-family="${MONO}" font-size="12" fill="${INK}">${r.rule}</text>`);
  if (r.control)
    p.push(`<text x="24" y="${y + 33}" font-family="${SANS}" font-size="11" font-style="italic" fill="${INK}">control — the agent already gets this right</text>`);
  for (const [x, c, note] of [[COL_A, a, r.without], [COL_B, b, r.with_]]) {
    p.push(dots(x + 5, y + 10, c.ok, c.n));
    p.push(`<text x="${x}" y="${y + 42}" font-family="${SANS}" font-size="11.5" fill="${c.ok === c.n ? OK : c.ok === 0 ? BAD : INK}">${c.ok}/${c.n} followed the rule</text>`);
    p.push(`<text x="${x}" y="${y + 59}" font-family="${SANS}" font-size="11" fill="${INK}">${note}</text>`);
  }
  if (i < RULES.length - 1)
    p.push(`<line x1="24" y1="${y + 74}" x2="${W - 24}" y2="${y + 74}" stroke="${INK}" stroke-width="1" opacity="0.18"/>`);
});
p.push(`<text x="24" y="${H - 12}" font-family="${SANS}" font-size="11" font-style="italic" fill="${INK}">Two rules an agent cannot infer from the code went from never followed to nearly always. The control was untouched.</text>`);
p.push("</svg>");
writeFileSync("docs/assets/what-the-agent-wrote.svg", p.join("\n") + "\n");
console.log("wrote docs/assets/what-the-agent-wrote.svg");
RULES.forEach((r) => console.log(`  ${r.rule.padEnd(44)} without ${JSON.stringify(count(r.id,"no-tickets"))}  with ${JSON.stringify(count(r.id,"with-tickets"))}`));
