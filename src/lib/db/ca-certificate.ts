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
 * Resolve SUPABASE_DB_CA_CERT_PATH relative to project root.
 * Rejects absolute paths outside the project and path traversal.
 * Never logs certificate contents.
 */
export function resolveCaCertAbsolutePath(
  relativePath: string,
  projectRoot: string = process.cwd(),
): string {
  const raw = relativePath.trim();
  if (!raw) {
    throw new Error("CA certificate path is empty");
  }

  if (path.isAbsolute(raw)) {
    const absolute = path.normalize(raw);
    const root = path.resolve(projectRoot);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
      throw new Error("CA certificate absolute path is outside the project root");
    }
    return absolute;
  }

  const normalized = path.normalize(raw);
  if (
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    normalized.split(path.sep).includes("..")
  ) {
    throw new Error("CA certificate path must not contain path traversal");
  }

  const absolute = path.resolve(projectRoot, normalized);
  const root = path.resolve(projectRoot);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error("CA certificate path resolves outside the project root");
  }
  return absolute;
}

/** Resolve DIRECT_URL sslrootcert; `../certs/...` is resolved from the prisma/ directory. */
export function resolveDirectSslRootCertPath(
  sslrootcert: string,
  projectRoot: string = process.cwd(),
): string {
  const raw = sslrootcert.trim();
  if (!raw) {
    throw new Error("DIRECT_URL sslrootcert is empty");
  }

  const base =
    raw.startsWith("../") || raw.startsWith(`..${path.sep}`)
      ? path.join(projectRoot, "prisma")
      : projectRoot;

  const absolute = path.resolve(base, raw);
  const root = path.resolve(projectRoot);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error("DIRECT_URL sslrootcert resolves outside the project root");
  }
  return absolute;
}

export function readCaCertificateFile(absolutePath: string): string {
  if (!fs.existsSync(absolutePath)) {
    throw new Error("CA certificate file not found");
  }
  const content = fs.readFileSync(absolutePath, "utf8").trim();
  if (!content) {
    throw new Error("CA certificate file is empty");
  }
  if (!content.includes("BEGIN CERTIFICATE")) {
    throw new Error("CA certificate file is not a PEM certificate");
  }
  if (/PRIVATE KEY/i.test(content)) {
    throw new Error("CA certificate file must not contain a private key");
  }
  return content;
}

export function loadSupabaseDbCaCertificate(
  relativePath: string = process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
  projectRoot: string = process.cwd(),
): { absolutePath: string; content: string } {
  const absolutePath = resolveCaCertAbsolutePath(relativePath, projectRoot);
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
