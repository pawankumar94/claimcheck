import { readFile } from "node:fs/promises";
import type { AgentProfile } from "../types.js";

export async function loadAgentProfile(path: string): Promise<AgentProfile> {
  const raw = await readFile(path, "utf-8");
  const profile = JSON.parse(raw) as AgentProfile;
  validateProfile(profile, path);
  return profile;
}

export function validateProfile(profile: AgentProfile, source: string): void {
  const required: (keyof AgentProfile)[] = ["name", "command", "baseArgs", "policyArgs", "output"];
  for (const key of required) {
    if (profile[key] === undefined) {
      throw new Error(`agent profile ${source} is missing required field "${String(key)}"`);
    }
  }
  if (profile.output.type === "json" && !profile.output.resultField) {
    throw new Error(`agent profile ${source}: output.type is "json" but output.resultField is not set`);
  }
  // An empty policyArgs is legitimate. A policy can be realized by the
  // workspace (TasksDoc.policy_overlays) or by the prompt
  // (Task.prompt_by_policy) rather than by flags, and in those designs every
  // arm must be invoked *identically* -- differing flags would be a second
  // variable. Rejecting {} here forced such profiles to carry a dummy entry;
  // runEvaluation already decides when a missing entry is allowed.
}

/** Dot-path field access, e.g. "usage.total_cost_usd" against a parsed JSON object. */
export function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export interface BuiltCommand {
  command: string;
  args: string[];
  /** Set when promptPlacement is "stdin" -- caller must write this to the child's stdin. */
  stdin?: string;
}

/**
 * Turns (profile, policy, prompt) into a concrete command line. This is the
 * one place policy names get resolved into an agent's actual flag syntax --
 * everything upstream of this stays agent-neutral.
 */
export function buildInvocation(
  profile: AgentProfile,
  policyName: string,
  prompt: string,
  opts: { allowMissingPolicyArgs?: boolean } = {}
): BuiltCommand {
  // A policy carried entirely by the prompt (how many tools are described, how
  // much context is supplied) needs no flags from any agent. The caller says so
  // explicitly; otherwise a missing entry is a typo and must still be loud.
  const policyArgs = profile.policyArgs[policyName] ?? (opts.allowMissingPolicyArgs ? [] : undefined);
  if (!policyArgs) {
    const available = Object.keys(profile.policyArgs).join(", ");
    throw new Error(
      `agent "${profile.name}" has no policyArgs entry for policy "${policyName}" (available: ${available})`
    );
  }

  const placement = profile.promptPlacement ?? "after-base";
  const extra = profile.extraArgs ?? [];

  if (placement === "stdin") {
    return { command: profile.command, args: [...profile.baseArgs, ...policyArgs, ...extra], stdin: prompt };
  }
  if (placement === "end") {
    return { command: profile.command, args: [...profile.baseArgs, ...policyArgs, ...extra, prompt] };
  }
  return { command: profile.command, args: [...profile.baseArgs, prompt, ...policyArgs, ...extra] };
}
