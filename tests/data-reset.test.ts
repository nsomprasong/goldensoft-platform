import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DATA_RESET_CONFIRM_PHRASE,
  PROTECTED_ORG_CODE,
} from "../src/lib/ops/data-reset-types";

describe("data reset shared constants", () => {
  it("locks GOLDENSOFT and uses Thai confirm phrase", () => {
    assert.equal(PROTECTED_ORG_CODE, "GOLDENSOFT");
    assert.equal(DATA_RESET_CONFIRM_PHRASE, "ล้างข้อมูล");
  });
});
