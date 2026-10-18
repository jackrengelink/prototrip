// Integration tests: real HTTP server, real flight service (demo mode), fake places/weather (no network).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../server/app.js';
import { createFlightService } from '../server/providers/flights/index.js';
import { createCache } from '../server/lib/cache.js';
import { loadConfig } from '../server/config.js';
import { estimateArrival, chooseOffer } from '../server/trip.js';

const quiet = { warn() {}, error() {}, info() {} };
// Ryanair off: tests must never hit the network.
const config = loadConfig({ RYANAIR: 'off' });
const places = {
  sources: ['fake'],
  nearby: async () => ({
    places: [
      { id: 's1', name: 'Colosseum', lat: 41.8902, lon: 12.4922, kind: 'sight', popularity: 1 },
      { id: 's2', name: 'Roman Forum', lat: 41.8925, lon: 12.4853, kind: 'sight', popularity: 0.9 },
      { id: 'f1', name: 'Trattoria', lat: 41.891, lon: 12.49, kind: 'food', popularity: 0.3 },
    ],
    warnings: [],
  }),
  experiences: async () => [],
};
const weather = { geocode: async () => ({ lat: 41.9, lon: 12.5 }), forecast: async () => [] };
const BERLIN_ID = '40d8f682-8646-11e6-9066-549f350fcb0c';
const groundOffer = { id: `flix-${BERLIN_ID}`, mode: 'ground', destinationName: 'Berlin', price: 56.96, coords: { origin: [52.2, 6.9], destination: [52.5, 13.4] }, deal: { tier: 'great', score: 50 } };
const ground = {
  searchAnywhere: async () => ({ offers: [groundOffer, { ...groundOffer, id: 'flix-x', price: 120 }], warnings: [], demo: false }),
  trip: async ({ cityId }) => (cityId === BERLIN_ID ? {
    city: { name: 'Berlin', country: 'DE', lat: 52.52, lon: 13.37 },
    offer: { ...groundOffer, price: 46.98 },
    outbound: { departTime: '02:05', arriveTime: '08:25', arriveDate: '2026-11-21' },
    inbound: { departTime: '21:00' },
    outboundOptions: [], inboundOptions: [], bookingUrl: 'https://shop.flixbus.com/search',
  } : null),
};

let server;
let base;
before(async () => {
  const app = createApp({ config, flights: createFlightService({ config, cache: createCache(), logger: quiet }), ground, places, weather, logger: quiet });
  server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const future = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const get = async (path) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, headers: res.headers, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
};

test('GET /api/status reports demo mode with no keys', async () => {
  const { body } = await get('/api/status');
  assert.deepEqual(body.data.flights, ['demo']);
  assert.equal(body.data.demoMode, true);
  assert.equal(body.data.home.code, 'NL');
  assert.ok(body.data.home.airports.some((a) => a.iata === 'EIN' && a.travelMin > 0));
});

test('GET /api/airports searches by name', async () => {
  const { body } = await get('/api/airports?q=lisbon');
  assert.equal(body.data[0].iata, 'LIS');
});

test('GET /api/deals anywhere returns scored deals and honours the budget', async () => {
  const { body } = await get(`/api/deals?origin=LHR&departDate=${future(30)}&returnDate=${future(35)}&budget=300`);
  assert.equal(body.success, true);
  assert.equal(body.data.demo, true);
  assert.ok(body.data.offers.length > 0);
  assert.ok(body.data.offers.every((o) => o.price <= 300 && o.deal));
  assert.ok(body.data.offers.every((o) => o.coords.origin.length === 2 && o.coords.destination.length === 2), 'every fare can be drawn on the map');
  assert.equal(body.data.links, null);
});

test('GET /api/deals for a route includes comparison links', async () => {
  const { body } = await get(`/api/deals?origin=JFK&destination=FCO&departDate=${future(30)}`);
  assert.equal(body.data.links.length, 5);
});

test('GET /api/trip returns just the flight side, without touching places', async () => {
  let placeCalls = 0;
  const original = places.nearby;
  places.nearby = async (...args) => { placeCalls++; return original(...args); };
  const { body } = await get(`/api/trip?origin=JFK&destination=FCO&departDate=${future(30)}&returnDate=${future(34)}&interests=history`);
  places.nearby = original;
  assert.equal(body.success, true);
  const trip = body.data;
  assert.equal(trip.destination.name, 'Rome');
  assert.ok(trip.flight.price > 0);
  assert.ok(trip.stay.startDate && trip.stay.endDate);
  assert.equal(trip.itinerary, undefined);
  assert.equal(trip.compare.length, 5);
  assert.equal(placeCalls, 0, 'things to do must only load on click');
});

test('GET /api/explore builds the day-by-day plan on demand', async () => {
  const qs = new URLSearchParams({ destination: 'FCO', startDate: future(31), endDate: future(34), arrivalTime: '10:30', departureTime: '18:00', interests: 'history' });
  const { body } = await get(`/api/explore?${qs}`);
  assert.equal(body.success, true);
  assert.equal(body.data.itinerary.days.length, 4);
  assert.ok(body.data.itinerary.days.flatMap((d) => d.items).some((i) => i.title === 'Colosseum'));
  assert.equal(body.data.placeCounts.sight, 2);
  const bad = await get(`/api/explore?destination=FCO&startDate=${future(31)}&endDate=${future(34)}&arrivalTime=25:99`);
  assert.equal(bad.status, 400);
});

test('validation errors return 400 with a message', async () => {
  const cases = [
    '/api/deals?origin=XX&departDate=2026-11-01',
    `/api/trip?origin=JFK&departDate=${future(10)}`,
    `/api/trip?origin=JFK&destination=FCO&departDate=${future(10)}&offerId=${encodeURIComponent('<script>')}`,
  ];
  for (const path of cases) {
    const { status, body } = await get(path);
    assert.equal(status, 400, path);
    assert.equal(body.success, false);
    assert.ok(body.error);
  }
});

test('unknown API route is 404, bad method is 405', async () => {
  assert.equal((await get('/api/nope')).status, 404);
  const res = await fetch(`${base}/api/status`, { method: 'POST' });
  assert.equal(res.status, 405);
});

test('NL searches every home airport and the smart reach hides non-crazy long-haul', async () => {
  const { body } = await get(`/api/deals?origin=NL&departDate=${future(30)}&returnDate=${future(35)}&reach=smart`);
  const offers = body.data.offers;
  assert.ok(offers.length > 0);
  assert.ok(new Set(offers.map((o) => o.origin)).size > 1, 'expected fares from several Dutch/nearby airports');
  assert.ok(offers.every((o) => o.distanceKm <= 3600 || o.deal.tier === 'crazy'));
  assert.ok(offers.every((o) => o.travelMin > 0));
  const short = await get(`/api/deals?origin=NL&departDate=${future(30)}&returnDate=${future(35)}&reach=short`);
  assert.ok(short.body.data.offers.every((o) => o.distanceKm <= 3600));
  const world = await get(`/api/deals?origin=NL&departDate=${future(30)}&returnDate=${future(35)}&reach=world`);
  assert.ok(world.body.data.offers.length >= offers.length);
});

test('a trip from the NL group is planned from the chosen airport', async () => {
  const { body } = await get(`/api/trip?origin=NL&destination=BCN&departDate=${future(30)}&returnDate=${future(33)}`);
  assert.equal(body.success, true);
  assert.notEqual(body.data.flight.origin, 'NL');
  assert.match(body.data.compare[0].url, new RegExp(`/${body.data.flight.origin.toLowerCase()}/bcn/`));
});

test('bus & train mode: deals, budget and a trip with stay info', async () => {
  const deals = await get(`/api/deals?mode=ground&departDate=${future(30)}&returnDate=${future(33)}&budget=70`);
  assert.equal(deals.body.data.mode, 'ground');
  assert.deepEqual(deals.body.data.offers.map((o) => o.price), [56.96]);
  const t = await get(`/api/ground-trip?city=${BERLIN_ID}&departDate=${future(30)}&returnDate=${future(33)}`);
  assert.equal(t.body.data.mode, 'ground');
  assert.equal(t.body.data.stay.arrivalTime, '08:25');
  assert.equal(t.body.data.compare.find((c) => c.id === 'flixbus').url, 'https://shop.flixbus.com/search');
  const unknown = await get(`/api/ground-trip?city=11111111-1111-1111-1111-111111111111&departDate=${future(30)}`);
  assert.equal(unknown.status, 400);
});

test('explore works for a place without an airport code', async () => {
  const qs = new URLSearchParams({ name: 'Berlin', lat: '52.52', lon: '13.37', country: 'DE', startDate: future(31), endDate: future(33) });
  const { body } = await get(`/api/explore?${qs}`);
  assert.equal(body.success, true);
  assert.equal(body.data.destination.name, 'Berlin');
  assert.equal(body.data.itinerary.days.length, 3);
});

test('malformed URLs get a 400 instead of crashing the server', async () => {
  assert.equal((await get('/%E0%A4%A')).status, 400);
  assert.equal((await get('/api/status')).status, 200, 'server still up');
});

test('static files are served with security headers and no path traversal', async () => {
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await get('/js/app.js')).status, 200);
  assert.equal((await get('/missing.css')).status, 404);
  const traversal = await get('/%2e%2e/package.json');
  assert.ok([403, 404].includes(traversal.status));
});

test('estimateArrival handles provider times, overnight flights and estimates', () => {
  assert.deepEqual(estimateArrival({ arriveDate: '2026-11-13', arriveTime: '08:00' }), { date: '2026-11-13', time: '08:00', estimated: false });
  assert.equal(estimateArrival({ departDate: '2026-11-12', departTime: '22:00', arriveTime: '07:00' }).date, '2026-11-13');
  const est = estimateArrival({ origin: 'JFK', destination: 'FCO', departDate: '2026-11-12', departTime: '18:00', durationMin: 540 });
  assert.equal(est.estimated, true);
  assert.equal(est.date, '2026-11-13');
  assert.equal(estimateArrival({ departDate: '2026-11-12' }).time, null);
});

test('chooseOffer picks the requested id or the best value', () => {
  const offers = [{ id: 'a', price: 400, transfers: 2 }, { id: 'b', price: 420, transfers: 0 }];
  assert.equal(chooseOffer(offers, 'a').id, 'a');
  assert.equal(chooseOffer(offers, null).id, 'b');
  assert.equal(chooseOffer([], null), null);
});
