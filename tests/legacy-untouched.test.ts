import { describe, it } from "node:test";

import { assertResidentLegacyUntouched } from "./helpers/legacy-untouched";

describe("Legacy folder protection", () => {
  it("does not modify Resident Legacy files from this workspace task", () => {
    assertResidentLegacyUntouched(__dirname);
  });
});
