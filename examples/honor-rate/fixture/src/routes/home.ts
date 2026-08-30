import type { Request } from "../http.js";
import { withAuth } from "../middleware.js";
import { listPosts } from "../db/posts.js";

export const home = withAuth((req: Request) => {
  return JSON.stringify(listPosts(20));
});
