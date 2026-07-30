export type SortDirection = "asc" | "desc";

const compareValues = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
};

/**
 * Sort a JSON value for the "Sort" tool:
 * - array of objects + a field: sorts rows by that field's value
 * - array of primitives: sorts the values directly
 * - plain object: sorts its keys alphabetically (recursing one level is not
 *   attempted — object key order rarely matters beyond the top level)
 */
export function sortJsonValue(value: unknown, direction: SortDirection, field?: string): unknown {
  const flip = direction === "desc" ? -1 : 1;

  if (Array.isArray(value)) {
    const copy = [...value];
    copy.sort((a, b) => {
      const av = field && a !== null && typeof a === "object" ? (a as Record<string, unknown>)[field] : a;
      const bv = field && b !== null && typeof b === "object" ? (b as Record<string, unknown>)[field] : b;
      return compareValues(av, bv) * flip;
    });
    return copy;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => compareValues(a, b) * flip);
    return Object.fromEntries(entries);
  }

  return value;
}

/** Union of object keys across an array's elements — used to populate the sort-by-field picker. */
export function arrayObjectFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const fields = new Set<string>();
  for (const item of value) {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      Object.keys(item).forEach((key) => fields.add(key));
    }
  }
  return Array.from(fields);
}
