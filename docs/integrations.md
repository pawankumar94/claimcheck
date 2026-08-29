# Using claimcheck as a plugin

claimcheck ships as an **MCP server**, which is the one integration path that
works across essentially every current coding agent. Install it once and any
MCP-capable client can drive evaluations directly — no per-agent adapter, no
wrapper script.

```bash
npx -y @pawankumar94/claimcheck mcp
```

That command is the whole integration. Everything below is just where each
client wants that line written down.

> **Two different things called "agents" here.** The *client* is the agent you
> configure claimcheck into (it calls the MCP tools). The *subject* is the
> agent claimcheck runs and measures, chosen per-run via an agent profile.
> They can be the same agent — that's how you have an agent measure its own
> configuration.

## The tools it exposes

| Tool | Purpose |
|---|---|
| `list_agent_profiles` | Discovery. Returns bundled agent profiles (with their policy names and verification status) and example task sets. **Call this first** — it's how a client learns valid arguments for the others. |
| `run_evaluation` | Runs tasks × agents × policies × trials. Spawns real agent CLIs and spends real API budget. |
| `score_results` | Matches each answer against its pre-registered key. |
| `generate_report` | Aggregates into a markdown report with pass rate, cost, and latency. |

Because `list_agent_profiles` reports names rather than paths, a client never
has to know where npm installed the package.

## Client setup

### Claude Code

```bash
claude mcp add claimcheck -- npx -y @pawankumar94/claimcheck mcp
```

Add `-s user` to make it available in every project rather than just the
current one.

### Cursor

`.cursor/mcp.json` in the project (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "claimcheck": {
      "command": "npx",
      "args": ["-y", "@pawankumar94/claimcheck", "mcp"]
    }
  }
}
```

### VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "claimcheck": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@pawankumar94/claimcheck", "mcp"]
    }
  }
}
```

### Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "claimcheck": {
      "command": "npx",
      "args": ["-y", "@pawankumar94/claimcheck", "mcp"]
    }
  }
}
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.claimcheck]
command = "npx"
args = ["-y", "@pawankumar94/claimcheck", "mcp"]
```

### Anything else

Most other MCP clients (Windsurf, Zed, Claude Desktop, Continue, and the rest)
accept the same `mcpServers` object shown under Cursor above; only the file
location differs. Config keys and paths do drift between releases, so check
your client's current MCP docs if a block here doesn't take.

## A typical session

Once connected, ask the client in plain language — it picks the tools:

> Use claimcheck to test whether restricting my agent's tools changes task
> success. Run the bundled example against gemini-cli with 3 trials, then
> show me the report.

The client will call `list_agent_profiles` to discover what's available,
`run_evaluation` with `example: "claim-001-tool-count"`, then `score_results`
and `generate_report`.

## Cost and safety

`run_evaluation` spawns real agent CLI processes and spends real API budget,
scaling with tasks × agents × policies × trials. The bundled example at 3
trials is 48 invocations. Subject agents need their own CLI installed and
authenticated (`GEMINI_API_KEY` for `gemini-cli`, `ANTHROPIC_API_KEY` for
`claude-code` in `--bare` mode); claimcheck never handles those credentials
itself, it just inherits the environment.

Each run also clones the task set's pinned repository into a fresh temporary
directory per invocation, so a write-capable policy can't leak state into
another trial.

## Using it as a library

The same pipeline is importable if you'd rather script it:

```ts
import { resolveAgentProfile, runEvaluation, scoreRecords, buildReport, loadTasksDoc } from "@pawankumar94/claimcheck";

const tasksDoc = await loadTasksDoc("./tasks.json");
const agent = await resolveAgentProfile("gemini-cli");
const records = await runEvaluation({
  tasksDoc,
  agents: [agent],
  policyNames: ["curated", "full"],
  outDir: "./results/raw",
  trials: 3,
});
console.log(buildReport(scoreRecords(records, tasksDoc)));
```
