import { describe, expect, it, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("MCP server", () => {
  let client: Client;

  afterAll(async () => {
    await client?.close();
  });

  it("starts over stdio and advertises run_evaluation/score_results/generate_report tools", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(__dirname, "..", "dist", "cli.js"), "mcp"],
    });
    client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["generate_report", "run_evaluation", "score_results"]);
  }, 15000);
});
