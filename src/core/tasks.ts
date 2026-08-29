import { readFile } from "node:fs/promises";
import type { TasksDoc } from "../types.js";

export async function loadTasksDoc(path: string): Promise<TasksDoc> {
  const raw = await readFile(path, "utf-8");
  const doc = JSON.parse(raw) as TasksDoc;
  if (!doc.tasks || !Array.isArray(doc.tasks)) {
    throw new Error(`${path} does not look like a tasks doc: missing "tasks" array`);
  }
  return doc;
}
