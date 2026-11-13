import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import { normalizeDatabaseUrl } from "./src/database/database-url.util";

/**
 * Minimal .env loader so drizzle-kit works identically under Bun and Node without
 * depending on an extra runtime package.
 */
function loadEnvFile(path = ".env"): void {
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) value = value.slice(1, -1);

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const migrationUrl = normalizeDatabaseUrl(process.env["DB_URL"]);

export default defineConfig({
  schema: "./src/database/schemas/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: migrationUrl
    ? { url: migrationUrl }
    : {
        host: process.env["DB_HOST"] ?? "localhost",
        port: Number(process.env["DB_PORT"] ?? 5432),
        user: process.env["DB_USERNAME"] ?? "postgres",
        password: process.env["DB_PASSWORD"] ?? "postgrespassword",
        database:
          process.env["DB_NAME"] ??
          process.env["DB_DATABASE"] ??
          "greenroots_farm",
        ssl: false,
      },
  introspect: {
    casing: "camel",
  },
  verbose: true,
});
