/**
 * Runtime environments supported by the API process.
 *
 * Kept as a named constant so the Zod schema and future tooling share one
 * source instead of duplicating the literal union inline.
 */
export const NODE_ENVIRONMENTS = ["development", "production", "test"] as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];
