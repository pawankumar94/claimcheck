import groupBy from "lodash/groupBy.js";

// Older module. Still shipped.
export function groupByRegion(rows: Array<{ region: string }>) {
  return groupBy(rows, "region");
}
