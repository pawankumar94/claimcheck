/**
 * Renders the evidence summary in README.md from the scored data, so the figure
 * cannot drift from the numbers. Regenerate with `npm run chart:summary`.
 *
 * A forest plot rather than bars: the point of these results is the interval,
 * and two of the four deliberately span zero.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { differenceInterval } from "../dist/index.js";

const INK = "#6e7781", ACCENT = "#d64550";
const SANS = "system-ui,-apple-system,Segoe UI,sans-serif";

function counts(path, tasks, arm) {
  const s = JSON.parse(readFileSync(path, "utf-8"))
    .filter((r) => r.score !== "ERROR" && r.policy_name === arm && tasks.includes(r.task_id));
  return [s.filter((r) => r.score === "HONORED" || r.score.startsWith("PASS")).length, s.length];
}

const INVISIBLE = ["i1-generated-config", "i3-misleading-units"];
const CONTROL = ["i2-banned-dependency"];
const M2 = ["m2-passing-mention", "m2-explicit-rule"];
const M1 = ["h1-auth-in-routes", "h2-sql-in-handler", "h3-float-money"];

const rows = [
  { label: "Honor — constraints the code can't express", ...pair("./results/m1bv2-scored.json", INVISIBLE) },
  { label: "Capture — agent writes the ticket itself", ...pair("./results/m2-scored.json", M2, "installed", "not-installed") },
  { label: "Negative control — agent already correct", ...pair("./results/m1bv2-scored.json", CONTROL) },
  { label: "Honor — constraints it can infer anyway", ...pair("./results/m1-scored.json", M1, "with-tickets", "no-tickets") },
];

function pair(path, tasks, withArm = "with-tickets", withoutArm = "no-tickets") {
  const [a, an] = counts(path, tasks, withArm);
  const [b, bn] = counts(path, tasks, withoutArm);
  const r = differenceInterval(a, an, b, bn);
  return { a, an, b, bn, delta: r.delta, ci: r.ci95 };
}

const W = 760, rowH = 62, top = 76, H = top + rows.length * rowH + 46;
const plotL = 340, plotR = W - 28, lo = -40, hi = 110;
const x = (v) => plotL + ((v - lo) / (hi - lo)) * (plotR - plotL);

const out = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Measured effect of pinned tickets across four experiments, each with a 95 percent confidence interval on the difference in percentage points.">`,
  `<title>What has been measured</title>`,
  `<text x="24" y="26" font-family="${SANS}" font-size="13" font-weight="600" fill="${INK}">Difference with tickets vs without, in percentage points (95% interval)</text>`,
  `<line x1="${x(0)}" y1="52" x2="${x(0)}" y2="${top + rows.length * rowH - 16}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.8"/>`,
  `<text x="${x(0)}" y="46" text-anchor="middle" font-family="${SANS}" font-size="10.5" fill="${INK}">no effect</text>`,
];
for (const v of [-25, 25, 50, 75, 100]) {
  out.push(`<text x="${x(v)}" y="${H - 16}" text-anchor="middle" font-family="${SANS}" font-size="10" fill="${INK}">${v > 0 ? "+" : ""}${v}</text>`);
}
rows.forEach((r, i) => {
  const y = top + i * rowH;
  const spans = r.ci[0] <= 0 && r.ci[1] >= 0;
  const col = spans ? INK : ACCENT;
  out.push(`<text x="24" y="${y - 4}" font-family="${SANS}" font-size="12" font-weight="600" fill="${INK}">${r.label}</text>`);
  out.push(`<text x="24" y="${y + 13}" font-family="${SANS}" font-size="10.5" fill="${INK}">${r.a}/${r.an} with · ${r.b}/${r.bn} without${spans ? " · not distinguishable" : ""}</text>`);
  const lx = Math.max(x(r.ci[0]), plotL), rx = Math.min(x(r.ci[1]), plotR);
  out.push(`<line x1="${lx}" y1="${y}" x2="${rx}" y2="${y}" stroke="${col}" stroke-width="2"/>`);
  for (const cx of [lx, rx]) out.push(`<line x1="${cx}" y1="${y - 6}" x2="${cx}" y2="${y + 6}" stroke="${col}" stroke-width="2"/>`);
  out.push(`<circle cx="${x(r.delta)}" cy="${y}" r="5" fill="${col}"/>`);
  out.push(`<text x="${Math.min(rx + 10, plotR - 4)}" y="${y + 4}" font-family="${SANS}" font-size="11" font-weight="600" fill="${col}">${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(0)}</text>`);
});
out.push("</svg>");
writeFileSync("docs/assets/evidence-summary.svg", out.join("\n") + "\n");
console.log("wrote docs/assets/evidence-summary.svg");
rows.forEach((r) => console.log(`  ${r.label.padEnd(44)} ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(0)} [${r.ci[0].toFixed(0)}, ${r.ci[1].toFixed(0)}]`));
