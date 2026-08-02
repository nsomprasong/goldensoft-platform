import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Suite-local guard: when resident-legacy-reference is a sibling checkout,
 * assert its git working tree is clean.
 *
 * On standalone CI clones (GitHub Actions for this repo alone) the sibling
 * folder is absent — skip without failing. Never touches the legacy tree.
 */
export function assertResidentLegacyUntouched(testDirname: string): void {
  const legacyRoot = path.resolve(testDirname, "../../resident-legacy-reference");
  if (!fs.existsSync(legacyRoot)) {
    // Platform-only checkout (CI) — nothing to verify against.
    return;
  }

  assert.ok(fs.statSync(legacyRoot).isDirectory(), "legacy reference must be a directory");

  try {
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: legacyRoot,
      encoding: "utf8",
    }).trim();
    assert.equal(
      status,
      "",
      `Legacy working tree must be clean, got:\n${status}`,
    );
  } catch (err) {
    // If git is unavailable, ensure we did not write a marker file.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "ENOENT"
    ) {
      assert.equal(
        fs.existsSync(path.join(legacyRoot, ".platform-mvp-touched")),
        false,
      );
      return;
    }
    throw err;
  }
}
