# Run: 2026-08-29, Codex in-agent evaluation

This run dogfoods claimcheck as an MCP server inside Codex. It compares the
same Codex model with the normal user tool configuration against a minimal
configuration containing only claimcheck.

## Setup

| | |
|---|---|
| Agent | Codex CLI 0.147.0, `gpt-5.6-sol`, medium reasoning |
| Task set | `examples/claim-001-tool-count`, 8 repository questions |
| Corpus | `pawankumar94/nocontext` at `6f0d6f48` |
| Full condition | Normal user config, 29 configured MCP servers and 12 enabled plugins, plus claimcheck |
| Minimal condition | User config ignored, only claimcheck MCP configured |
| Held constant | Model, reasoning effort, pinned checkout, read-only sandbox, prompt |
| Trials | 1 Codex session per condition |

The MCP server was run from the local build. This does not validate the public
`npx claimcheck` installation path.

## Result

| condition | automated score | manual review | Codex tokens |
|---|---:|---:|---:|
| Full | 6/8 | 8/8 | 43,636 |
| Minimal | 6/8 | 8/8 | 54,357 |

The generated comparison reports a 0 point difference with a 95% confidence
interval from -40 to +40 points. This run found no task-success gain from the
minimal configuration. One trial per condition cannot support an equivalence
or token-efficiency claim.

## Why automated and manual scores differ

Both conditions produced correct answers for all eight tasks. The frozen
keyword scorer marked the same two answers PARTIAL in each condition:

- `t4-mcp-status` said the repo "does not currently ship an MCP server" and
  correctly named Phase 5 as gated on Phase 4. The key requires the literal
  phrase `not started`.
- `t8-benchmark-comparison` said nocontext "holds the retriever fixed." The key
  requires the literal phrase `fixes the retriever`.

The keys were not changed after seeing the output. This result is evidence that
the scorer is the limiting factor for this task set, not evidence that either
Codex condition missed those facts.

## MCP integration findings

Codex discovered and called `start_run`, `submit_answers`, and `compare_runs`
from the local claimcheck server.

The first non-interactive attempt failed because Codex cancelled the MCP tool
calls under its default approval behavior. The successful runs set:

```toml
[mcp_servers.claimcheck]
default_tools_approval_mode = "approve"
```

The broad condition also printed authentication errors from several unrelated
configured MCP servers. claimcheck still completed, but this startup noise is
part of the real cost of a large user configuration.

## Limits

- This is an in-agent run. All eight tasks share one Codex conversation, so it
  is not equivalent to the subprocess runner's fresh session per task.
- claimcheck records no token or latency data for in-agent answers. Token totals
  above were copied from the Codex CLI summaries.
- The full configuration is described by the client. claimcheck does not verify
  which host tools were actually available.
- Codex uses deferred tool loading, so configured tool count does not imply that
  every schema entered the model context.
- With 8 tasks and one session per condition, the result is directional only.

## Run IDs

- Full: `20260829-181255-codex-full`
- Minimal: `20260829-181134-codex-minimal`

See [report.md](report.md) for the generated comparison and the raw run files
for the submitted answers.
