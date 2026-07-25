import { NextResponse } from "next/server";

import { assertSafeEnvironment } from "@/lib/env/guard";

export async function GET() {
  const guard = assertSafeEnvironment();
  if (!guard.ok) {
    return NextResponse.json(
      { status: "error", code: guard.code, message: guard.reason },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: "ok",
    appCode: process.env.APP_CODE ?? null,
    projectRef: guard.projectRef,
  });
}
