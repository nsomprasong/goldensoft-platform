import "server-only";

const TTL_MS = 45_000;
const MAX_ENTRIES = 500;

type Entry = {
  expiresAt: number;
  codes: string[];
};

const store = new Map<string, Entry>();

function key(authUserId: string, organizationId?: string | null): string {
  return `${authUserId}\0${organizationId ?? ""}`;
}

export function readEffectiveCodesCache(
  authUserId: string,
  organizationId?: string | null,
): string[] | null {
  const hit = store.get(key(authUserId, organizationId));
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key(authUserId, organizationId));
    return null;
  }
  return hit.codes;
}

export function writeEffectiveCodesCache(
  authUserId: string,
  organizationId: string | null | undefined,
  codes: string[],
): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (typeof oldest === "string") store.delete(oldest);
  }
  store.set(key(authUserId, organizationId), {
    expiresAt: Date.now() + TTL_MS,
    codes,
  });
}

export function invalidateEffectiveCodesCache(authUserId?: string): void {
  if (!authUserId) {
    store.clear();
    return;
  }
  const prefix = `${authUserId}\0`;
  for (const entryKey of store.keys()) {
    if (entryKey.startsWith(prefix)) store.delete(entryKey);
  }
}
