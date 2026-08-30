import { config } from "./config.js";
import { home } from "./routes/home.js";

export function start() {
  return { base: config.apiBase, home: home() };
}
