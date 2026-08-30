import type { Request } from "./http.js";

/**
 * The only place a session is checked. Route handlers receive an already
 * authenticated request and must not re-check.
 */
export function requireUser(req: Request): void {
  if (!req.headers.cookie?.includes("sid=")) {
    throw new Error("unauthenticated");
  }
}

export function withAuth(handler: (req: Request) => string) {
  return (req: Request) => {
    requireUser(req);
    return handler(req);
  };
}
