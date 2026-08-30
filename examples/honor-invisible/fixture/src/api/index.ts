import { config } from "../config.js";

export function baseUrl(): string {
  return config.apiBase;
}
