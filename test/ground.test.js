// Bus & train mode (FlixBus/FlixTrain) and door-to-door flight prices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReachable, normalizeTrip, flixBookingUrl, createFlixbus, ENSCHEDE_FLIX_ID } from '../server/providers/ground/flixbus.js';
import { cityToOffer, bestConnection, createGroundService } from '../server/providers/ground/index.js';
import { crazyLine, scoreDeal, scoreOffers } from '../server/lib/deals.js';
import { parseGroundSearch, parseCityId, parseStay, ValidationError } from '../server/lib/validate.js';
import { createCache } from '../server/lib/cache.js';

const quiet = { warn() {}, error() {}, info() {} };
const BERLIN = '40d8f682-8646-11e6-9066-549f350fcb0c';
// Shapes copied from real FlixBus responses (Oct 2026).
const berlinReachable = {
  uuid: BERLIN, name: 'Berlin', country: 'DE', location: { lat: 52.525, lon: 13.3695 },
  price: { EUR: { min: 28.48, avg: 37.98, max: 57.98 } }, min_duration: 320, avg_duration: 398.7, transportation_category: ['bus', 'flixtrain'], interconnection: false,
  search_volume: 38211700,
};
const trip = (dep, arr, price, legs = ['bus']) => ({
  uid: `direct:${dep}`, status: 'available', departure: { date: dep }, arrival: { date: arr }, price: { total: price },
  legs: legs.map((m) => ({ means_of_transport: m })),
});

test('ground crazy line: grows with distance, capped at €50 return', () => {
  assert.equal(crazyLine(141, { mode: 'ground' }), 23); // Amsterdam
  assert.equal(crazyLine(441, { mode: 'ground' }), 47); // Berlin
  assert.equal(crazyLine(900, { mode: 'ground' }), 50); // capped
  assert.ok(crazyLine(900, { mode: 'ground' }) < crazyLine(900), 'long bus rides must be cheaper than flights to count');
});

test('ground tiers match the €50-70 budget', () => {
  assert.equal(scoreDeal({ price: 46.98, distanceKm: 441, mode: 'ground' }).tier, 'crazy', 'real Berlin €46.98 return');
  assert.equal(scoreDeal({ price: 65, distanceKm: 441, mode: 'ground' }).tier, 'great', '€65 Berlin: inside the budget');
  assert.equal(scoreDeal({ price: 95, distanceKm: 493, mode: 'ground' }).tier, 'good');
});

test('flixbus parsing: reachable cities and connections', () => {
  const c = normalizeReachable(berlinReachable);
  assert.deepEqual([c.name, c.country, c.minPrice, c.avgPrice, c.minDurationMin, c.direct], ['Berlin', 'DE', 28.48, 37.98, 320, true]);
  assert.equal(normalizeReachable({ uuid: 'x' }), null);
  const t = normalizeTrip(trip('2026-11-20T07:33:00+01:00', '2026-11-20T14:31:00+01:00', 45.99, ['train', 'train', 'bus']));
  assert.equal(t.durationMin, 418);
  assert.equal(t.transfers, 2);
  assert.deepEqual(t.modes, ['train', 'bus']);
  assert.equal(t.departTime, '07:33');
  assert.equal(normalizeTrip({}), null);
  assert.match(flixBookingUrl({ fromId: ENSCHEDE_FLIX_ID, toId: BERLIN, date: '2026-11-20', returnDate: '2026-11-23' }), /rideDate=20\.11\.2026.*backRide=23\.11\.2026/);
});

test('cityToOffer: return estimate, usual price and map coordinates', () => {
  const o = cityToOffer(normalizeReachable(berlinReachable), { departDate: '2026-11-20', returnDate: '2026-11-23' });
  assert.equal(o.mode, 'ground');
  assert.equal(o.price, 56.96);
  assert.deepEqual(o.typicalRange, [75.96, 75.96]);
  assert.equal(o.priceIsFrom, true);
  assert.equal(o.coords.destination[0], 52.525);
  assert.equal(o.transfers, 0);
});

test('bestConnection trades a little money for a lot of time', () => {
  const cheapSlow = normalizeTrip(trip('2026-11-20T06:00:00+01:00', '2026-11-20T18:00:00+01:00', 20));
  const fast = normalizeTrip(trip('2026-11-20T08:00:00+01:00', '2026-11-20T13:00:00+01:00', 24));
  assert.equal(bestConnection([cheapSlow, fast]).departTime, '08:00');
  assert.equal(bestConnection([]), null);
});

function fakeFlix() {
  const far = { ...berlinReachable, uuid: '11111111-1111-1111-1111-111111111111', name: 'Lisbon', min_duration: 1900, location: { lat: 38.7, lon: -9.1 } };
  const near = { ...berlinReachable, uuid: '22222222-2222-2222-2222-222222222222', name: 'Hengelo', location: { lat: 52.26, lon: 6.79 } };
  const tinyTown = { ...berlinReachable, uuid: '55555555-5555-5555-5555-555555555555', name: 'Bünde', search_volume: 29500, location: { lat: 52.2, lon: 8.58 } };
  const dutch = { ...berlinReachable, uuid: '44444444-4444-4444-4444-444444444444', name: 'Amsterdam', country: 'NL', location: { lat: 52.37, lon: 4.9 } };
  const airport = { ...berlinReachable, uuid: '33333333-3333-3333-3333-333333333333', name: 'Paris CDG Airport', location: { lat: 49.0, lon: 2.55 } };
  return {
    reachable: async () => [berlinReachable, far, near, airport, dutch, tinyTown].map(normalizeReachable),
    search: async ({ toId, date }) => (toId === BERLIN
      ? [normalizeTrip(trip(`${date}T02:05:00+01:00`, `${date}T08:25:00+01:00`, 23.49))]
      : [normalizeTrip(trip(`${date}T21:00:00+01:00`, `${date}T23:59:00+01:00`, 23.49))]),
  };
}

test('ground service: filters far, next-door and airport stops; plans a real trip', async () => {
  const svc = createGroundService({ cache: createCache(), logger: quiet, flix: fakeFlix() });
  const res = await svc.searchAnywhere({ departDate: '2026-11-20', returnDate: '2026-11-23' });
  assert.deepEqual(res.offers.map((o) => o.destinationName), ['Berlin']);
  const withNl = await svc.searchAnywhere({ departDate: '2026-11-20', returnDate: '2026-11-23', domestic: true });
  assert.deepEqual(withNl.offers.map((o) => o.destinationName).sort(), ['Amsterdam', 'Berlin']);
  const t = await svc.trip({ cityId: BERLIN, departDate: '2026-11-20', returnDate: '2026-11-23' });
  assert.equal(t.offer.price, 46.98);
  assert.equal(t.offer.deal.tier, 'crazy');
  assert.equal(t.outbound.departTime, '02:05');
  assert.equal(await svc.trip({ cityId: 'nope', departDate: '2026-11-20' }), null);
});

test('ground service reports FlixBus outages instead of throwing', async () => {
  const svc = createGroundService({ cache: createCache(), logger: quiet, flix: { reachable: async () => { throw new Error('down'); } } });
  const res = await svc.searchAnywhere({ departDate: '2026-11-20', returnDate: null });
  assert.deepEqual(res.offers, []);
  assert.match(res.warnings[0], /FlixBus/);
});

test('flixbus client builds the right requests', async () => {
  const urls = [];
  const fetcher = async (_s, url) => {
    urls.push(url);
    return url.includes('reachable')
      ? { result: [berlinReachable] }
      : { trips: [{ results: { a: trip('2026-11-20T02:05:00+01:00', '2026-11-20T08:25:00+01:00', 23.49) } }] };
  };
  const flix = createFlixbus({ fetcher });
  assert.equal((await flix.reachable()).length, 1);
  assert.equal((await flix.search({ fromId: ENSCHEDE_FLIX_ID, toId: BERLIN, date: '2026-11-20' })).length, 1);
  assert.match(urls[1], /departure_date=20\.11\.2026/);
});

test('door-to-door: a cheap Charleroi flight pays for the trip to Belgium', () => {
  const offers = [
    { origin: 'CRL', destination: 'TIA', price: 34, travelEur: 100, totalPrice: 134 },
    { origin: 'EIN', destination: 'TIA', price: 60, travelEur: 45, totalPrice: 105 },
  ];
  const [crl, ein] = scoreOffers(offers, { distanceFor: () => 1550 });
  assert.ok(ein.deal.score > crl.deal.score, 'Eindhoven wins once the trip to the airport counts');
  assert.notEqual(crl.deal.tier, 'crazy');
});

test('validation for bus & train searches and places', () => {
  const today = Date.UTC(2026, 9, 18);
  assert.deepEqual(parseGroundSearch(new URLSearchParams('departDate=2026-11-20&returnDate=2026-11-23&budget=70'), { today }),
    { departDate: '2026-11-20', returnDate: '2026-11-23', budget: 70, interests: [], domestic: false });
  assert.throws(() => parseGroundSearch(new URLSearchParams('departDate=2026-11-23&returnDate=2026-11-20'), { today }), ValidationError);
  assert.equal(parseCityId(BERLIN.toUpperCase()), BERLIN);
  assert.throws(() => parseCityId('../etc'), ValidationError);
  const stay = parseStay(new URLSearchParams('name=Berlin&lat=52.52&lon=13.37&country=de&startDate=2026-11-20&endDate=2026-11-23'), { today });
  assert.deepEqual(stay.place, { name: 'Berlin', lat: 52.52, lon: 13.37, country: 'DE' });
  assert.equal(stay.destination, null);
  assert.throws(() => parseStay(new URLSearchParams('name=<script>&lat=1&lon=1&startDate=2026-11-20&endDate=2026-11-21'), { today }), /name/);
  assert.throws(() => parseStay(new URLSearchParams('name=X&lat=99&lon=1&startDate=2026-11-20&endDate=2026-11-21'), { today }), /lat/);
});
