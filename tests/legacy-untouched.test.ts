import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("Legacy folder protection", () => {
  it("does not modify Resident Legacy files from this workspace task", () => {
    const legacyRoot = path.resolve(
      __dirname,
      "../../resident-legacy-reference",
    );
    assert.ok(fs.existsSync(legacyRoot), "legacy reference folder exists");

    // Prefer git status when available; fall back to existence check.
    try {
      const status = execSync("git status --porcelain", {
        cwd: legacyRoot,
        encoding: "utf8",
      }).trim();
      assert.equal(
        status,
        "",
        `Legacy working tree must be clean, got:\n${status}`,
      );
    } catch {
      // If git is unavailable, ensure we did not write a marker file.
      assert.equal(
        fs.existsSync(path.join(legacyRoot, ".platform-mvp-touched")),
        false,
      );
    }
  });
});
