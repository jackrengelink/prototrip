// Shared-password protection for the online version: login page + signed session cookie.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { safeEqual, clientIp, createSessions, createLockout, parseCookies, loginPage } from '../server/lib/auth.js';

const quiet = { warn() {}, error() {}, info() {} };

test('safeEqual, cookies and client IPs', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.deepEqual(parseCookies('a=1; pt_session=x.y; b=%20z'), { a: '1', pt_session: 'x.y', b: ' z' });
  const req = { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.1' } };
  assert.equal(clientIp(req, true), '1.2.3.4');
  assert.equal(clientIp(req, false), '10.0.0.1');
});

test('sessions: valid until they expire, forged or old-password ones are rejected', () => {
  let now = 1_000_000;
  const s = createSessions({ password: 'secret', now: () => now });
  const token = s.issue();
  assert.equal(s.valid(token), true);
  assert.equal(s.valid(`${token}x`), false);
  assert.equal(s.valid('9999999999999.forged'), false);
  assert.equal(s.valid(''), false);
  assert.equal(createSessions({ password: 'changed', now: () => now }).valid(token), false, 'new password logs everyone out');
  now += 31 * 24 * 3600 * 1000;
  assert.equal(s.valid(token), false, 'expires after 30 days');
});

test('lockout after 10 wrong passwords, per IP', () => {
  const l = createLockout();
  for (let i = 0; i < 10; i++) l.fail('9.9.9.9');
  assert.equal(l.locked('9.9.9.9'), true);
  assert.equal(l.locked('8.8.8.8'), false);
  l.reset('9.9.9.9');
  assert.equal(l.locked('9.9.9.9'), false);
});

test('login page escapes the error message and has no inline script', () => {
  const page = loginPage({ error: '<b>x</b>' });
  assert.match(page, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(page, /<script/);
  assert.match(page, /method="post" action="\/login"/);
});

let server;
let base;
before(async () => {
  const config = loadConfig({ RYANAIR: 'off', ACCESS_PASSWORD: 'secret', TRUST_PROXY: '1' });
  const stub = { providers: [], sources: [] };
  const app = createApp({ config, flights: stub, ground: stub, places: stub, weather: stub, logger: quiet });
  server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (password, ip = '5.5.5.5') => fetch(`${base}/login`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': ip },
  body: new URLSearchParams({ password }),
});

test('logged out: pages redirect to /login, API says 401, login page and its CSS are public', async () => {
  const home = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(home.status, 303);
  assert.equal(home.headers.get('location'), '/login');
  assert.equal((await fetch(`${base}/api/status`)).status, 401);
  const login = await fetch(`${base}/login`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Proto<b>Trip<\/b>/);
  assert.equal((await fetch(`${base}/styles.css`)).status, 200);
  assert.equal((await fetch(`${base}/js/app.js`, { redirect: 'manual' })).status, 303, 'app code stays private');
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
});

test('wrong password shows an error; right password sets a secure session cookie', async () => {
  const wrong = await post('nope');
  assert.equal(wrong.status, 401);
  assert.match(await wrong.text(), /not right/);
  const ok = await post('secret');
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/');
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, /pt_session=\d+\.[\w-]+/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  const session = cookie.split(';')[0];
  const home = await fetch(`${base}/`, { headers: { cookie: session } });
  assert.equal(home.status, 200);
  assert.match(home.headers.get('strict-transport-security'), /max-age/);
  const backToLogin = await fetch(`${base}/login`, { headers: { cookie: session }, redirect: 'manual' });
  assert.equal(backToLogin.headers.get('location'), '/', 'already logged in');
  const out = await fetch(`${base}/logout`, { headers: { cookie: session }, redirect: 'manual' });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
});

test('ten wrong passwords lock that IP out, even with the right one', async () => {
  for (let i = 0; i < 10; i++) await post('nope', '6.6.6.6');
  assert.equal((await post('secret', '6.6.6.6')).status, 429);
  assert.equal((await post('secret', '7.7.7.7')).status, 303, 'others can still log in');
});

test('without ACCESS_PASSWORD everything is open (local use) and POST is refused', async () => {
  const config = loadConfig({ RYANAIR: 'off' });
  const stub = { providers: [], sources: [] };
  const open = createServer(createApp({ config, flights: stub, ground: stub, places: stub, weather: stub, logger: quiet }));
  await new Promise((r) => open.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${open.address().port}`;
  assert.equal((await fetch(`${url}/`)).status, 200);
  assert.equal((await fetch(`${url}/login`, { method: 'POST' })).status, 405);
  open.close();
});

test('config defaults keep local runs password-free on localhost', () => {
  const c = loadConfig({});
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.accessPassword, '');
  assert.equal(c.trustProxy, false);
});
