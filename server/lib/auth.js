// Shared-password protection for the online version (HTTP Basic auth: the browser shows a login box).
// Only active when ACCESS_PASSWORD is set, so running locally stays password-free.

import { createHash, timingSafeEqual } from 'node:crypto';

const FAIL_WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 10;

const digest = (s) => createHash('sha256').update(String(s)).digest();

/** Constant-time string comparison (hashing first makes the lengths equal). */
export function safeEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

/** Parse "Authorization: Basic base64(user:pass)". Returns { user, pass } or null. */
export function parseBasicAuth(header) {
  const m = /^Basic ([A-Za-z0-9+/=]+)$/.exec(String(header || '').trim());
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  return i < 0 ? null : { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
}

/** The visitor's IP. Behind a hosting proxy (Koyeb) the real one is the first X-Forwarded-For entry. */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * @param {{user:string, password:string}} creds
 * @returns {(req, ip:string) => 'ok'|'denied'|'locked'}
 */
export function createAuthGate({ user, password }) {
  const fails = new Map();
  return (req, ip) => {
    const now = Date.now();
    const entry = fails.get(ip);
    if (entry && now - entry.start > FAIL_WINDOW_MS) fails.delete(ip);
    if ((fails.get(ip)?.count || 0) >= MAX_FAILS) return 'locked';
    const given = parseBasicAuth(req.headers.authorization);
    // Compare both parts even when the user name is wrong, so timing doesn't leak which one failed.
    const userOk = safeEqual(given?.user ?? '', user);
    const passOk = safeEqual(given?.pass ?? '', password);
    if (given && userOk && passOk) return 'ok';
    if (given) {
      const e = fails.get(ip) || { start: now, count: 0 };
      fails.set(ip, { ...e, count: e.count + 1 });
      if (fails.size > 5000) fails.clear();
    }
    return 'denied';
  };
}
