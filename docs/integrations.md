# Using diedinchat as a plugin

diedinchat ships as an **MCP server**, which is the one integration path that
works across essentially every current coding agent. Install it once and any
MCP-capable client can drive evaluations directly, with no per-agent adapter and no
wrapper script.

> Install from npm: `npx -y diedinchat mcp`. Clone-and-link still works if
> you're hacking on this repo.


```bash
npx -y diedinchat mcp
```

That command is the whole integration. Everything below is just where each
client wants that line written down.

> **Two different things called "agents" here.** The *client* is the agent you
> configure diedinchat into (it calls the MCP tools). The *subject* is the
> agent diedinchat runs and measures, chosen per-run via an agent profile.
> They can be the same agent, which is how you have an agent measure its own
> configuration.

## The tools it exposes

The ticket tools are the product. Call these:

| Tool | What it does |
|---|---|
| `list_claims_for_file` | **Call this before editing a path.** Returns the rules covering it, with live status. Takes `includeClosed` to see retired ones. |
| `pin_claim` | Pin a rule to one or more paths. Pass `evidence` — a phrase that must stay true — or the rule can only ever report `open` or `stale`. |
| `check_claim` | Re-evaluate against current files. No model involved: hashes and frozen evidence only. |
| `close_claim` | Retire a rule, keeping its history. |
| `unpin_claim` | Delete a rule permanently. Prefer `close_claim`. |

The server also exposes the measurement harness — `list_agent_profiles`,
`run_evaluation`, `score_results`, `generate_report`, `start_run`,
`submit_answers`, `compare_runs`. Those drive A/B experiments against agent CLIs
and **spend real API budget**. They are how the claims in the README were
measured; they are not what the tool is for. See [lab.md](lab.md).

## Client setup

### Claude Code

```bash
claude mcp add diedinchat -- npx -y diedinchat mcp
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
      "args": ["-y", "diedinchat", "mcp"]
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
      "args": ["-y", "diedinchat", "mcp"]
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
      "args": ["-y", "diedinchat", "mcp"]
    }
  }
}
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.diedinchat]
command = "npx"
args = ["-y", "diedinchat", "mcp"]
```

### Smithery

```bash
npx -y smithery mcp add pawankumar94/diedinchat
```

[The listing](https://smithery.ai/servers/pawankumar94/diedinchat) installs a
bundled copy, so it needs no global `diedinchat`. It prompts for a **project
root**: an MCP client launches the server in its own working directory rather
than your repository, and without that setting every lookup reads the wrong
`.diedinchat/` — or none.

### Anything else (Windsurf / Zed / Claude Desktop)

Configure manually: most other MCP clients (Windsurf, Zed, Claude Desktop, Continue, and the rest)
accept the same `mcpServers` object shown under Cursor above; only the file
location differs. Config keys and paths do drift between releases, so check
your client's current MCP docs if a block here doesn't take.

## A typical session

```
You:   don't put auth in route handlers, it lives in src/middleware.ts
Agent: pin_claim { text: "...", files: ["src/middleware.ts", "src/routes/"],
                   evidence: ["withAuth"] }
       -> .diedinchat/auth-surface.json, status: supported

--- days later, different editor, empty chat ---

You:   add a /admin route
Agent: list_claims_for_file { path: "src/routes/" }
       -> auth-surface (supported): auth lives in src/middleware.ts
       writes the handler using withAuth
```

Nothing in that exchange spends API budget or leaves the machine.

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
import { resolveAgentProfile, runEvaluation, scoreRecords, buildReport, loadTasksDoc } from "diedinchat";

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
