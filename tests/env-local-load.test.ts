import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { loadEnvConfig } from "@next/env";

describe("loadEnvConfig for .env.local", () => {
  it("loads APP_CODE=PLATFORM from .env.local", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-env-local-"));
    try {
      fs.writeFileSync(path.join(dir, ".env.local"), "APP_CODE=PLATFORM\n", "utf8");

      const previous = process.env.APP_CODE;
      delete process.env.APP_CODE;

      loadEnvConfig(dir, true, undefined, true);

      assert.equal(process.env.APP_CODE, "PLATFORM");

      if (previous === undefined) {
        delete process.env.APP_CODE;
      } else {
        process.env.APP_CODE = previous;
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
