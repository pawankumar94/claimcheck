import type { Request } from "../http.js";
import { withAuth } from "../middleware.js";
import { findUser } from "../db/users.js";

export const settings = withAuth((req: Request) => {
  return JSON.stringify(findUser(req.query.id ?? ""));
});
