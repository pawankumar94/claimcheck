export interface ConfigSchema {
  apiBase: string;
  timeoutMs: number;
}

export const defaults: ConfigSchema = {
  apiBase: "https://api.example.com",
  timeoutMs: 5000,
};
