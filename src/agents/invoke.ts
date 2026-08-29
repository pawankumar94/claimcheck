import { spawn } from "node:child_process";
import type { AgentProfile, InvocationResult } from "../types.js";
import { buildInvocation, getByPath } from "./profile.js";

const DEFAULT_TIMEOUT_MS = 300_000;

export function invokeAgent(
  profile: AgentProfile,
  policyName: string,
  prompt: string,
  cwd: string,
  opts: { allowMissingPolicyArgs?: boolean } = {}
): Promise<InvocationResult> {
  const { command, args, stdin } = buildInvocation(profile, policyName, prompt, opts);
  const timeoutMs = profile.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: InvocationResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, latencyMs: Date.now() - start, error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (err) => {
      clearTimeout(timer);
      finish({ ok: false, latencyMs: Date.now() - start, error: `spawn failed: ${err.message}` });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      if (code !== 0) {
        // Some agents (Claude Code included) exit non-zero on a harness-level
        // failure (e.g. not authenticated) while still emitting a structured,
        // informative payload on stdout -- prefer that over a bare exit code
        // when it parses, so `error` says *what* failed, not just *that* it did.
        const detail = tryExtractErrorDetail(profile, stdout);
        const fallback = stderr.trim() || `exit code ${code}`;
        finish({ ok: false, latencyMs, error: detail ? `${fallback}: ${detail}` : fallback, rawStdout: stdout });
        return;
      }
      finish(parseOutput(profile, stdout, latencyMs));
    });

    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

function tryExtractErrorDetail(profile: AgentProfile, stdout: string): string | null {
  if (profile.output.type !== "json" || !profile.output.resultField) return null;
  try {
    const payload = JSON.parse(stdout);
    const detail = getByPath(payload, profile.output.resultField);
    return typeof detail === "string" && detail.trim() ? detail.trim() : null;
  } catch {
    return null;
  }
}

function parseOutput(profile: AgentProfile, stdout: string, latencyMs: number): InvocationResult {
  if (profile.output.type === "text") {
    return { ok: true, latencyMs, resultText: stdout.trim(), cost: null, sessionId: null, rawStdout: stdout };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch (e) {
    return {
      ok: false,
      latencyMs,
      error: `non-JSON stdout: ${(e as Error).message}`,
      rawStdout: stdout,
    };
  }

  const resultField = profile.output.resultField!;
  const resultText = getByPath(payload, resultField);
  const cost = profile.output.costField ? getByPath(payload, profile.output.costField) : null;
  const sessionId = profile.output.sessionIdField ? getByPath(payload, profile.output.sessionIdField) : null;

  return {
    ok: true,
    latencyMs,
    resultText: typeof resultText === "string" ? resultText : JSON.stringify(resultText ?? ""),
    cost: typeof cost === "number" ? cost : null,
    sessionId: typeof sessionId === "string" ? sessionId : null,
    rawStdout: stdout,
  };
}
