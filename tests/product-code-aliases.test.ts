import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { productCodeAliases, canonicalProductCode } from "../src/lib/platform/entitlements";

describe("productCodeAliases", () => {
  it("treats GOLDENSOFT_HR and HR as the same product family", () => {
    assert.deepEqual(productCodeAliases("GOLDENSOFT_HR"), [
      "GOLDENSOFT_HR",
      "HR",
    ]);
    assert.deepEqual(productCodeAliases("hr"), ["GOLDENSOFT_HR", "HR"]);
  });

  it("treats RESIDENT_V2 and RESIDENT as the same product family", () => {
    assert.deepEqual(productCodeAliases("RESIDENT_V2"), [
      "RESIDENT_V2",
      "RESIDENT",
    ]);
    assert.deepEqual(productCodeAliases("RESIDENT"), [
      "RESIDENT_V2",
      "RESIDENT",
    ]);
  });

  it("passes through unknown codes uppercase", () => {
    assert.deepEqual(productCodeAliases("CUSTOM_X"), ["CUSTOM_X"]);
  });

  it("canonicalizes short product codes for customer bootstrap", () => {
    assert.equal(canonicalProductCode("HR"), "GOLDENSOFT_HR");
    assert.equal(canonicalProductCode("RESIDENT"), "RESIDENT_V2");
  });
});
