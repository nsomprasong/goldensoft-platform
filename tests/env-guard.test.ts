import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertSafeEnvironment,
  extractSupabaseProjectRef,
} from "../src/lib/env/guard";

describe("Environment Guard", () => {
  it("extracts project ref from Supabase URL", () => {
    assert.equal(
      extractSupabaseProjectRef("https://abc123.supabase.co"),
      "abc123",
    );
  });

  it("rejects Legacy project ref", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: "https://legacy-blocked-ref.supabase.co",
      expectedProjectRef: "new-platform-ref",
      blockedLegacyProjectRef: "legacy-blocked-ref",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "LEGACY_BLOCKED");
    }
  });

  it("accepts expected project ref", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: "https://new-platform-ref.supabase.co",
      expectedProjectRef: "new-platform-ref",
      blockedLegacyProjectRef: "legacy-blocked-ref",
    });
    assert.equal(result.ok, true);
  });
});
