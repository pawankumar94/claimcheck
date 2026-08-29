#!/usr/bin/env python3
"""
Runs every task in tasks/tasks.json under every config in configs/*.json
against a fresh clone of the pinned repo, via `claude --bare -p`.

This spends real API budget (8 tasks x N configs x trials). It is not run
automatically by anything in this repo -- you invoke it deliberately.

Before running for real:
  1. Confirm `claude` is installed and authenticated: `claude --version`
  2. Confirm ANTHROPIC_API_KEY is set (--bare skips subscription login)
  3. Sanity-check the exact invocation against your installed CLI version --
     flags shift between releases:
       claude --help | grep -A2 allowedTools
  4. Consider running with --trials 3 (default 1) once the pipeline itself
     is verified against results/fixtures/sample_raw.json.
"""
import argparse
import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def invoke_claude(prompt: str, allowed_tools: str, cwd: Path) -> dict:
    """
    The one function to edit if the CLI's flags change. Verified against
    https://code.claude.com/docs/en/headless as of writing:

      claude --bare -p "<prompt>" --allowedTools "<tools>" \
          --permission-mode dontAsk --output-format json

    --bare: skip project hooks/CLAUDE.md/auto-MCP-discovery, for a
      reproducible baseline (same result on any machine).
    --permission-mode dontAsk: deny anything not explicitly in
      --allowedTools instead of prompting -- required for headless runs.
    --output-format json: structured result with total_cost_usd and a
      per-model cost breakdown. Token-count field names were NOT verified
      against a live run at scaffold time -- inspect one real response
      (`claude --bare -p "hi" --allowedTools "Read" --output-format json | jq .`)
      and adjust `extract_metrics` below before trusting the token numbers
      in the report.
    """
    cmd = [
        "claude", "--bare", "-p", prompt,
        "--allowedTools", allowed_tools,
        "--permission-mode", "dontAsk",
        "--output-format", "json",
    ]
    start = time.time()
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=300)
    latency_ms = int((time.time() - start) * 1000)

    if proc.returncode != 0:
        return {
            "ok": False,
            "error": proc.stderr.strip() or f"exit code {proc.returncode}",
            "latency_ms": latency_ms,
        }

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"non-JSON stdout: {e}", "latency_ms": latency_ms}

    return {"ok": True, "payload": payload, "latency_ms": latency_ms}


def extract_metrics(payload: dict) -> dict:
    """
    Pulls whatever cost/usage fields are present without assuming a fixed
    schema -- CHECK a real response and tighten this once you have one.
    """
    return {
        "result_text": payload.get("result", ""),
        "total_cost_usd": payload.get("total_cost_usd"),
        "session_id": payload.get("session_id"),
        "raw_keys_seen": list(payload.keys()),  # so a schema mismatch is visible, not silent
    }


def fresh_checkout(repo_url: str, sha: str, tmp_root: Path) -> Path:
    checkout = tmp_root / "repo"
    subprocess.run(["git", "clone", "--quiet", repo_url, str(checkout)], check=True)
    subprocess.run(["git", "checkout", "--quiet", sha], cwd=checkout, check=True)
    return checkout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tasks", default=str(ROOT / "tasks" / "tasks.json"))
    ap.add_argument("--configs", nargs="+", default=[
        str(ROOT / "configs" / "full.json"),
        str(ROOT / "configs" / "curated.json"),
    ])
    ap.add_argument("--out-dir", default=str(ROOT / "results" / "raw"))
    ap.add_argument("--trials", type=int, default=1,
                     help="Repeats per task per config. Use >=3 before drawing conclusions.")
    args = ap.parse_args()

    tasks_doc = load_json(Path(args.tasks))
    configs = [load_json(Path(c)) for c in args.configs]
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for config in configs:
        for task in tasks_doc["tasks"]:
            for trial in range(args.trials):
                with tempfile.TemporaryDirectory() as tmp:
                    repo_dir = fresh_checkout(tasks_doc["repo_url"], tasks_doc["pinned_sha"], Path(tmp))
                    result = invoke_claude(task["prompt"], config["allowed_tools"], repo_dir)

                record = {
                    "task_id": task["id"],
                    "config_name": config["name"],
                    "trial": trial,
                    "prompt": task["prompt"],
                    **result,
                }
                if result.get("ok"):
                    record["metrics"] = extract_metrics(result["payload"])

                out_path = out_dir / f"{task['id']}__{config['name']}__t{trial}.json"
                out_path.write_text(json.dumps(record, indent=2))
                status = "ok" if result.get("ok") else f"FAILED: {result.get('error')}"
                print(f"[{config['name']:8s}] {task['id']:24s} trial={trial} -> {status}")


if __name__ == "__main__":
    main()
