const DEFAULT_TIMEOUT_MS = 12_000;

export class UpstreamError extends Error {
  constructor(source, message, status) {
    super(`${source}: ${message}`);
    this.name = 'UpstreamError';
    this.source = source;
    this.status = status;
  }
}

/**
 * fetch() + JSON parsing with a timeout and a readable error.
 * @param {string} source short provider name, used in error messages
 * @param {string} url
 * @param {RequestInit & {timeoutMs?: number}} [options]
 */
export async function fetchJson(source, url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new UpstreamError(source, err.name === 'TimeoutError' ? 'timed out' : 'network error');
  }
  if (!res.ok) throw new UpstreamError(source, `HTTP ${res.status}`, res.status);
  try {
    return await res.json();
  } catch {
    throw new UpstreamError(source, 'invalid JSON response');
  }
}
