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
  if (Object.keys(profile.policyArgs).length === 0) {
    throw new Error(`agent profile ${source} declares no policyArgs -- it can't implement any policy`);
  }
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
export function buildInvocation(profile: AgentProfile, policyName: string, prompt: string): BuiltCommand {
  const policyArgs = profile.policyArgs[policyName];
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
