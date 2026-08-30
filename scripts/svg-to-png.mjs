/**
 * PNG copies of the README figures, for renderers that will not display SVG.
 * npmjs.com strips SVG from READMEs; GitHub does not. Rather than keep two
 * hand-maintained versions, this derives the PNGs from the generated SVGs so
 * they cannot disagree.
 *
 * White is baked in deliberately: a PNG cannot follow the reader's theme, and
 * a transparent one would put grey text on a dark background as often as not.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const FIGURES = ["what-the-agent-wrote", "evidence-summary", "handoff-loop"];
const SCALE = 2; // retina-legible on the npm page

for (const name of FIGURES) {
  const src = `docs/assets/${name}.svg`;
  const svg = readFileSync(src, "utf-8");
  const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) ?? [];
  if (!w) throw new Error(`${src} has no viewBox to size from`);

  // rsvg-convert renders onto transparency; a white plate under it keeps the
  // ink readable wherever the PNG ends up.
  const plated = svg.replace(
    /(<svg[^>]*>)/,
    `$1<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`
  );
  const tmp = `/tmp/${name}.plated.svg`;
  writeFileSync(tmp, plated);
  execFileSync("rsvg-convert", [
    "-w", String(Math.round(Number(w) * SCALE)),
    "-f", "png", "-o", `docs/assets/${name}.png`, tmp,
  ]);
  unlinkSync(tmp);
  console.log(`docs/assets/${name}.png  ${Math.round(Number(w) * SCALE)}px wide`);
}
