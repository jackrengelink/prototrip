import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.js';

test('listens only on this computer by default', () => {
  const c = loadConfig({});
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.port, 5173);
  assert.equal(c.trustProxy, false);
});

test('on Render it listens on all interfaces behind the proxy, on the port Render gives', () => {
  const c = loadConfig({ RENDER: 'true', PORT: '10000' });
  assert.equal(c.host, '0.0.0.0');
  assert.equal(c.port, 10000);
  assert.equal(c.trustProxy, true);
});

test('HOST and TRUST_PROXY still win when set', () => {
  const c = loadConfig({ RENDER: 'true', HOST: '127.0.0.1', TRUST_PROXY: '0' });
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.trustProxy, false);
});
