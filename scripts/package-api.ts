import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface PackageManifest {
  name?: string;
  version?: string;
  private?: boolean;
  type?: string;
  catalog?: Record<string, string>;
  dependencies?: Record<string, string>;
}

const STRIP_SUFFIXES = [".d.ts", ".d.mts", ".d.cts", ".map", ".md"];

const BOOT_SCRIPT = `import { existsSync, rmSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ARCHIVE = "deploy.tar.gz";

if (existsSync(ARCHIVE)) {
  for (const dir of ["dist", "vendor", "node_modules"]) {
    rmSync(dir, { recursive: true, force: true });
  }
  const result = spawnSync("tar", ["-xzf", ARCHIVE], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  unlinkSync(ARCHIVE);
}

await import("./dist/main.js");
`;

function parseArgs(argv: string[]): {
  outDir: string;
  isTemp: boolean;
  archivePath?: string;
} {
  const outIndex = argv.indexOf("--out");
  const archiveIndex = argv.indexOf("--archive");

  let archivePath: string | undefined;
  if (archiveIndex !== -1) {
    const candidate = argv[archiveIndex + 1];
    if (!candidate) {
      throw new Error("--archive requires a file path");
    }
    archivePath = resolve(candidate);
  }

  if (outIndex !== -1) {
    const candidate = argv[outIndex + 1];
    if (!candidate) {
      throw new Error("--out requires a directory path");
    }
    return { outDir: resolve(candidate), isTemp: false, archivePath };
  }
  return {
    outDir: mkdtempSync(join(tmpdir(), "greenroots-api-deploy-")),
    isTemp: true,
    archivePath,
  };
}

function stripNonRuntimeFiles(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      stripNonRuntimeFiles(fullPath);
      continue;
    }
    if (
      entry.name.startsWith("LICENSE") ||
      STRIP_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
    ) {
      rmSync(fullPath, { force: true });
    }
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function main(): void {
  const repoRoot = resolve(import.meta.dirname, "..");
  const { outDir, isTemp, archivePath } = parseArgs(process.argv.slice(2));

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

  if (!isTemp) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(resolve(outDir, "dist"), { recursive: true });
  mkdirSync(resolve(outDir, "vendor/shared"), { recursive: true });

  const bundleResult = spawnSync(
    "bun",
    [
      "build",
      resolve(repoRoot, "apps/api/dist/main.js"),
      "--packages=external",
      "--target=bun",
      "--outfile",
      resolve(outDir, "dist/main.js"),
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
  if (bundleResult.status !== 0) {
    process.exit(bundleResult.status ?? 1);
  }
  const sharedPkg = readJson<PackageManifest>(
    resolve(repoRoot, "packages/shared/package.json"),
  );
  const {
    catalog: _catalog,
    dependencies: sharedDeps,
    ...sharedRest
  } = sharedPkg as PackageManifest & {
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  delete sharedRest.devDependencies;
  delete sharedRest.scripts;

  writeFileSync(
    resolve(outDir, "vendor/shared/package.json"),
    `${JSON.stringify(
      {
        ...sharedRest,
        ...(sharedDeps ? { dependencies: sharedDeps } : {}),
      },
      null,
      2,
    )}\n`,
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

  stripNonRuntimeFiles(resolve(outDir, "node_modules"));

  if (archivePath) {
    const archiveDir = dirname(archivePath);
    mkdirSync(archiveDir, { recursive: true });
    writeFileSync(join(archiveDir, "boot.mjs"), BOOT_SCRIPT);

    const tarResult = spawnSync(
      "tar",
      ["-czf", archivePath, "-C", outDir, "."],
      {
        stdio: "inherit",
      },
    );
    if (tarResult.status !== 0) {
      process.exit(tarResult.status ?? 1);
    }
    console.log(`Packaged API archive at ${archivePath}`);
    return;
  }

  console.log(`Packaged API deployment artifact at ${outDir}`);
}

main();
