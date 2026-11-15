/**
 * Serializes an object to a deterministic JSON string with sorted keys,
 * ensuring identical payload structures generate identical SHA-256 hashes
 * regardless of property insertion order.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === undefined) {
    return "";
  }
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJson).join(",")}]`;
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
    .join(",")}}`;
}
