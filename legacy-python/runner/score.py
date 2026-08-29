#!/usr/bin/env python3
"""
Keyword-matches each raw result against its task's answer key.

Deliberately not an LLM-as-judge: with n=8 tasks this is small enough to
also spot-check by hand (print the full result_text for anything scored
FAIL or NEEDS_REVIEW and read it yourself before trusting the number).

Known limitation, found during a quality pass on this scaffold: plain
substring matching false-positives on short/numeric keywords -- "33" would
match inside "1233" or "3383" just as happily as inside the real "33 to 83
points" claim. Short alphanumeric keywords (t3's "33"/"83") now match on
word boundaries instead; longer or punctuated keywords (an npm package name,
a hyphenated directory name) fall back to plain substring, since \\b behaves
oddly around characters like "@" and "/". This is still a heuristic, not a
proof the match is semantically right -- keep spot-checking PARTIAL/FAIL.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def keyword_present(keyword: str, text_lower: str) -> bool:
    kw_lower = keyword.lower()
    if kw_lower.isalnum():
        return re.search(rf"\b{re.escape(kw_lower)}\b", text_lower) is not None
    return kw_lower in text_lower


def score_one(result_text: str, expected_keywords: list[str]) -> tuple[str, list[str]]:
    text_lower = result_text.lower()
    missing = [kw for kw in expected_keywords if not keyword_present(kw, text_lower)]
    if not missing:
        return "PASS", []
    if len(missing) < len(expected_keywords):
        return "PARTIAL", missing
    return "FAIL", missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", default=str(ROOT / "results" / "raw"))
    ap.add_argument("--input", help="Single JSON file of raw records (list), overrides --raw-dir. Used for the fixture check.")
    ap.add_argument("--tasks", default=str(ROOT / "tasks" / "tasks.json"))
    ap.add_argument("--output", default=str(ROOT / "results" / "scored.json"))
    args = ap.parse_args()

    tasks_doc = load_json(Path(args.tasks))
    answer_keys = {t["id"]: t for t in tasks_doc["tasks"]}

    if args.input:
        records = load_json(Path(args.input))
    else:
        records = [load_json(p) for p in sorted(Path(args.raw_dir).glob("*.json"))]

    scored = []
    for rec in records:
        task = answer_keys.get(rec["task_id"])
        if task is None:
            print(f"WARNING: {rec['task_id']} not found in tasks.json, skipping")
            continue

        if not rec.get("ok"):
            scored.append({**rec, "score": "ERROR", "missing_keywords": None})
            continue

        result_text = rec.get("metrics", {}).get("result_text", "")
        verdict, missing = score_one(result_text, task["expected_keywords"])
        if not task.get("verified", False):
            verdict = f"{verdict} (UNVERIFIED ANSWER KEY -- {task.get('note', '')})"

        scored.append({**rec, "score": verdict, "missing_keywords": missing})

    Path(args.output).write_text(json.dumps(scored, indent=2))
    print(f"Wrote {len(scored)} scored records to {args.output}")

    fails = [r for r in scored if r["score"].startswith("FAIL") or r["score"] == "ERROR"]
    if fails:
        print(f"\n{len(fails)} FAIL/ERROR -- inspect these by hand before trusting the report:")
        for r in fails:
            print(f"  {r['task_id']} / {r['config_name']} / trial {r.get('trial')} -> {r['score']}")


if __name__ == "__main__":
    main()
