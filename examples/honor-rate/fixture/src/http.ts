export interface Request {
  path: string;
  headers: Record<string, string | undefined>;
  query: Record<string, string>;
}
