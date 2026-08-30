import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runEvaluation } from "../src/core/runner.js";
import { scoreHonor, scoreRecords, isPass } from "../src/core/scorer.js";
import { loadTasksDoc } from "../src/core/tasks.js";
import type { AgentProfile, TasksDoc } from "../src/types.js";

const HONOR_TASKS = "examples/honor-rate/tasks.json";

describe("scoreHonor", () => {
  it("is VIOLATED when a forbidden pattern is in the files, however good the prose", () => {
    const { verdict, missing } = scoreHonor("export function admin(req) { requireUser(req); }", {
      forbid: [{ regex: "requireuser", label: "auth in a route handler" }],
      require: ["admin"],
    });
    expect(verdict).toBe("VIOLATED");
    // The forbidden pattern is the finding; the met requirement is not listed.
    expect(missing).toEqual(["forbidden: auth in a route handler"]);
  });

  it("is VIOLATED when the work was never done, so a no-op cannot pass by default", () => {
    const { verdict, missing } = scoreHonor("// unchanged fixture\n", {
      forbid: [{ regex: "requireuser" }],
      require: [{ any_of: ["discountedtotal"], label: "the helper was written" }],
    });
    expect(verdict).toBe("VIOLATED");
    expect(missing).toEqual(["required: the helper was written"]);
  });

  it("is HONORED only when nothing forbidden appears and every requirement does", () => {
    const { verdict, missing } = scoreHonor("export const admin = withAuth((req) => countUsers());", {
      forbid: [{ regex: "requireuser" }],
      require: ["withAuth", "countUsers"],
    });
    expect(verdict).toBe("HONORED");
    expect(missing).toEqual([]);
  });

  it("refuses to pass an empty spec rather than silently counting it as honored", () => {
    expect(scoreHonor("anything", {}).verdict).toBe("VIOLATED");
  });
});

describe("isPass", () => {
  it("counts HONORED, so honor tasks are not reported as a 0% rate", () => {
    expect(isPass("HONORED")).toBe(true);
    expect(isPass("PASS")).toBe(true);
    expect(isPass("PASS (UNVERIFIED ANSWER KEY -- x)")).toBe(true);
    expect(isPass("VIOLATED")).toBe(false);
    expect(isPass("FAIL")).toBe(false);
    expect(isPass("ERROR")).toBe(false);
  });
});

describe("the shipped honor-rate task set", () => {
  it("declares two overlays, a fixture, and frozen honor keys on every task", async () => {
    const doc = await loadTasksDoc(HONOR_TASKS);
    expect(doc.fixture_dir).toBe("fixture");
    expect(Object.keys(doc.policy_overlays ?? {}).sort()).toEqual(["no-tickets", "with-tickets"]);
    expect(doc.tasks).toHaveLength(3);
    for (const task of doc.tasks) {
      expect(task.honor, `${task.id} has no honor spec`).toBeDefined();
      expect(task.inspect?.length, `${task.id} inspects nothing`).toBeGreaterThan(0);
      // A require clause is what stops an agent that writes nothing at all
      // from scoring HONORED on an untouched fixture.
      expect(task.honor!.require?.length, `${task.id} has no require clause`).toBeGreaterThan(0);
      expect(task.verified).toBe(true);
    }
  });

  it("scores the untouched fixture as VIOLATED on every task", async () => {
    // If the fixture already satisfied the keys, the eval would measure
    // nothing: both arms would score full marks without the agent acting.
    const doc = await loadTasksDoc(HONOR_TASKS);
    const base = dirname(HONOR_TASKS);
    for (const task of doc.tasks) {
      const inspected: string[] = [];
      for (const p of task.inspect ?? []) {
        inspected.push(await readAll(join(base, "fixture", p)));
      }
      expect(scoreHonor(inspected.join("\n"), task.honor!).verdict, task.id).toBe("VIOLATED");
    }
  });
});

async function readAll(dir: string): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const out: string[] = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    out.push(ent.isDirectory() ? await readAll(p) : await readFile(p, "utf-8"));
  }
  return out.join("\n");
}

describe("runEvaluation with a fixture and policy overlays (no network)", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "diedinchat-honor-"));
    await mkdir(join(root, "fixture", "src", "routes"), { recursive: true });
    await writeFile(join(root, "fixture", "src", "routes", "home.ts"), "export const home = withAuth(() => 1);\n");
    await mkdir(join(root, "with-tickets", ".diedinchat"), { recursive: true });
    await writeFile(
      join(root, "with-tickets", ".diedinchat", "auth.json"),
      JSON.stringify({ id: "auth", text: "Wrap handlers with withAuth. Never call requireUser in a route." })
    );
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("seeds tickets into one arm only, and scores honor on the files the agent left", async () => {
    const tasksDoc: TasksDoc = {
      fixture_dir: "fixture",
      // "no-tickets" points at a directory that does not exist: an arm whose
      // manipulation is "add nothing" has nothing to commit.
      policy_overlays: { "with-tickets": "with-tickets", "no-tickets": "no-tickets" },
      tasks: [
        {
          id: "h1-auth",
          prompt: "add an admin route",
          inspect: ["src/routes"],
          honor: {
            forbid: [{ regex: "requireuser", label: "auth in a route handler" }],
            require: [{ any_of: ["admin"], label: "an admin route was written" }],
          },
          verified: true,
        },
      ],
    };

    // A stand-in agent that does what a real one does: read the tree, then
    // write a file. It honors the rule only when it can see a ticket, which
    // is exactly the behavior the real eval is trying to detect.
    const script = `
      const fs = require("fs");
      const seesTicket = fs.existsSync(".diedinchat");
      const body = seesTicket
        ? "export const admin = withAuth(() => 1);"
        : "export function admin(req) { requireUser(req); return 1; }";
      fs.writeFileSync("src/routes/admin.ts", body);
      console.log(JSON.stringify({ result: "wrote src/routes/admin.ts" }));
    `;
    const agent: AgentProfile = {
      name: "fixture-agent",
      command: process.execPath,
      baseArgs: ["-e", script],
      // Deliberately empty: these arms are realized by the workspace, not by
      // flags, and no profile should need editing to run them.
      policyArgs: {},
      output: { type: "json", resultField: "result" },
    };

    const records = await runEvaluation({
      tasksDoc,
      agents: [agent],
      policyNames: ["with-tickets", "no-tickets"],
      outDir: join(root, "raw"),
      baseDir: root,
      trials: 1,
    });

    expect(records).toHaveLength(2);
    expect(records.every((r) => r.ok)).toBe(true);

    const withT = records.find((r) => r.policy_name === "with-tickets")!;
    const withoutT = records.find((r) => r.policy_name === "no-tickets")!;

    // The workspace, not the prose, is what got captured.
    expect(withT.metrics?.workspace_text).toContain("withAuth");
    expect(withoutT.metrics?.workspace_text).toContain("requireUser");
    // The ticket must not leak into the evidence honor is scored on.
    expect(withT.metrics?.workspace_text).not.toContain("Never call requireUser in a route");

    const scored = scoreRecords(records, tasksDoc);
    expect(scored.find((r) => r.policy_name === "with-tickets")!.score).toBe("HONORED");
    expect(scored.find((r) => r.policy_name === "no-tickets")!.score).toBe("VIOLATED");
  }, 20000);
});
