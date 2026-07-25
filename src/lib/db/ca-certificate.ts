/**
 * Server-side CA loader for PostgreSQL TLS.
 * Do not import from Client Components — use only from server modules / scripts.
 */
import fs from "node:fs";
import path from "node:path";

export type TrustedPgSsl = {
  ca: string;
  rejectUnauthorized: true;
};

/**
 * Normalize a path value from environment / config.
 * Strips BOM, surrounding quotes, and trailing inline comments.
 */
export function normalizeConfiguredPath(configuredPath: string): string {
  let raw = configuredPath.replace(/^\uFEFF/, "").trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1).trim();
  }
  const hash = raw.search(/\s+#/);
  if (hash >= 0) {
    raw = raw.slice(0, hash).trim();
  }
  return raw.replace(/\\/g, "/");
}

/**
 * Windows-safe containment check (path.relative, not string prefix alone).
 */
export function isPathInsideProjectRoot(
  absolutePath: string,
  projectRoot: string = process.cwd(),
): boolean {
  const root = path.resolve(projectRoot);
  const target = path.resolve(absolutePath);
  const relative = path.relative(root, target);
  if (relative === "") return true;
  if (path.isAbsolute(relative)) return false;
  const segments = relative.split(/[/\\]/);
  return !segments.includes("..");
}

/**
 * Shared path resolver for Guard + CA utility.
 * Relative paths always resolve as: path.resolve(process.cwd(), configuredPath)
 * (or an explicit projectRoot that defaults to process.cwd()).
 */
export function resolveProjectRelativePath(
  configuredPath: string,
  projectRoot: string = process.cwd(),
): string {
  const configured = normalizeConfiguredPath(configuredPath);
  if (!configured) {
    throw new Error("Configured path is empty");
  }

  const parts = configured.split("/").filter((part) => part.length > 0);
  if (parts.includes("..")) {
    throw new Error(`Path traversal is not allowed: ${configured}`);
  }

  const root = path.resolve(projectRoot);

  const absolute = path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(root, configured);

  if (!isPathInsideProjectRoot(absolute, root)) {
    throw new Error(`Resolved path is outside project root: ${absolute}`);
  }

  return absolute;
}

/** Alias used by CA loading — same shared resolver. */
export function resolveCaCertAbsolutePath(
  configuredPath: string,
  projectRoot: string = process.cwd(),
): string {
  return resolveProjectRelativePath(configuredPath, projectRoot);
}

/** Resolve DIRECT_URL sslrootcert; `../certs/...` is resolved from the prisma/ directory. */
export function resolveDirectSslRootCertPath(
  sslrootcert: string,
  projectRoot: string = process.cwd(),
): string {
  const raw = normalizeConfiguredPath(sslrootcert);
  if (!raw) {
    throw new Error("DIRECT_URL sslrootcert is empty");
  }

  const root = path.resolve(projectRoot);
  const base =
    raw.startsWith("../") || raw.startsWith("..\\")
      ? path.join(root, "prisma")
      : root;

  const absolute = path.resolve(base, raw);
  if (!isPathInsideProjectRoot(absolute, root)) {
    throw new Error(
      `DIRECT_URL sslrootcert resolves outside the project root: ${absolute}`,
    );
  }
  return absolute;
}

/** Fail-closed file checks: exists, is file, size > 0. Never logs PEM content. */
export function assertCaCertificateFile(absolutePath: string): void {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(absolutePath);
  } catch {
    throw new Error(`CA certificate file does not exist: ${absolutePath}`);
  }

  if (!stats.isFile()) {
    throw new Error(`CA certificate path is not a file: ${absolutePath}`);
  }

  if (stats.size <= 0) {
    throw new Error(`CA certificate file is empty: ${absolutePath}`);
  }
}

export function readCaCertificateFile(absolutePath: string): string {
  assertCaCertificateFile(absolutePath);
  const content = fs.readFileSync(absolutePath, "utf8").trim();
  if (!content) {
    throw new Error(`CA certificate file is empty: ${absolutePath}`);
  }
  if (!content.includes("BEGIN CERTIFICATE")) {
    throw new Error(
      `CA certificate file is not a PEM certificate: ${absolutePath}`,
    );
  }
  if (/PRIVATE KEY/i.test(content)) {
    throw new Error(
      `CA certificate file must not contain a private key: ${absolutePath}`,
    );
  }
  return content;
}

export function loadSupabaseDbCaCertificate(
  configuredPath: string = process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
  projectRoot: string = process.cwd(),
): { absolutePath: string; content: string } {
  const absolutePath = resolveProjectRelativePath(configuredPath, projectRoot);
  const content = readCaCertificateFile(absolutePath);
  return { absolutePath, content };
}

/** SSL config for pg — always verifies the peer certificate. */
export function buildTrustedPgSsl(certificateContent: string): TrustedPgSsl {
  if (!certificateContent.trim()) {
    throw new Error("CA certificate content is empty");
  }
  return {
    ca: certificateContent,
    rejectUnauthorized: true,
  };
}

/**
 * Preflight / runtime pool options.
 * Always uses DATABASE_URL — never DIRECT_URL (whose sslrootcert is for Prisma CLI only).
 */
export function buildDatabasePoolConfig(
  databaseUrl: string,
  ssl: TrustedPgSsl,
  options: { max?: number } = {},
): {
  connectionString: string;
  ssl: TrustedPgSsl;
  max: number;
} {
  if (!databaseUrl.trim()) {
    throw new Error("DATABASE_URL is required for the database pool");
  }
  return {
    connectionString: databaseUrl,
    ssl,
    max: options.max ?? 10,
  };
}
