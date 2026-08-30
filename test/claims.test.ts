import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkClaim,
  closeClaim,
  makeClaimId,
  pinClaim,
  statusClaims,
  ticketCoversPath,
  unpinClaim,
} from "../src/core/claims.js";
import type { FileClaim } from "../src/types.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "diedinchat-claims-"));
  await mkdir(join(root, "src", "routes"), { recursive: true });
  await writeFile(join(root, "src", "middleware.ts"), "export function auth() { return true }\n");
  await writeFile(join(root, "src", "routes", "home.ts"), "export const home = 1\n");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("makeClaimId", () => {
  it("slugs the assertion text", () => {
    expect(makeClaimId("Auth only goes through middleware.ts!")).toBe(
      "auth-only-goes-through-middleware-ts"
    );
  });
});

describe("pinClaim", () => {
  it("writes a ticket under .diedinchat and records file hashes", async () => {
    const { claim, action, path } = await pinClaim({
      root,
      text: "Auth only goes through src/middleware.ts.",
      files: ["src/middleware.ts"],
      evidence: ["export function auth"],
    });
    expect(action).toBe("created");
    expect(claim.status).toBe("supported");
    expect(claim.hashes["src/middleware.ts"]).toMatch(/^[a-f0-9]{64}$/);
    const onDisk = JSON.parse(await readFile(path, "utf-8")) as FileClaim;
    expect(onDisk.id).toBe(claim.id);
  });

  it("refuses a path that is not in the project", async () => {
    await expect(
      pinClaim({ root, text: "nope", files: ["src/does-not-exist.ts"] })
    ).rejects.toThrow(/does not exist/);
  });

  it("refuses a path that escapes the project", async () => {
    await expect(pinClaim({ root, text: "nope", files: ["../secret"] })).rejects.toThrow(/escapes/);
  });

  it("updates an existing id instead of duplicating it", async () => {
    await pinClaim({ root, text: "one", files: ["src/middleware.ts"], id: "auth-surface" });
    const second = await pinClaim({
      root,
      text: "Auth only through middleware.",
      files: ["src/middleware.ts"],
      id: "auth-surface",
    });
    expect(second.action).toBe("updated");
    const listed = await statusClaims(root);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.claim.text).toMatch(/Auth only through middleware/);
  });
});

describe("status and stale", () => {
  it("lists a ticket against the file it was pinned to, not a sibling", async () => {
    await pinClaim({
      root,
      text: "Auth only through middleware.",
      files: ["src/middleware.ts"],
      id: "auth-surface",
    });
    const onFile = await statusClaims(root, "src/middleware.ts");
    const onOther = await statusClaims(root, "src/routes/home.ts");
    expect(onFile.map((e) => e.claim.id)).toEqual(["auth-surface"]);
    expect(onOther).toEqual([]);
  });

  it("a directory pin matches a file under it", async () => {
    const claim: FileClaim = {
      id: "x",
      text: "t",
      files: ["src/routes"],
      evidence: [],
      status: "open",
      hashes: {},
      created_at: "",
      updated_at: "",
    };
    expect(ticketCoversPath(claim, "src/routes/home.ts")).toBe(true);
    expect(ticketCoversPath(claim, "src/middleware.ts")).toBe(false);
  });

  it("flips to stale when a cited file changes, with no LLM", async () => {
    await pinClaim({
      root,
      text: "Auth only through middleware.",
      files: ["src/middleware.ts"],
      evidence: ["export function auth"],
      id: "auth-surface",
    });
    await writeFile(join(root, "src", "middleware.ts"), "export function auth() { return false }\n");
    const [evaled] = await statusClaims(root);
    expect(evaled!.status).toBe("stale");
    expect(evaled!.changed).toContain("src/middleware.ts");
  });

  it("restores supported when the file is restored and evidence still holds", async () => {
    await pinClaim({
      root,
      text: "Auth only through middleware.",
      files: ["src/middleware.ts"],
      evidence: ["export function auth"],
      id: "auth-surface",
    });
    await writeFile(join(root, "src", "middleware.ts"), "changed\n");
    expect((await statusClaims(root))[0]!.status).toBe("stale");
    await writeFile(join(root, "src", "middleware.ts"), "export function auth() { return true }\n");
    expect((await statusClaims(root))[0]!.status).toBe("supported");
  });

  it("stales a directory ticket when a new file appears under it", async () => {
    await pinClaim({
      root,
      text: "routes stay free of auth checks",
      files: ["src/routes"],
      id: "routes-no-auth",
    });
    await writeFile(join(root, "src", "routes", "admin.ts"), "export const admin = 1\n");
    const [evaled] = await statusClaims(root, "src/routes");
    expect(evaled!.status).toBe("stale");
    expect(evaled!.changed).toContain("src/routes/admin.ts");
  });
});

describe("check / contradicted", () => {
  it("marks contradicted when frozen evidence is gone but hashes match", async () => {
    await pinClaim({
      root,
      text: "home route exists",
      files: ["src/routes/home.ts"],
      evidence: ["export const home"],
      id: "home-route",
    });
    // Same bytes length isn't required — rewrite with different content but we
    // must keep the hash matching, so this is: pin, then manually edit the
    // stored hash to the new file's hash after stripping the evidence phrase.
    await writeFile(join(root, "src", "routes", "home.ts"), "export const other = 1\n");
    // File changed → stale, not contradicted. Re-pin hashes by writing the
    // ticket hashes to the new content without updating evidence.
    const { claim } = await pinClaim({
      root,
      text: "home route exists",
      files: ["src/routes/home.ts"],
      evidence: ["export const home"],
      id: "home-route",
    });
    // pin recomputes hashes AND re-evaluates, so this pin against missing
    // evidence should already be contradicted.
    expect(claim.status).toBe("contradicted");
    const checked = await checkClaim(root, "home-route");
    expect(checked.status).toBe("contradicted");
    expect(checked.missingEvidence.length).toBeGreaterThan(0);
  });

  it("open when files are unchanged and no evidence was registered", async () => {
    const { claim } = await pinClaim({
      root,
      text: "Do not put auth in route handlers.",
      files: ["src/routes"],
    });
    expect(claim.status).toBe("open");
  });
});

describe("close and unpin", () => {
  it("hides closed tickets by default and includes them with --all semantics", async () => {
    await pinClaim({ root, text: "Auth only through middleware.", files: ["src/middleware.ts"], id: "auth" });
    const closed = await closeClaim(root, "auth");
    expect(closed.status).toBe("closed");
    expect(closed.claim.closed_at).toBeTruthy();
    expect(await statusClaims(root)).toEqual([]);
    const all = await statusClaims(root, undefined, true);
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe("closed");
  });

  it("re-pinning a closed id reopens it", async () => {
    await pinClaim({ root, text: "old", files: ["src/middleware.ts"], id: "auth" });
    await closeClaim(root, "auth");
    const { claim } = await pinClaim({ root, text: "new", files: ["src/middleware.ts"], id: "auth" });
    expect(claim.status).toBe("open");
    expect(claim.closed_at).toBeUndefined();
    expect(await statusClaims(root)).toHaveLength(1);
  });

  it("unpins exactly one ticket and refuses unknown ids", async () => {
    await pinClaim({ root, text: "one", files: ["src/middleware.ts"], id: "one" });
    await pinClaim({ root, text: "two", files: ["src/routes"], id: "two" });
    await unpinClaim(root, "one");
    expect((await statusClaims(root)).map((entry) => entry.claim.id)).toEqual(["two"]);
    await expect(unpinClaim(root, "missing")).rejects.toThrow(/No claim/);
  });
});
