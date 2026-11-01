/** Tiny in-memory TTL cache. Keeps paid API quotas from being burned on repeat searches. */
export function createCache({ maxEntries = 500 } = {}) {
  const store = new Map();
  const running = new Map();

  function get(key) {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  function set(key, value, ttlMs) {
    if (store.size >= maxEntries) store.delete(store.keys().next().value);
    store.set(key, { value, expires: Date.now() + ttlMs });
  }

  /** Return the cached value, or compute it once and cache the result. Requests that arrive together share one call. */
  async function wrap(key, ttlMs, compute) {
    const cached = get(key);
    if (cached !== undefined) return cached;
    if (running.has(key)) return running.get(key);
    const pending = Promise.resolve().then(compute).then((value) => {
      set(key, value, ttlMs);
      return value;
    }).finally(() => running.delete(key));
    running.set(key, pending);
    return pending;
  }

  return { get, set, wrap, size: () => store.size };
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
