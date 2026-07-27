import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlatformRoleAssignError } from "../src/lib/platform/platform-roles";

describe("Platform role assignment API surface", () => {
  it("exposes PlatformRoleAssignError with codes", () => {
    const error = new PlatformRoleAssignError("FORBIDDEN", "denied");
    assert.equal(error.code, "FORBIDDEN");
    assert.equal(error.message, "denied");
  });

  it("wires platform role form and API route files", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "..");
    assert.ok(
      fs.existsSync(
        path.join(root, "src/app/api/platform/platform-roles/route.ts"),
      ),
    );
    assert.ok(
      fs.existsSync(path.join(root, "src/components/platform-role-form.tsx")),
    );
    assert.ok(
      fs.existsSync(path.join(root, "src/lib/platform/platform-roles.ts")),
    );
    const page = fs.readFileSync(
      path.join(root, "src/app/users/profiles/[id]/page.tsx"),
      "utf8",
    );
    assert.match(page, /PlatformRoleAssignForm/);
    assert.match(page, /กำหนดบทบาทแพลตฟอร์ม|platformRoles/);
  });
});
