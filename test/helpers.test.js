import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, centroid } from '../server/lib/geo.js';
import { createCache } from '../server/lib/cache.js';
import { comparisonLinks, aviasalesSearchUrl } from '../server/lib/links.js';
import { parseSearch, parseDate, parseInterests, parseBudget, ValidationError } from '../server/lib/validate.js';
import { findAirport, searchAirports, destinationCities } from '../server/data/airports.js';
import { fetchJson, UpstreamError } from '../server/lib/http.js';

test('haversineKm: London to Rome is about 1,430 km', () => {
  const km = haversineKm({ lat: 51.5074, lon: -0.1278 }, { lat: 41.9028, lon: 12.4964 });
  assert.ok(km > 1400 && km < 1460, `got ${km}`);
  assert.equal(centroid([]), null);
  assert.deepEqual(centroid([{ lat: 0, lon: 0 }, { lat: 2, lon: 4 }]), { lat: 1, lon: 2 });
});

test('cache returns cached values, expires them and evicts the oldest', async () => {
  const cache = createCache({ maxEntries: 2 });
  let calls = 0;
  const compute = async () => ++calls;
  assert.equal(await cache.wrap('a', 1000, compute), 1);
  assert.equal(await cache.wrap('a', 1000, compute), 1);
  cache.set('old', 1, -1);
  assert.equal(cache.get('old'), undefined);
  cache.set('b', 2, 1000);
  cache.set('c', 3, 1000);
  assert.equal(cache.size(), 2);
});

test('comparisonLinks builds round-trip and one-way URLs for every site', () => {
  const rt = comparisonLinks({ origin: 'jfk', destination: 'fco', departDate: '2026-11-05', returnDate: '2026-11-12' });
  assert.equal(rt.length, 5);
  assert.match(rt[0].url, /skyscanner\.net\/transport\/flights\/jfk\/fco\/261105\/261112\//);
  assert.match(rt[1].url, /through%202026-11-12/);
  assert.match(rt[4].url, /kiwi\.com.*2026-11-12$/);
  const ow = comparisonLinks({ origin: 'JFK', destination: 'FCO', departDate: '2026-11-05' });
  assert.match(ow[4].url, /no-return$/);
  assert.ok(ow.every((l) => l.url.startsWith('https://')));
});

test('aviasalesSearchUrl encodes route and dates', () => {
  assert.equal(aviasalesSearchUrl({ origin: 'NYC', destination: 'ROM', departDate: '2026-11-05', returnDate: '2026-11-12' }), 'https://www.aviasales.com/search/NYC0511ROM12111');
  assert.match(aviasalesSearchUrl({ origin: 'NYC', destination: 'ROM', departDate: '2026-11-05', marker: 'abc' }), /\?marker=abc$/);
});

test('parseSearch accepts a valid search and normalises it', () => {
  const today = Date.UTC(2026, 9, 18);
  const q = parseSearch(new URLSearchParams('origin=jfk&destination=anywhere&departDate=2026-11-01&returnDate=2026-11-05&interests=food,FOOD,bogus&budget=499.6'), { today });
  assert.deepEqual(q, { origin: 'JFK', origins: ['JFK'], destination: null, departDate: '2026-11-01', returnDate: '2026-11-05', budget: 500, interests: ['food'], reach: 'smart', flex: 3, airports: 'near' });
});

test('parseSearch expands NL into the home airports and validates reach', () => {
  const today = Date.UTC(2026, 9, 18);
  const q = parseSearch(new URLSearchParams('origin=nl&destination=BCN&departDate=2026-11-01&reach=world'), { today });
  assert.equal(q.origin, 'NL');
  assert.ok(q.origins.includes('AMS') && q.origins.includes('EIN') && q.origins.includes('DUS'));
  assert.ok(!q.origins.includes('CRL'), 'Belgium is opt-in');
  const nl = parseSearch(new URLSearchParams('origin=NL&departDate=2026-11-01&airports=nl'), { today });
  assert.deepEqual(nl.origins.sort(), ['AMS', 'EIN', 'GRQ', 'RTM']);
  assert.ok(parseSearch(new URLSearchParams('origin=NL&departDate=2026-11-01&airports=all'), { today }).origins.includes('CRL'));
  assert.throws(() => parseSearch(new URLSearchParams('origin=NL&departDate=2026-11-01&airports=mars'), { today }), /airports/);
  assert.equal(q.reach, 'world');
  assert.throws(() => parseSearch(new URLSearchParams('origin=NL&destination=AMS&departDate=2026-11-01'), { today }), /differ/);
  assert.throws(() => parseSearch(new URLSearchParams('origin=NL&departDate=2026-11-01&reach=moon'), { today }), /reach/);
});

test('parseDate rejects impossible calendar dates', () => {
  const today = Date.UTC(2026, 0, 1);
  assert.throws(() => parseDate('2026-02-31', 'd', { today }), /not a real date/);
  assert.equal(parseDate('2026-02-28', 'd', { today }), '2026-02-28');
});

test('parseSearch rejects bad input with readable messages', () => {
  const today = Date.UTC(2026, 9, 18);
  const bad = [
    'origin=JF&departDate=2026-11-01',
    'origin=JFK&destination=JFK&departDate=2026-11-01',
    'origin=JFK&departDate=2025-01-01',
    'origin=JFK&departDate=2026-11-10&returnDate=2026-11-01',
    'origin=JFK&departDate=2026-11-01&returnDate=2026-12-30',
    'origin=JFK&departDate=nope',
    'origin=JFK&departDate=2026-02-31x',
  ];
  for (const qs of bad) assert.throws(() => parseSearch(new URLSearchParams(qs), { today }), ValidationError, qs);
  assert.throws(() => parseDate('2028-01-01', 'd', { today }), /too far/);
  assert.throws(() => parseBudget('-5'), ValidationError);
  assert.equal(parseBudget(''), null);
  assert.deepEqual(parseInterests(''), []);
});

test('airport lookup by airport code, city code and name', () => {
  assert.equal(findAirport('fco').name, 'Rome');
  assert.equal(findAirport('LON').city, 'LON');
  assert.equal(findAirport('ZZZ'), null);
  assert.equal(searchAirports('rome')[0].city, 'ROM');
  assert.deepEqual(searchAirports(''), []);
  const cities = destinationCities();
  assert.equal(new Set(cities.map((c) => c.city)).size, cities.length);
});

test('fetchJson reports HTTP, network and JSON errors as UpstreamError', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('{"ok":1}', { status: 200 });
  assert.deepEqual(await fetchJson('x', 'https://e.test'), { ok: 1 });
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  await assert.rejects(fetchJson('x', 'https://e.test'), (e) => e instanceof UpstreamError && e.status === 500);
  globalThis.fetch = async () => new Response('not json', { status: 200 });
  await assert.rejects(fetchJson('x', 'https://e.test'), /invalid JSON/);
  globalThis.fetch = async () => { throw new TypeError('fail'); };
  await assert.rejects(fetchJson('x', 'https://e.test'), /network error/);
});
