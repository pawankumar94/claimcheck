import { describe, expect, it, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "..", "dist", "cli.js");

describe("MCP server", () => {
  let client: Client;

  async function connect(): Promise<Client> {
    if (client) return client;
    const transport = new StdioClientTransport({ command: process.execPath, args: [CLI, "mcp"] });
    client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(transport);
    return client;
  }

  afterAll(async () => {
    await client?.close();
  });

  it("advertises the discovery and pipeline tools", async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "check_claim",
        "list_claims_for_file",
        "pin_claim",
        "compare_runs",
        "start_run",
        "submit_answers",
        "generate_report",
        "list_agent_profiles",
        "run_evaluation",
        "score_results",
      ].sort()
    );
  }, 15000);

  it("list_agent_profiles returns built-in profiles and examples by name", async () => {
    const c = await connect();
    const res = await c.callTool({ name: "list_agent_profiles", arguments: {} });
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    const payload = JSON.parse(text);

    const names = payload.agentProfiles.map((p: { name: string }) => p.name).sort();
    expect(names).toContain("claude-code");
    expect(names).toContain("gemini-cli");
    expect(payload.exampleTaskSets).toContain("claim-001-tool-count");

    // Each profile must declare its policies and verification state, since a
    // calling agent uses exactly these to pick arguments for run_evaluation.
    for (const p of payload.agentProfiles) {
      expect(Array.isArray(p.policies)).toBe(true);
      expect(p.policies.length).toBeGreaterThan(0);
      expect(typeof p.verified).toBe("boolean");
    }
  }, 15000);

  it("run_evaluation rejects a call with neither tasksPath nor example", async () => {
    const c = await connect();
    const res = await c.callTool({
      name: "run_evaluation",
      arguments: { agents: ["gemini-cli"], policies: ["curated"] },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toMatch(/tasksPath|example/);
  }, 15000);

  it("run_evaluation reports an unknown agent by name rather than failing silently", async () => {
    const c = await connect();
    const res = await c.callTool({
      name: "run_evaluation",
      arguments: {
        agents: ["definitely-not-an-agent"],
        policies: ["curated"],
        example: "claim-001-tool-count",
      },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("definitely-not-an-agent");
  }, 15000);
});
