import { readFile } from "node:fs/promises";
import type { Policy } from "../types.js";

export async function loadPolicy(path: string): Promise<Policy> {
  const raw = await readFile(path, "utf-8");
  const policy = JSON.parse(raw) as Policy;
  if (!policy.name) throw new Error(`${path} does not look like a policy: missing "name"`);
  return policy;
}
