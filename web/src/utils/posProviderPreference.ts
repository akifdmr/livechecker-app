const STORAGE_PREFIX = 'pos.default-provider.v1.';

function storageKey(userId?: number | null) {
  return `${STORAGE_PREFIX}${userId ?? 'unknown'}`;
}

export function getPreferredPosProvider(userId?: number | null): string {
  try {
    return localStorage.getItem(storageKey(userId)) || '';
  } catch {
    return '';
  }
}

export function setPreferredPosProvider(userId: number | null | undefined, providerKey: string) {
  try {
    const key = storageKey(userId);
    if (providerKey) localStorage.setItem(key, providerKey);
    else localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable in private or extension contexts.
  }
}
