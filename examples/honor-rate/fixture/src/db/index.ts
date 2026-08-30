/** Every SQL string in this app lives under src/db/. Nothing else opens a query. */
export function query<T>(sql: string, params: unknown[] = []): T[] {
  void sql;
  void params;
  return [] as T[];
}
