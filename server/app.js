// HTTP routing, static files, security headers and rate limiting. No framework needed.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { searchAirports, searchCountries, findAirport, homeAirports, HOME } from './data/airports.js';
import { parseSearch, parseStay, parseGroundSearch, parseCityId, parseIata, parseMonth, ValidationError } from './lib/validate.js';
import { comparisonLinks } from './lib/links.js';
import { planTrip, planGroundTrip, exploreTrip } from './trip.js';
import { clientIp, createSessions, createLockout, parseCookies, sessionCookie, clearedCookie, loginPage, safeEqual, COOKIE_NAME } from './lib/auth.js';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 90;
const OFFER_ID = /^[\w.:+-]{1,200}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' https: data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

const json = (res, status, payload) =>
  send(res, status, JSON.stringify(payload), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

function createRateLimiter() {
  const hits = new Map();
  const evictExpired = (now) => {
    for (const [ip, entry] of hits) if (now - entry.start > RATE_WINDOW_MS) hits.delete(ip);
  };
  return (ip) => {
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now - entry.start > RATE_WINDOW_MS) {
      if (hits.size > 5000) evictExpired(now);
      hits.set(ip, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= RATE_MAX;
  };
}

async function serveStatic(res, publicDir, urlPath) {
  let rel;
  try {
    rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  } catch {
    return send(res, 400, 'Bad request');
  }
  const file = path.resolve(publicDir, rel);
  if (!file.startsWith(publicDir + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const body = await readFile(file);
    send(res, 200, body, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
}

export function createApp({ config, flights, ground, places, weather, logger = console }) {
  const publicDir = path.join(config.root, 'public');
  const allow = createRateLimiter();
  const sessions = config.accessPassword ? createSessions({ password: config.accessPassword }) : null;
  const lockout = createLockout();
  // Pages that must work before logging in: the login page itself and what it needs to look right.
  const PUBLIC_PATHS = new Set(['/login', '/styles.css', '/favicon.svg']);
  // Online, HTTPS is done by the host; tell browsers to always use it.
  const extraHeaders = config.trustProxy ? { 'Strict-Transport-Security': 'max-age=31536000' } : {};

  const routes = {
    '/api/status': async () => ({
      flights: flights.providers.length ? flights.providers : ['demo'],
      places: places.sources,
      demoMode: flights.providers.length === 0,
      home: { ...HOME, airports: homeAirports() },
    }),
    // The To field also offers whole countries (countries=1); the From field doesn't.
    '/api/airports': async (params) => [
      ...(params.get('countries') === '1' ? searchCountries(params.get('q')) : []),
      ...searchAirports(params.get('q')),
    ],
    '/api/deals': async (params) => {
      if (params.get('mode') === 'ground') {
        const q = parseGroundSearch(params);
        const result = await ground.searchAnywhere(q);
        const offers = q.budget ? result.offers.filter((o) => o.price <= q.budget) : result.offers;
        return { ...result, offers, origin: { iata: 'ENS', name: 'Enschede' }, links: null, mode: 'ground' };
      }
      const query = parseSearch(params);
      const result = query.destination ? await flights.searchRoute(query) : await flights.searchAnywhere(query);
      const offers = query.budget ? result.offers.filter((o) => (o.totalPrice ?? o.price) <= query.budget) : result.offers;
      const origin = query.origin === HOME.code ? { iata: HOME.code, name: HOME.name } : findAirport(query.origin);
      const links = query.destination ? comparisonLinks({ ...query, origin: query.origins[0] }) : null;
      return { ...result, offers, origin, links };
    },
    '/api/trip': async (params) => {
      // Exact dates here: the user picked a specific fare.
      const query = { ...parseSearch(params), flex: 0 };
      if (!query.destination) throw new ValidationError('choose a destination to plan a trip');
      const offerId = params.get('offerId');
      if (offerId && !OFFER_ID.test(offerId)) throw new ValidationError('offerId is invalid');
      return planTrip({ query, offerId, flights, weather });
    },
    '/api/calendar': async (params) => flights.calendar({
      origin: parseIata(params.get('origin'), 'origin'),
      destination: parseIata(params.get('destination'), 'destination'),
      month: parseMonth(params.get('month')),
    }),
    '/api/ground-trip': async (params) => {
      const q = parseGroundSearch(params);
      const trip = await planGroundTrip({ cityId: parseCityId(params.get('city')), departDate: q.departDate, returnDate: q.returnDate, ground, weather });
      if (!trip) throw new ValidationError('that destination is not reachable from Enschede');
      return trip;
    },
    // Things to do: only called when someone clicks "What to do here?".
    '/api/explore': async (params) => exploreTrip({ stay: parseStay(params), places, weather }),
  };

  return async function handler(req, res) {
    try {
      await handle(req, res);
    } catch (err) {
      // Last line of defence: a malformed request must never take the server down.
      logger.error('[http] unhandled error:', err);
      if (!res.headersSent) send(res, 400, 'Bad request');
      else res.end();
    }
  };

  /** Read a small form body (the login form). */
  function readForm(req, limit = 2048) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > limit) { reject(new Error('body too large')); req.destroy(); }
      });
      req.on('end', () => resolve(new URLSearchParams(body)));
      req.on('error', reject);
    });
  }

  function html(res, status, page, headers = {}) {
    return send(res, status, page, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  }

  /** Login flow. Returns true when it has answered the request. */
  async function handleAuth(req, res, url, ip) {
    if (url.pathname === '/login' && req.method === 'POST') {
      if (lockout.locked(ip)) return html(res, 429, loginPage({ error: 'Too many wrong passwords. Try again in 10 minutes.' })), true;
      const form = await readForm(req).catch(() => new URLSearchParams());
      if (!safeEqual(form.get('password') || '', config.accessPassword)) {
        lockout.fail(ip);
        return html(res, 401, loginPage({ error: 'That password is not right. Ask the committee.' })), true;
      }
      lockout.reset(ip);
      return send(res, 303, '', { Location: '/', 'Set-Cookie': sessionCookie(sessions.issue(), { secure: config.trustProxy }) }), true;
    }
    if (url.pathname === '/logout') {
      return send(res, 303, '', { Location: '/login', 'Set-Cookie': clearedCookie(config.trustProxy) }), true;
    }
    if (sessions.valid(parseCookies(req.headers.cookie)[COOKIE_NAME])) {
      if (url.pathname === '/login') return send(res, 303, '', { Location: '/' }), true;
      return false;
    }
    if (url.pathname === '/login') return html(res, 200, loginPage()), true;
    if (PUBLIC_PATHS.has(url.pathname)) return false;
    if (url.pathname.startsWith('/api/')) return json(res, 401, { success: false, error: 'Please log in again.' }), true;
    return send(res, 303, '', { Location: '/login' }), true;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const isLoginPost = req.method === 'POST' && url.pathname === '/login' && sessions;
    if (req.method !== 'GET' && req.method !== 'HEAD' && !isLoginPost) return send(res, 405, 'Method not allowed');
    // Health check for the host (Render): no password, no data.
    if (url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });

    const ip = clientIp(req, config.trustProxy);
    for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
    if (sessions && await handleAuth(req, res, url, ip)) return;
    if (!url.pathname.startsWith('/api/')) return serveStatic(res, publicDir, url.pathname);

    if (!allow(ip)) return json(res, 429, { success: false, error: 'Too many requests, slow down a little' });
    const route = routes[url.pathname];
    if (!route) return json(res, 404, { success: false, error: 'Unknown endpoint' });
    try {
      return json(res, 200, { success: true, data: await route(url.searchParams) });
    } catch (err) {
      if (err instanceof ValidationError) return json(res, 400, { success: false, error: err.message });
      logger.error(`[api] ${url.pathname} failed:`, err);
      return json(res, 502, { success: false, error: 'Something went wrong talking to a travel provider. Try again.' });
    }
  }
}
