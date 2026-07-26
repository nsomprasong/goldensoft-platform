import "server-only";

const TTL_MS = 30_000;
const MAX_ENTRIES = 500;

type CachedBundle = {
  authUserId: string;
  profile: null | {
    id: string;
    email: string;
    displayName: string;
    statusCode: string;
  };
  platformRoles: string[];
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    organizationStatus: string;
    roles: string[];
    branches: Array<{ id: string; name: string; code: string }>;
  }>;
};

type Entry = {
  expiresAt: number;
  value: CachedBundle;
};

const store = new Map<string, Entry>();

export function readPlatformUserBundleCache(
  authUserId: string,
): CachedBundle | null {
  const hit = store.get(authUserId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(authUserId);
    return null;
  }
  return hit.value;
}

export function writePlatformUserBundleCache(
  authUserId: string,
  value: CachedBundle,
): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(authUserId, {
    expiresAt: Date.now() + TTL_MS,
    value,
  });
}

export function invalidatePlatformUserBundleCache(authUserId?: string): void {
  if (authUserId) {
    store.delete(authUserId);
    return;
  }
  store.clear();
}
