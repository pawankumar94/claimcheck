import { isPass } from "./scorer.js";
import type { ScoredRecord } from "../types.js";
import { analyze, type PolicyComparison } from "./analysis.js";

/**
 * Dependency-free SVG charts, sized for GitHub markdown.
 *
 * Colours come from CSS variables with literal fallbacks so the charts stay
 * legible in both GitHub themes; GitHub strips <style> from markdown-embedded
 * SVG, so every fill is also set as an attribute rather than relying on CSS.
 */

const INK = "#57606a";
const GRID = "#d0d7de";
const CANDIDATE = "#0969da";
const BASELINE = "#8250df";
const ZERO = "#cf222e";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Pass rate per condition with a 95% interval on the *difference* drawn
 * against zero -- the chart has to make "this difference is indistinguishable
 * from nothing" visible, since that is the most common honest outcome and the
 * easiest one to misread from bars alone.
 */
export function passRateChart(comparison: PolicyComparison): string {
  const W = 720;
  const H = 300;
  const padL = 130;
  const padR = 40;
  const plotW = W - padL - padR;

  const bars = [comparison.candidate, comparison.baseline];
  const barH = 38;
  const gap = 22;
  const top = 60;

  const x = (pct: number) => padL + (pct / 100) * plotW;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Pass rate by policy with 95% confidence interval on the difference">`,
    `<text x="${padL}" y="28" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="${INK}">${esc(comparison.agent)}: pass rate by policy</text>`,
  ];

  // Gridlines every 25%.
  for (let p = 0; p <= 100; p += 25) {
    parts.push(
      `<line x1="${x(p)}" y1="${top - 8}" x2="${x(p)}" y2="${top + bars.length * (barH + gap)}" stroke="${GRID}" stroke-width="1"/>`,
      `<text x="${x(p)}" y="${top + bars.length * (barH + gap) + 16}" font-family="system-ui,sans-serif" font-size="11" fill="${INK}" text-anchor="middle">${p}%</text>`
    );
  }

  bars.forEach((stat, i) => {
    const y = top + i * (barH + gap);
    const color = i === 0 ? CANDIDATE : BASELINE;
    parts.push(
      `<text x="${padL - 12}" y="${y + barH / 2 + 4}" font-family="system-ui,sans-serif" font-size="13" fill="${INK}" text-anchor="end">${esc(stat.policy)}</text>`,
      `<rect x="${padL}" y="${y}" width="${Math.max(2, x(stat.passRate) - padL)}" height="${barH}" fill="${color}" rx="3"/>`,
      `<text x="${x(stat.passRate) + 8}" y="${y + barH / 2 + 4}" font-family="system-ui,sans-serif" font-size="12" fill="${INK}">${stat.passes}/${stat.n} (${stat.passRate.toFixed(0)}%)</text>`
    );
  });

  // Difference interval, drawn on its own axis so zero is visible.
  const ciTop = top + bars.length * (barH + gap) + 44;
  const lo = Math.min(-5, Math.floor(comparison.ci95[0] / 10) * 10);
  const hi = Math.max(5, Math.ceil(comparison.ci95[1] / 10) * 10);
  const dx = (pts: number) => padL + ((pts - lo) / (hi - lo)) * plotW;

  parts.push(
    `<text x="${padL - 12}" y="${ciTop + 5}" font-family="system-ui,sans-serif" font-size="13" fill="${INK}" text-anchor="end">difference</text>`,
    `<line x1="${dx(comparison.ci95[0])}" y1="${ciTop}" x2="${dx(comparison.ci95[1])}" y2="${ciTop}" stroke="${INK}" stroke-width="3"/>`,
    `<line x1="${dx(comparison.ci95[0])}" y1="${ciTop - 7}" x2="${dx(comparison.ci95[0])}" y2="${ciTop + 7}" stroke="${INK}" stroke-width="3"/>`,
    `<line x1="${dx(comparison.ci95[1])}" y1="${ciTop - 7}" x2="${dx(comparison.ci95[1])}" y2="${ciTop + 7}" stroke="${INK}" stroke-width="3"/>`,
    `<circle cx="${dx(comparison.deltaPoints)}" cy="${ciTop}" r="5" fill="${CANDIDATE}"/>`,
    `<line x1="${dx(0)}" y1="${ciTop - 20}" x2="${dx(0)}" y2="${ciTop + 20}" stroke="${ZERO}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
    `<text x="${dx(0)}" y="${ciTop + 34}" font-family="system-ui,sans-serif" font-size="11" fill="${ZERO}" text-anchor="middle">no difference</text>`,
    `<text x="${padL}" y="${H - 10}" font-family="system-ui,sans-serif" font-size="12" fill="${INK}">${esc(
      `${comparison.deltaPoints >= 0 ? "+" : ""}${comparison.deltaPoints.toFixed(0)} pts (95% CI ${comparison.ci95[0].toFixed(0)} to ${comparison.ci95[1].toFixed(0)}) - ${comparison.distinguishable ? "excludes zero" : "spans zero: not distinguishable"}`
    )}</text>`,
    `</svg>`
  );

  return parts.join("\n");
}

/** Per-task pass counts side by side, so a single dominating task is visible. */
export function perTaskChart(records: ScoredRecord[], comparison: PolicyComparison): string {
  const taskIds = [...new Set(records.map((r) => r.task_id))].sort();
  const policies = [comparison.candidate.policy, comparison.baseline.policy];

  const rowH = 30;
  const padL = 190;
  const padR = 30;
  const W = 720;
  const top = 54;
  const H = top + taskIds.length * rowH + 46;
  const plotW = W - padL - padR;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Per-task pass count by policy">`,
    `<text x="12" y="26" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="${INK}">Pass count per task (out of trials run)</text>`,
  ];

  policies.forEach((p, i) => {
    const cx = padL + i * 150;
    parts.push(
      `<rect x="${cx}" y="${top - 26}" width="10" height="10" fill="${i === 0 ? CANDIDATE : BASELINE}" rx="2"/>`,
      `<text x="${cx + 16}" y="${top - 17}" font-family="system-ui,sans-serif" font-size="12" fill="${INK}">${esc(p)}</text>`
    );
  });

  const maxTrials = Math.max(
    1,
    ...taskIds.map((t) => policies.map((p) => records.filter((r) => r.task_id === t && r.policy_name === p).length)).flat()
  );

  taskIds.forEach((taskId, row) => {
    const y = top + row * rowH;
    parts.push(
      `<text x="${padL - 10}" y="${y + 15}" font-family="system-ui,sans-serif" font-size="12" fill="${INK}" text-anchor="end">${esc(taskId)}</text>`
    );
    policies.forEach((policy, i) => {
      const cell = records.filter((r) => r.task_id === taskId && r.policy_name === policy);
      const passes = cell.filter((r) => isPass(r.score)).length;
      const trackW = plotW / 2 - 62;
      const barW = (passes / maxTrials) * trackW;
      const bx = padL + i * (plotW / 2);
      parts.push(
        `<rect x="${bx}" y="${y + 4}" width="${trackW}" height="16" fill="${GRID}" rx="2" opacity="0.45"/>`,
        `<rect x="${bx}" y="${y + 4}" width="${Math.max(0, barW)}" height="16" fill="${i === 0 ? CANDIDATE : BASELINE}" rx="2"/>`,
        `<text x="${bx + trackW + 8}" y="${y + 17}" font-family="system-ui,sans-serif" font-size="11" fill="${INK}">${passes}/${cell.length}</text>`
      );
    });
  });

  parts.push(`</svg>`);
  return parts.join("\n");
}

export interface Charts {
  passRate: string;
  perTask: string;
}

export function buildCharts(records: ScoredRecord[], opts: { baselinePolicy?: string; candidatePolicy?: string } = {}): Charts[] {
  const { comparisons } = analyze(records, opts);
  return comparisons.map((c) => ({
    passRate: passRateChart(c),
    perTask: perTaskChart(
      records.filter((r) => r.agent_name === c.agent),
      c
    ),
  }));
}
