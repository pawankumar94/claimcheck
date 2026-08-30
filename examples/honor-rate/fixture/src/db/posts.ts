import { query } from "./index.js";

export function listPosts(limit: number) {
  return query<{ id: string; title: string }>("SELECT id, title FROM posts LIMIT ?", [limit]);
}
