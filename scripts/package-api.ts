import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface PackageManifest {
  name?: string;
  version?: string;
  private?: boolean;
  type?: string;
  catalog?: Record<string, string>;
  dependencies?: Record<string, string>;
}

const DEFAULT_OUT_DIR = "/tmp/greenroots-api-deploy";

function parseOutDir(argv: string[]): string {
  const outIndex = argv.indexOf("--out");
  if (outIndex !== -1) {
    const candidate = argv[outIndex + 1];
    if (!candidate) {
      throw new Error("--out requires a directory path");
    }
    return resolve(candidate);
  }
  return resolve(DEFAULT_OUT_DIR);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function main(): void {
  const repoRoot = resolve(import.meta.dirname, "..");
  const outDir = parseOutDir(process.argv.slice(2));

  const rootPkg = readJson<PackageManifest>(resolve(repoRoot, "package.json"));
  const apiPkg = readJson<PackageManifest>(
    resolve(repoRoot, "apps/api/package.json"),
  );
  const catalog = rootPkg.catalog ?? {};
  const apiDeps = apiPkg.dependencies ?? {};

  const resolvedDeps: Record<string, string> = {};
  for (const [pkgName, version] of Object.entries(apiDeps)) {
    if (pkgName === "@greenroots/shared") {
      resolvedDeps[pkgName] = "file:./vendor/shared";
      continue;
    }
    if (version === "catalog:") {
      const catalogVersion = catalog[pkgName];
      if (!catalogVersion) {
        throw new Error(`Missing catalog entry for ${pkgName}`);
      }
      resolvedDeps[pkgName] = catalogVersion;
      continue;
    }
    if (version.startsWith("workspace:")) {
      throw new Error(`Unsupported workspace dependency: ${pkgName}`);
    }
    resolvedDeps[pkgName] = version;
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(resolve(outDir, "vendor/shared"), { recursive: true });

  cpSync(resolve(repoRoot, "apps/api/dist"), resolve(outDir, "dist"), {
    recursive: true,
  });
  cpSync(
    resolve(repoRoot, "packages/shared/package.json"),
    resolve(outDir, "vendor/shared/package.json"),
  );
  cpSync(
    resolve(repoRoot, "packages/shared/src"),
    resolve(outDir, "vendor/shared/src"),
    { recursive: true },
  );

  const deployManifest = {
    name: apiPkg.name ?? "@greenroots/api",
    version: apiPkg.version ?? "0.0.0",
    private: true,
    type: apiPkg.type ?? "module",
    scripts: {
      start: "bun dist/main.js",
    },
    dependencies: resolvedDeps,
  };

  writeFileSync(
    resolve(outDir, "package.json"),
    `${JSON.stringify(deployManifest, null, 2)}\n`,
  );

  const installResult = spawnSync(
    "bun",
    ["install", "--production", "--linker=hoisted", "--no-save"],
    {
      cwd: outDir,
      stdio: "inherit",
    },
  );
  if (installResult.status !== 0) {
    process.exit(installResult.status ?? 1);
  }

  console.log(`Packaged API deployment artifact at ${outDir}`);
}

main();
