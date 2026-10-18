// Shared-password protection for the online version.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { parseBasicAuth, safeEqual, clientIp, createAuthGate } from '../server/lib/auth.js';

const quiet = { warn() {}, error() {}, info() {} };
const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

test('parseBasicAuth and safeEqual', () => {
  assert.deepEqual(parseBasicAuth(basic('proto', 'p:a:ss')), { user: 'proto', pass: 'p:a:ss' });
  assert.equal(parseBasicAuth('Bearer x'), null);
  assert.equal(parseBasicAuth(`Basic ${Buffer.from('nocolon').toString('base64')}`), null);
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abcd'), false);
});

test('clientIp only trusts X-Forwarded-For behind a proxy', () => {
  const req = { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.1' } };
  assert.equal(clientIp(req, true), '1.2.3.4');
  assert.equal(clientIp(req, false), '10.0.0.1');
});

test('auth gate locks an IP after too many wrong passwords', () => {
  const gate = createAuthGate({ user: 'proto', password: 'secret' });
  const wrong = { headers: { authorization: basic('proto', 'nope') } };
  for (let i = 0; i < 10; i++) assert.equal(gate(wrong, '9.9.9.9'), 'denied');
  assert.equal(gate({ headers: { authorization: basic('proto', 'secret') } }, '9.9.9.9'), 'locked');
  assert.equal(gate({ headers: { authorization: basic('proto', 'secret') } }, '8.8.8.8'), 'ok', 'other visitors unaffected');
  assert.equal(gate({ headers: {} }, '7.7.7.7'), 'denied');
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

test('with ACCESS_PASSWORD set, pages and API need the password; /healthz does not', async () => {
  const noAuth = await fetch(`${base}/`);
  assert.equal(noAuth.status, 401);
  assert.match(noAuth.headers.get('www-authenticate'), /Basic realm="ProtoTrip"/);
  assert.equal((await fetch(`${base}/api/status`)).status, 401);
  assert.equal((await fetch(`${base}/`, { headers: { authorization: basic('proto', 'wrong') } })).status, 401);
  const ok = await fetch(`${base}/`, { headers: { authorization: basic('proto', 'secret') } });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('strict-transport-security'), /max-age/);
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');
});

test('config defaults keep local runs password-free on localhost', () => {
  const c = loadConfig({});
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.accessPassword, '');
  assert.equal(c.accessUser, 'proto');
  assert.equal(c.trustProxy, false);
});
