import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { invokeAgent } from "../src/agents/invoke.js";
import type { AgentProfile } from "../src/types.js";

/** A fake "agent" driven straight through node, so tests don't need any real coding-agent CLI installed. */
function nodeEchoProfile(script: string, output: AgentProfile["output"]): AgentProfile {
  return {
    name: "fake-agent",
    command: process.execPath,
    baseArgs: ["-e", script],
    policyArgs: { curated: [], full: [] },
    output,
    timeoutMs: 5000,
  };
}

describe("invokeAgent", () => {
  it("parses JSON stdout and extracts result/cost/session fields by path", async () => {
    const script = `console.log(JSON.stringify({ result: process.argv[1], usage: { total_cost_usd: 0.042 }, session_id: "s-1" }))`;
    const profile = nodeEchoProfile(script, {
      type: "json",
      resultField: "result",
      costField: "usage.total_cost_usd",
      sessionIdField: "session_id",
    });
    const res = await invokeAgent(profile, "curated", "MIT license", tmpdir());
    expect(res.ok).toBe(true);
    expect(res.resultText).toBe("MIT license");
    expect(res.cost).toBe(0.042);
    expect(res.sessionId).toBe("s-1");
  });

  it("treats plain stdout as the result when output.type is text", async () => {
    const script = `console.log("the answer is " + process.argv[1])`;
    const profile = nodeEchoProfile(script, { type: "text" });
    const res = await invokeAgent(profile, "curated", "42", tmpdir());
    expect(res.ok).toBe(true);
    expect(res.resultText).toBe("the answer is 42");
  });

  it("reports non-JSON stdout as a harness error when json output was expected", async () => {
    const script = `console.log("not json")`;
    const profile = nodeEchoProfile(script, { type: "json", resultField: "result" });
    const res = await invokeAgent(profile, "curated", "x", tmpdir());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/non-JSON stdout/);
  });

  it("reports a non-zero exit code as an error, including stderr", async () => {
    const script = `console.error("boom"); process.exit(1)`;
    const profile = nodeEchoProfile(script, { type: "text" });
    const res = await invokeAgent(profile, "curated", "x", tmpdir());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("boom");
  });

  it("surfaces the resultField from stdout JSON even on a non-zero exit, not just the bare exit code", async () => {
    // Mirrors what a live `claude --bare -p ... --output-format json` does on an auth
    // failure: exit code 1, empty stderr, but a structured, informative payload on stdout.
    const script = `console.log(JSON.stringify({ result: "Not logged in · Please run /login", total_cost_usd: 0 })); process.exit(1)`;
    const profile = nodeEchoProfile(script, { type: "json", resultField: "result", costField: "total_cost_usd" });
    const res = await invokeAgent(profile, "curated", "x", tmpdir());
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Not logged in");
  });

  it("kills the process and reports a timeout error when it runs too long", async () => {
    const script = `setTimeout(() => {}, 10000)`;
    const profile: AgentProfile = { ...nodeEchoProfile(script, { type: "text" }), timeoutMs: 150 };
    const res = await invokeAgent(profile, "curated", "x", tmpdir());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/timeout/);
  }, 10000);

  it("writes the prompt to stdin when promptPlacement is stdin", async () => {
    const script = `let d=""; process.stdin.on("data", c => d += c); process.stdin.on("end", () => console.log("got: " + d));`;
    const profile: AgentProfile = { ...nodeEchoProfile(script, { type: "text" }), promptPlacement: "stdin" };
    const res = await invokeAgent(profile, "curated", "hello from stdin", tmpdir());
    expect(res.ok).toBe(true);
    expect(res.resultText).toBe("got: hello from stdin");
  });
});
