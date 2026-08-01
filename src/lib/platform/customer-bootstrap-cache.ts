import "server-only";

const TTL_MS = 45_000;
const MAX_ENTRIES = 200;
/** Bump when bootstrap product/entitlement rules change (invalidate in-memory cache). */
const CACHE_REV = "v2-super-admin-product-bypass";

type Entry = {
  expiresAt: number;
  // JSON payload already validated by the route schema before write.
  value: unknown;
};

const store = new Map<string, Entry>();

export function customerBootstrapCacheKey(input: {
  authUserId: string;
  organizationId: string | null;
  branchId: string | null;
  mode: string;
}): string {
  return [
    CACHE_REV,
    input.authUserId,
    input.organizationId ?? "",
    input.branchId ?? "",
    input.mode,
  ].join("\0");
}

export function readCustomerBootstrapCache(key: string): unknown | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function writeCustomerBootstrapCache(key: string, value: unknown): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (typeof oldest === "string") store.delete(oldest);
  }
  store.set(key, { expiresAt: Date.now() + TTL_MS, value });
}

export function invalidateCustomerBootstrapCache(authUserId?: string): void {
  if (!authUserId) {
    store.clear();
    return;
  }
  const prefix = `${authUserId}\0`;
  for (const key of store.keys()) {
    if (key === authUserId || key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
