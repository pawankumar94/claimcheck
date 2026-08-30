export interface ConfigSchema {
  apiBase: string;
  retries: number;
  timeoutMs: number;
}

export const defaults: ConfigSchema = {
  apiBase: "https://api.acme.test",
  retries: 3,
  timeoutMs: 5000,
};
