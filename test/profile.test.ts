import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInvocation, getByPath, loadAgentProfile, validateProfile } from "../src/agents/profile.js";
import type { AgentProfile } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const claudeCodeProfile: AgentProfile = {
  name: "claude-code",
  command: "claude",
  baseArgs: ["--bare", "-p"],
  policyArgs: {
    curated: ["--allowedTools", "Read", "--permission-mode", "dontAsk"],
    full: ["--allowedTools", "Bash,Read,Edit", "--permission-mode", "dontAsk"],
  },
  extraArgs: ["--output-format", "json"],
  output: { type: "json", resultField: "result" },
};

describe("buildInvocation", () => {
  it("places the prompt right after baseArgs by default", () => {
    const { command, args } = buildInvocation(claudeCodeProfile, "curated", "what license?");
    expect(command).toBe("claude");
    expect(args).toEqual([
      "--bare",
      "-p",
      "what license?",
      "--allowedTools",
      "Read",
      "--permission-mode",
      "dontAsk",
      "--output-format",
      "json",
    ]);
  });

  it("resolves the right policyArgs for a different policy on the same profile", () => {
    const { args } = buildInvocation(claudeCodeProfile, "full", "what license?");
    expect(args).toContain("Bash,Read,Edit");
  });

  it("throws a clear error for an unknown policy", () => {
    expect(() => buildInvocation(claudeCodeProfile, "nonexistent", "x")).toThrow(/no policyArgs entry/);
  });

  it("supports appending the prompt at the end", () => {
    const profile: AgentProfile = { ...claudeCodeProfile, promptPlacement: "end" };
    const { args } = buildInvocation(profile, "curated", "PROMPT");
    expect(args[args.length - 1]).toBe("PROMPT");
  });

  it("supports passing the prompt via stdin instead of args", () => {
    const profile: AgentProfile = { ...claudeCodeProfile, promptPlacement: "stdin" };
    const { args, stdin } = buildInvocation(profile, "curated", "PROMPT");
    expect(args).not.toContain("PROMPT");
    expect(stdin).toBe("PROMPT");
  });
});

describe("validateProfile", () => {
  it("rejects a profile missing required fields", () => {
    const broken = { name: "x" } as unknown as AgentProfile;
    expect(() => validateProfile(broken, "test.json")).toThrow(/missing required field/);
  });

  it("rejects a json output type with no resultField", () => {
    const broken: AgentProfile = { ...claudeCodeProfile, output: { type: "json" } };
    expect(() => validateProfile(broken, "test.json")).toThrow(/resultField/);
  });

  it("rejects a profile with an empty policyArgs map", () => {
    const broken: AgentProfile = { ...claudeCodeProfile, policyArgs: {} };
    expect(() => validateProfile(broken, "test.json")).toThrow(/no policyArgs/);
  });

  it("accepts a well-formed profile", () => {
    expect(() => validateProfile(claudeCodeProfile, "test.json")).not.toThrow();
  });
});

describe("shipped claude-code profile", () => {
  it("loads and validates, and builds the invocation confirmed against a live claude 2.1.220 install", async () => {
    const profile = await loadAgentProfile(join(__dirname, "..", "profiles", "claude-code.json"));
    expect(profile.verified).toBe(true);

    const { command, args } = buildInvocation(profile, "curated", "what license?");
    expect(command).toBe("claude");
    // Order confirmed live: --bare -p <prompt> --allowedTools ... --permission-mode ... --output-format json
    expect(args[0]).toBe("--bare");
    expect(args[1]).toBe("-p");
    expect(args[2]).toBe("what license?");
    expect(args).toContain("--allowedTools");
    expect(args).toContain("--permission-mode");
    expect(args.slice(-2)).toEqual(["--output-format", "json"]);
  });
});

describe("getByPath", () => {
  it("reads a nested field by dot-path", () => {
    expect(getByPath({ usage: { total_cost_usd: 0.5 } }, "usage.total_cost_usd")).toBe(0.5);
  });

  it("returns undefined for a missing path", () => {
    expect(getByPath({ a: 1 }, "b.c")).toBeUndefined();
  });
});

describe("prompt-only policies", () => {
  it("still rejects an unknown policy by default, so typos stay loud", () => {
    expect(() => buildInvocation(claudeCodeProfile, "typo", "p")).toThrow(/no policyArgs entry/);
  });

  it("allows a policy with no flags when the caller says it is carried by the prompt", () => {
    const { args } = buildInvocation(claudeCodeProfile, "many-tools", "PROMPT", {
      allowMissingPolicyArgs: true,
    });
    // No policy flags contributed, but the invocation is otherwise intact.
    expect(args).toContain("PROMPT");
    expect(args).toContain("--output-format");
    expect(args).not.toContain("--allowedTools");
  });
});
