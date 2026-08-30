import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { PACKAGE_ROOT } from "./resolve.js";

/**
 * Tier-0 distribution: the methodology as a plain file in whatever location a
 * given framework already reads. No server, no config edit, no runtime.
 *
 * One template renders to every target, so guidance cannot drift between
 * frameworks. Frontmatter is the only per-target difference -- the body is
 * byte-identical everywhere.
 */

export interface InstallTarget {
  id: string;
  label: string;
  /** Where the file goes, relative to the project root. */
  path: string;
  /** Wraps the shared body in whatever preamble this framework expects. */
  render: (body: string) => string;
  /** Paths whose existence suggests this framework is in use. */
  detect: string[];
  /** True when the target file is a shared document we append to rather than own. */
  append?: boolean;
}

const DESCRIPTION =
  "Pin assertions about this repo to the files they cite, list tickets before editing a path, and re-check when those files change. Do not leave constraints only in chat.";

export const TARGETS: InstallTarget[] = [
  {
    id: "claude-code",
    label: "Claude Code (skill)",
    path: ".claude/skills/diedinchat/SKILL.md",
    detect: [".claude", "CLAUDE.md"],
    render: (body) => `---\nname: diedinchat\ndescription: ${DESCRIPTION}\n---\n\n${body}`,
  },
  {
    id: "agent-skills",
    label: "Agent Skills (portable SKILL.md)",
    path: "skills/diedinchat/SKILL.md",
    detect: ["skills"],
    render: (body) => `---\nname: diedinchat\ndescription: ${DESCRIPTION}\n---\n\n${body}`,
  },
  {
    id: "hermes",
    label: "Hermes Agent (project skill)",
    path: ".hermes/skills/diedinchat/SKILL.md",
    detect: [".hermes"],
    // Hermes requires a `version` field that the other skill hosts do not.
    render: (body) => `---\nname: diedinchat\ndescription: ${DESCRIPTION}\nversion: 1.0.0\n---\n\n${body}`,
  },
  {
    id: "agents-skills",
    label: "Generic .agents/skills (cross-agent)",
    path: ".agents/skills/diedinchat/SKILL.md",
    detect: [".agents"],
    render: (body) => `---\nname: diedinchat\ndescription: ${DESCRIPTION}\nversion: 1.0.0\n---\n\n${body}`,
  },
  {
    id: "cursor",
    label: "Cursor (project rule)",
    path: ".cursor/rules/diedinchat.mdc",
    detect: [".cursor"],
    render: (body) => `---\ndescription: ${DESCRIPTION}\nalwaysApply: true\n---\n\n${body}`,
  },
  {
    id: "windsurf",
    label: "Windsurf (project rule)",
    path: ".windsurf/rules/diedinchat.md",
    detect: [".windsurf"],
    render: (body) => `---\ndescription: ${DESCRIPTION}\n---\n\n${body}`,
  },
  {
    id: "cline",
    label: "Cline (project rule)",
    path: ".clinerules/diedinchat.md",
    detect: [".clinerules"],
    render: (body) => body,
  },
  {
    id: "copilot",
    label: "GitHub Copilot (instructions)",
    path: ".github/instructions/diedinchat.instructions.md",
    detect: [".github/copilot-instructions.md", ".github"],
    render: (body) => `---\napplyTo: "**"\n---\n\n${body}`,
  },
  {
    id: "agents-md",
    label: "AGENTS.md (cross-agent convention)",
    path: "AGENTS.md",
    detect: ["AGENTS.md"],
    append: true,
    render: (body) => body,
  },
];

export function findTarget(id: string): InstallTarget {
  const target = TARGETS.find((t) => t.id === id);
  if (!target) {
    throw new Error(`Unknown target "${id}". Available: ${TARGETS.map((t) => t.id).join(", ")}.`);
  }
  return target;
}

/** Targets whose framework leaves a detectable footprint in this project. */
export function detectTargets(projectRoot: string): InstallTarget[] {
  return TARGETS.filter((t) => t.detect.some((p) => existsSync(join(projectRoot, p))));
}

export async function loadTemplate(): Promise<string> {
  return readFile(join(PACKAGE_ROOT, "templates", "diedinchat.md"), "utf-8");
}

const MARKER_START = "<!-- diedinchat:start -->";
const MARKER_END = "<!-- diedinchat:end -->";

export interface InstallOutcome {
  /** Set when git ignores the written path, so the rule will not reach a teammate. */
  gitIgnored?: boolean;
  target: InstallTarget;
  path: string;
  action: "created" | "updated" | "appended" | "skipped";
}

/**
 * Writes one target. Appended sections are fenced by HTML comments so a
 * re-install replaces diedinchat's own block and never touches anything else
 * the user has written in a shared file like AGENTS.md.
 */
const execFileAsync = promisify(execFile);

/**
 * True when git is configured to ignore this path.
 *
 * This matters more than it looks. The whole premise is that the convention
 * travels with the repository, and `.claude/` and `.cursor/` are in a great
 * many .gitignore files -- this project's own included, until it was noticed.
 * Writing the rule there and saying nothing means it works for the person who
 * ran install and for nobody else, which is the exact failure diedinchat
 * exists to complain about.
 */
export async function isGitIgnored(projectRoot: string, relPath: string): Promise<boolean> {
  try {
    // check-ignore exits 0 when the path IS ignored, 1 when it is not.
    await execFileAsync("git", ["check-ignore", "-q", "--", relPath], { cwd: projectRoot });
    return true;
  } catch {
    return false;
  }
}

export async function installTarget(
  target: InstallTarget,
  projectRoot: string,
  body: string,
  opts: { force?: boolean } = {}
): Promise<InstallOutcome> {
  const fullPath = join(projectRoot, target.path);
  const rendered = target.render(body);
  const gitIgnored = await isGitIgnored(projectRoot, target.path);

  if (target.append) {
    const block = `${MARKER_START}\n${rendered}\n${MARKER_END}`;
    if (existsSync(fullPath)) {
      const current = await readFile(fullPath, "utf-8");
      if (current.includes(MARKER_START) && current.includes(MARKER_END)) {
        const next = current.replace(
          new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`),
          block
        );
        await writeFile(fullPath, next);
        return { target, path: fullPath, action: "updated", gitIgnored };
      }
      await writeFile(fullPath, `${current.trimEnd()}\n\n${block}\n`);
      return { target, path: fullPath, action: "appended", gitIgnored };
    }
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, `${block}\n`);
    return { target, path: fullPath, action: "created", gitIgnored };
  }

  const existed = existsSync(fullPath);
  if (existed && !opts.force) {
    const current = await readFile(fullPath, "utf-8");
    if (current === rendered) return { target, path: fullPath, action: "skipped", gitIgnored };
  }
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, rendered);
  return { target, path: fullPath, action: existed ? "updated" : "created", gitIgnored };
}
