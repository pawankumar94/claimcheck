import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TARGETS, detectTargets, findTarget, installTarget, loadTemplate } from "../src/core/install.js";

let root: string;
let body: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "claimcheck-proj-"));
  body = await loadTemplate();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("template", () => {
  it("ships with the package and carries the core discipline", async () => {
    // Collapse wrapping so assertions test the prose, not the line breaks.
    const flat = body.replace(/\s+/g, " ");
    expect(flat).toMatch(/Freeze the keys/);
    expect(flat).toMatch(/not \*?distinguishable/i);
    expect(flat).toMatch(/Underpowered is not equivalent/);
    expect(flat).toMatch(/Do not compare across agents/);
  });
});

describe("detectTargets", () => {
  it("detects only frameworks the project actually uses", async () => {
    await mkdir(join(root, ".cursor"), { recursive: true });
    const ids = detectTargets(root).map((t) => t.id);
    expect(ids).toContain("cursor");
    expect(ids).not.toContain("windsurf");
  });

  it("returns nothing for an empty project rather than guessing", () => {
    expect(detectTargets(root)).toEqual([]);
  });
});

describe("installTarget", () => {
  it("writes each framework's file to its own expected path", async () => {
    for (const target of TARGETS.filter((t) => !t.append)) {
      const outcome = await installTarget(target, root, body);
      expect(outcome.action).toBe("created");
      const written = await readFile(join(root, target.path), "utf-8");
      expect(written).toContain("claimcheck: measuring agent configuration changes");
    }
  });

  it("renders framework-specific frontmatter but an identical body", async () => {
    await installTarget(findTarget("cursor"), root, body);
    await installTarget(findTarget("agent-skills"), root, body);

    const cursor = await readFile(join(root, ".cursor/rules/claimcheck.mdc"), "utf-8");
    const skill = await readFile(join(root, "skills/claimcheck/SKILL.md"), "utf-8");

    expect(cursor).toMatch(/^---\ndescription: .*\nalwaysApply: false\n---/);
    expect(skill).toMatch(/^---\nname: claimcheck\n/);
    // Guidance must not drift between frameworks.
    expect(cursor.split("---\n\n")[1]).toBe(skill.split("---\n\n")[1]);
  });

  it("is idempotent -- reinstalling does not duplicate an appended block", async () => {
    const target = findTarget("agents-md");
    await writeFile(join(root, "AGENTS.md"), "# Mine\n\nMy own rules.\n");

    await installTarget(target, root, body);
    await installTarget(target, root, body);

    const content = await readFile(join(root, "AGENTS.md"), "utf-8");
    expect(content.match(/claimcheck:start/g)).toHaveLength(1);
    expect(content.match(/claimcheck:end/g)).toHaveLength(1);
  });

  it("never destroys content the user wrote in a shared file", async () => {
    const target = findTarget("agents-md");
    await writeFile(join(root, "AGENTS.md"), "# Mine\n\nDo not delete this line.\n");

    await installTarget(target, root, body);
    await installTarget(target, root, body);

    const content = await readFile(join(root, "AGENTS.md"), "utf-8");
    expect(content).toContain("Do not delete this line.");
    expect(content.indexOf("Do not delete this line.")).toBeLessThan(content.indexOf("claimcheck:start"));
  });

  it("creates a shared file with just the fenced block when none exists", async () => {
    await installTarget(findTarget("agents-md"), root, body);
    const content = await readFile(join(root, "AGENTS.md"), "utf-8");
    expect(content.startsWith("<!-- claimcheck:start -->")).toBe(true);
  });

  it("reports 'skipped' when an owned file is already byte-identical", async () => {
    const target = findTarget("cursor");
    await installTarget(target, root, body);
    expect((await installTarget(target, root, body)).action).toBe("skipped");
  });

  it("rejects an unknown target by name instead of silently doing nothing", () => {
    expect(() => findTarget("emacs")).toThrow(/Unknown target/);
  });
});

describe("skill-host targets", () => {
  it("emits the version field Hermes requires but other hosts omit", async () => {
    await installTarget(findTarget("hermes"), root, body);
    await installTarget(findTarget("claude-code"), root, body);

    const hermes = await readFile(join(root, ".hermes/skills/claimcheck/SKILL.md"), "utf-8");
    const claude = await readFile(join(root, ".claude/skills/claimcheck/SKILL.md"), "utf-8");

    expect(hermes).toMatch(/^---\nname: claimcheck\ndescription: .*\nversion: 1\.0\.0\n---/);
    expect(claude).not.toContain("version:");
    // Guidance itself must still be identical across hosts.
    expect(hermes.split("---\n\n")[1]).toBe(claude.split("---\n\n")[1]);
  });

  it("supports the generic cross-agent .agents/skills location", async () => {
    const outcome = await installTarget(findTarget("agents-skills"), root, body);
    expect(outcome.action).toBe("created");
    expect(await readFile(join(root, ".agents/skills/claimcheck/SKILL.md"), "utf-8")).toContain("Freeze the keys");
  });
});
