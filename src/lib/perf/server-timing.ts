import "server-only";

import { cache } from "react";

export type ServerTimingPhase =
  | "auth"
  | "profile"
  | "roles"
  | "memberships"
  | "context"
  | "permissions"
  | "data";

type TimingBucket = {
  startedAt: number;
  route: string;
  phases: Map<ServerTimingPhase, number>;
  logged: boolean;
};

/**
 * Timings are opt-in and development-only so production never pays for the
 * instrumentation and never emits request metadata to logs.
 */
export function isServerTimingEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" && process.env.PERF_LOG === "true"
  );
}

/**
 * React cache() scopes the bucket to a single server request, so timings from
 * concurrent requests (and users) never mix.
 */
const requestBucket = cache(
  (): TimingBucket => ({
    startedAt: Date.now(),
    route: "unknown",
    phases: new Map(),
    logged: false,
  }),
);

/** Only path shapes are recorded — never ids, emails, tokens or query values. */
export function setServerTimingRoute(pathname: string | null | undefined) {
  if (!isServerTimingEnabled()) return;
  if (!pathname || !pathname.startsWith("/")) return;
  requestBucket().route = pathname.split("?")[0];
}

export async function measure<T>(
  phase: ServerTimingPhase,
  run: () => Promise<T>,
): Promise<T> {
  if (!isServerTimingEnabled()) return run();
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    const bucket = requestBucket();
    bucket.phases.set(
      phase,
      (bucket.phases.get(phase) ?? 0) + (Date.now() - startedAt),
    );
  }
}

export function logServerTiming() {
  if (!isServerTimingEnabled()) return;
  const bucket = requestBucket();
  if (bucket.logged) return;
  bucket.logged = true;
  const parts = [...bucket.phases.entries()].map(
    ([phase, ms]) => `${phase}=${ms}ms`,
  );
  parts.push(`total=${Date.now() - bucket.startedAt}ms`);
  console.info(`[PERF] route=${bucket.route} ${parts.join(" ")}`);
}
