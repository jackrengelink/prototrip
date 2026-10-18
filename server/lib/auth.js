// Shared-password protection for the online version: a ProtoTrip login page + a signed session cookie.
// (A browser pop-up login doesn't show up in WhatsApp/Instagram in-app browsers, so we use a real page.)
// Only active when ACCESS_PASSWORD is set, so running locally stays password-free.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const FAIL_WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 10;
export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
export const COOKIE_NAME = 'pt_session';

const digest = (s) => createHash('sha256').update(String(s)).digest();

/** Constant-time string comparison (hashing first makes the lengths equal). */
export function safeEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

/** The visitor's IP. Behind a hosting proxy (Render) the real one is the first X-Forwarded-For entry. */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * Sessions are "expiry.signature", signed with a key derived from the password.
 * Changing ACCESS_PASSWORD therefore logs everybody out.
 */
export function createSessions({ password, now = () => Date.now() }) {
  const key = digest(`prototrip-session:${password}`);
  const sign = (exp) => createHmac('sha256', key).update(String(exp)).digest('base64url');
  return {
    issue() {
      const exp = now() + SESSION_MS;
      return `${exp}.${sign(exp)}`;
    },
    valid(token) {
      const [exp, sig] = String(token || '').split('.');
      if (!/^\d+$/.test(exp || '') || !sig) return false;
      return Number(exp) > now() && safeEqual(sig, sign(exp));
    },
  };
}

/** Per-IP lockout after too many wrong passwords. */
export function createLockout() {
  const fails = new Map();
  const current = (ip) => {
    const e = fails.get(ip);
    if (e && Date.now() - e.start > FAIL_WINDOW_MS) fails.delete(ip);
    return fails.get(ip)?.count || 0;
  };
  return {
    locked: (ip) => current(ip) >= MAX_FAILS,
    fail(ip) {
      const e = fails.get(ip) || { start: Date.now(), count: 0 };
      fails.set(ip, { ...e, count: e.count + 1 });
      if (fails.size > 5000) fails.clear();
    },
    reset: (ip) => fails.delete(ip),
  };
}

export function sessionCookie(token, { secure }) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`;
}

export const clearedCookie = (secure) => `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The login page. Uses the normal stylesheet; no inline script, so the strict CSP still holds. */
export function loginPage({ error = '' } = {}) {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ProtoTrip · Log in</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Space+Grotesk:wght@500;700&display=swap">
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="login-body">
  <main class="login-wrap">
    <form class="login-card" method="post" action="/login">
      <span class="ring" aria-hidden="true"></span>
      <h1 class="login-title">Proto<b>Trip</b></h1>
      <p class="login-lede">Crazy trip deals for S.A. Proto. Enter the committee password to continue.</p>
      <label class="field">
        <span class="field-label">Password</span>
        <input type="password" name="password" autocomplete="current-password" required autofocus>
      </label>
      ${error ? `<p class="login-error" role="alert">${escapeHtml(error)}</p>` : ''}
      <button class="btn-primary" type="submit">Let me in</button>
      <p class="login-note">You'll stay logged in on this device for ${SESSION_DAYS} days.</p>
    </form>
  </main>
</body>
</html>`;
}
