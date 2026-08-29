# Using diedinchat as a plugin

diedinchat ships as an **MCP server**, which is the one integration path that
works across essentially every current coding agent. Install it once and any
MCP-capable client can drive evaluations directly, with no per-agent adapter and no
wrapper script.

> **Not yet on npm.** The configs below use `npx @pawankumar94/diedinchat`,
> which will work once the package is published. Until then, clone the repo,
> run `npm install && npm run build && npm link`, and use `diedinchat` as the
> `command` with `["mcp"]` as the args.

```bash
npx -y @pawankumar94/diedinchat mcp
```

That command is the whole integration. Everything below is just where each
client wants that line written down.

> **Two different things called "agents" here.** The *client* is the agent you
> configure diedinchat into (it calls the MCP tools). The *subject* is the
> agent diedinchat runs and measures, chosen per-run via an agent profile.
> They can be the same agent, which is how you have an agent measure its own
> configuration.

## The tools it exposes

| Tool | Purpose |
|---|---|
| `list_agent_profiles` | Discovery. Returns bundled agent profiles (with their policy names and verification status) and example task sets. **Call this first**, since it is how a client learns valid arguments for the others. |
| `run_evaluation` | Runs tasks × agents × policies × trials. Spawns real agent CLIs and spends real API budget. |
| `score_results` | Matches each answer against its pre-registered key. |
| `generate_report` | Aggregates into a markdown report with pass rate, cost, and latency. |

Because `list_agent_profiles` reports names rather than paths, a client never
has to know where npm installed the package.

## Client setup

### Claude Code

```bash
claude mcp add diedinchat -- npx -y @pawankumar94/diedinchat mcp
```

Add `-s user` to make it available in every project rather than just the
current one.

### Cursor

`.cursor/mcp.json` in the project (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "diedinchat": {
      "command": "npx",
      "args": ["-y", "@pawankumar94/diedinchat", "mcp"]
    }
  }
}
```

### VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "diedinchat": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@pawankumar94/diedinchat", "mcp"]
    }
  }
}
```

### Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "diedinchat": {
      "command": "npx",
      "args": ["-y", "@pawankumar94/diedinchat", "mcp"]
    }
  }
}
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.diedinchat]
command = "npx"
args = ["-y", "@pawankumar94/diedinchat", "mcp"]
```

### Anything else (Smithery / Windsurf / Zed / Claude Desktop)

To install automatically via [Smithery](https://smithery.ai/server/@pawankumar94/diedinchat):

```bash
npx -y @smithery/cli install @pawankumar94/diedinchat --client claude
```

Or configure manually: most other MCP clients (Windsurf, Zed, Claude Desktop, Continue, and the rest)
accept the same `mcpServers` object shown under Cursor above; only the file
location differs. Config keys and paths do drift between releases, so check
your client's current MCP docs if a block here doesn't take.

## A typical session

Once connected, ask the client in plain language and it picks the tools:

> Use diedinchat to test whether restricting my agent's tools changes task
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
`claude-code` in `--bare` mode); diedinchat never handles those credentials
itself, it just inherits the environment.

Each run also clones the task set's pinned repository into a fresh temporary
directory per invocation, so a write-capable policy can't leak state into
another trial.

## Using it as a library

The same pipeline is importable if you'd rather script it:

```ts
import { resolveAgentProfile, runEvaluation, scoreRecords, buildReport, loadTasksDoc } from "@pawankumar94/diedinchat";

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
