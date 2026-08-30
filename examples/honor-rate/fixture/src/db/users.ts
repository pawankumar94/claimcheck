import { query } from "./index.js";

export function findUser(id: string) {
  return query<{ id: string; email: string }>("SELECT id, email FROM users WHERE id = ?", [id])[0];
}

export function countUsers() {
  return query<{ n: number }>("SELECT COUNT(*) AS n FROM users")[0]?.n ?? 0;
}
