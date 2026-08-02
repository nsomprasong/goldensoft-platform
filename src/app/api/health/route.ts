export const dynamic = "force-dynamic";

/** Liveness probe — no secrets, no DB details. */
export async function GET() {
  return Response.json({
    ok: true,
    service: "goldensoft-platform",
    version: process.env.IMAGE_TAG || "unknown",
    time: new Date().toISOString(),
  });
}
