import { describe, expect, it, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "..", "dist", "cli.js");

// This suite is the one that needs a build: it drives the real server over
// stdio rather than importing it. Without this guard the failure surfaces as
// "Not connected" from the MCP client, which says nothing about the cause --
// it cost a CI run to diagnose once already.
if (!existsSync(CLI)) {
  throw new Error(`${CLI} is missing. Run \`npm run build\` before \`npm test\`.`);
}

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
        "close_claim",
        "list_claims_for_file",
        "pin_claim",
        "unpin_claim",
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

  it("an MCP-only agent can pin, close and unpin a ticket", async () => {
    // Parity with the CLI is the point: before close_claim and unpin_claim
    // existed, an agent reaching diedinchat only over MCP could create tickets
    // it had no way to retire.
    const root = await mkdtemp(join(tmpdir(), "mcp-parity-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.ts"), "export const auth = 1;\n");
    const c = await connect();
    const call = async (name: string, args: Record<string, unknown>) =>
      JSON.parse(((await c.callTool({ name, arguments: args })).content as Array<{ text: string }>)[0]!.text);

    // pin_claim wraps the ticket: { action, path, claim }.
    const { claim: pinned } = await call("pin_claim", {
      root, text: "Auth lives in src/a.ts.", files: ["src/a.ts"], evidence: ["auth"],
    });
    expect(pinned.status).toBe("supported");

    // Closing hides it from the default listing but keeps it on disk.
    const closed = await call("close_claim", { root, id: pinned.id });
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).toBeTruthy();
    expect(await call("list_claims_for_file", { root })).toHaveLength(0);
    const withClosed = await call("list_claims_for_file", { root, includeClosed: true });
    expect(withClosed).toHaveLength(1);
    expect(withClosed[0].status).toBe("closed");

    // Unpinning removes it outright.
    const removed = await call("unpin_claim", { root, id: pinned.id });
    expect(removed.removed).toBe(pinned.id);
    expect(await call("list_claims_for_file", { root, includeClosed: true })).toHaveLength(0);

    await rm(root, { recursive: true, force: true });
  }, 20000);

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
