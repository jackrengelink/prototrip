import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoFlights, seededRandom } from '../server/providers/flights/demo.js';
import { normalizeTravelpayouts, createTravelpayouts } from '../server/providers/flights/travelpayouts.js';
import { normalizeSerpItinerary, createSerpApi } from '../server/providers/flights/serpapi.js';
import { createFlightService, applyReach, bestPerDestination, bestPerRouteInCountry, countryBatches } from '../server/providers/flights/index.js';
import { airlineName } from '../server/providers/flights/airlines.js';
import { classifyArticle, pickCandidates, normalizeWikipedia } from '../server/providers/places/wikipedia.js';
import { kindFromCategories, normalizeGeoapify } from '../server/providers/places/geoapify.js';
import { normalizeViator } from '../server/providers/places/viator.js';
import { mergePlaces } from '../server/providers/places/index.js';
import { describeWeather, normalizeDaily } from '../server/providers/weather.js';
import { createCache } from '../server/lib/cache.js';
import { findAirport } from '../server/data/airports.js';

const quiet = { warn() {}, error() {}, info() {} };
const mockFetch = (t, handler) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init) => new Response(JSON.stringify(handler(String(url), init)), { status: 200 });
};

test('cache.wrap shares one call between requests that arrive together', async () => {
  const cache = createCache();
  let calls = 0;
  const slow = async () => { calls += 1; await new Promise((r) => setTimeout(r, 5)); return 'fare'; };
  assert.deepEqual(await Promise.all([cache.wrap('k', 1000, slow), cache.wrap('k', 1000, slow)]), ['fare', 'fare']);
  assert.equal(calls, 1);
});

test('cache.wrap lets the next request retry after a failure', async () => {
  const cache = createCache();
  await assert.rejects(cache.wrap('k', 1000, async () => { throw new Error('down'); }));
  assert.equal(await cache.wrap('k', 1000, async () => 'fare'), 'fare');
});

test('warnings use the name people know, not the internal id', async (t) => {
  mockFetch(t, () => { throw new Error('down'); });
  const svc = createFlightService({ config: { travelpayoutsToken: 't', ryanair: false }, cache: createCache(), logger: quiet });
  const { warnings } = await svc.searchRoute({ origin: 'AMS', origins: ['AMS'], destination: 'BCN', departDate: '2027-01-29', returnDate: '2027-02-02' });
  assert.ok(warnings.includes('Aviasales is unavailable right now'), warnings.join());
});

test('seededRandom is deterministic', () => {
  const a = seededRandom('x');
  const b = seededRandom('x');
  assert.equal(a(), b());
});

test('demo flights: same route gives the same fares, anywhere covers many cities', async () => {
  const demo = createDemoFlights();
  const q = { origin: 'JFK', destination: 'FCO', departDate: '2026-11-12', returnDate: '2026-11-18' };
  const first = await demo.searchRoute(q);
  assert.equal(first.length, 8);
  assert.deepEqual(first, await demo.searchRoute(q));
  assert.ok(first.every((o) => o.price >= 39 && o.live === false && o.typicalRange));
  const anywhere = await demo.searchAnywhere(q);
  assert.ok(anywhere.length > 50);
  assert.ok(!anywhere.some((o) => o.destinationCity === 'NYC'));
  const rome = anywhere.find((o) => o.destinationCity === 'ROM');
  assert.equal(rome.price, Math.min(...first.map((o) => o.price)), 'anywhere and route views must agree');
  assert.deepEqual(await demo.searchRoute({ ...q, destination: 'ZZZ' }), []);
  assert.deepEqual(await demo.searchAnywhere({ ...q, origin: 'ZZZ' }), []);
});

test('travelpayouts rows are normalised with booking links', () => {
  const row = { origin: 'NYC', destination: 'ROM', origin_airport: 'JFK', destination_airport: 'FCO', price: 412, airline: 'AZ', flight_number: '611', departure_at: '2026-11-12T18:05:00-05:00', return_at: '2026-11-18T10:15:00+01:00', transfers: 0, duration_to: 520, link: '/search/NYC1211ROM18111?t=abc' };
  const o = normalizeTravelpayouts(row, { marker: 'm1', returnRequested: true });
  assert.equal(o.destination, 'FCO');
  assert.equal(o.airline, 'ITA Airways');
  assert.equal(o.departTime, '18:05');
  assert.equal(o.returnDate, '2026-11-18');
  assert.equal(o.bookingUrl, 'https://www.aviasales.com/search/NYC1211ROM18111?t=abc&marker=m1');
  const noLink = normalizeTravelpayouts({ ...row, link: undefined });
  assert.match(noLink.bookingUrl, /aviasales\.com\/search\/NYC1211ROM1$/);
  assert.equal(airlineName(null), 'Unknown airline');
  assert.equal(airlineName('zz'), 'ZZ');
});

test('travelpayouts provider builds a typical range from the month query', async (t) => {
  const prices = [300, 350, 400, 450, 500, 550];
  mockFetch(t, (url) => ({
    success: true,
    data: url.includes('departure_at=2026-11-12')
      ? [{ origin: 'NYC', destination: 'ROM', price: 250, airline: 'AZ', departure_at: '2026-11-12T18:05:00Z', transfers: 0 }]
      : prices.map((price) => ({ origin: 'NYC', destination: 'ROM', price, departure_at: '2026-11-20T10:00:00Z' })),
  }));
  const tp = createTravelpayouts({ token: 't' });
  const offers = await tp.searchRoute({ origin: 'NYC', destination: 'ROM', departDate: '2026-11-12', returnDate: null });
  assert.equal(offers.length, 1);
  assert.deepEqual(offers[0].typicalRange, [350, 500]);
  const anywhere = await tp.searchAnywhere({ origin: 'NYC', departDate: '2026-11-12', returnDate: '2026-11-18' });
  assert.equal(anywhere.length, 6);
});

test('serpapi itineraries are normalised; bad ones are dropped', async (t) => {
  const it = {
    price: 389,
    total_duration: 545,
    layovers: [{ id: 'LIS' }],
    flights: [
      { departure_airport: { id: 'JFK', time: '2026-11-12 18:05' }, arrival_airport: { id: 'LIS', time: '2026-11-13 06:00' }, airline: 'TAP Air Portugal', flight_number: 'TP 210' },
      { departure_airport: { id: 'LIS', time: '2026-11-13 07:30' }, arrival_airport: { id: 'FCO', time: '2026-11-13 11:20' }, airline: 'TAP Air Portugal', flight_number: 'TP 836' },
    ],
  };
  const o = normalizeSerpItinerary(it, { departDate: '2026-11-12', returnDate: null, typicalRange: [500, 700], searchUrl: 'https://g.test' }, 0);
  assert.equal(o.arriveDate, '2026-11-13');
  assert.equal(o.arriveTime, '11:20');
  assert.equal(o.transfers, 1);
  assert.equal(o.live, true);
  assert.equal(normalizeSerpItinerary({ price: 5, flights: [] }, {}, 0), null);

  mockFetch(t, () => ({ best_flights: [it], other_flights: [], price_insights: { typical_price_range: [500, 700] } }));
  const offers = await createSerpApi({ apiKey: 'k' }).searchRoute({ origin: 'JFK', destination: 'FCO', departDate: '2026-11-12', returnDate: '2026-11-18' });
  assert.deepEqual(offers[0].typicalRange, [500, 700]);
});

test('flight service falls back to demo fares when live providers fail', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('down', { status: 503 }));
  const svc = createFlightService({ config: { travelpayoutsToken: 't', ryanair: false }, cache: createCache(), logger: quiet });
  const res = await svc.searchRoute({ origin: 'JFK', destination: 'FCO', departDate: '2026-11-12', returnDate: '2026-11-18' });
  assert.equal(res.demo, true);
  assert.ok(res.warnings.length >= 1);
  assert.ok(res.offers.every((o, i, arr) => i === 0 || arr[i - 1].price <= o.price), 'route results sorted by price');
  assert.ok(res.offers[0].deal);
});

test('applyReach and bestPerDestination', () => {
  const mk = (id, city, km, tier, score, price) => ({ id, destinationCity: city, distanceKm: km, price, deal: { tier, score } });
  const offers = [mk('a', 'BCN', 1300, 'good', 60, 90), mk('b', 'WAS', 6300, 'great', 80, 300), mk('c', 'TYO', 9300, 'crazy', 99, 400)];
  assert.deepEqual(applyReach(offers, 'short').map((o) => o.id), ['a']);
  assert.deepEqual(applyReach(offers, 'smart').map((o) => o.id), ['a', 'c']);
  assert.equal(applyReach(offers, 'world').length, 3);
  const best = bestPerDestination([mk('x', 'BCN', 1300, 'good', 60, 90), mk('y', 'BCN', 1200, 'crazy', 95, 70)]);
  assert.deepEqual(best.map((o) => o.id), ['y']);
});

test('bestPerRouteInCountry keeps the cheapest fare per airline on each route in the country', () => {
  const mk = (origin, destination, airline, price) => ({ origin, destination, destinationCity: destination, airline, price });
  const offers = [mk('EIN', 'BCN', 'Ryanair', 90), mk('EIN', 'BCN', 'Ryanair', 50), mk('EIN', 'BCN', 'Transavia', 70), mk('DUS', 'BCN', 'KLM', 60), mk('EIN', 'FCO', 'Ryanair', 9)];
  const kept = bestPerRouteInCountry(offers, 'ES');
  assert.deepEqual(kept.map((o) => `${o.origin}-${o.destination}-${o.airline}-${o.price}`).sort(),
    ['DUS-BCN-KLM-60', 'EIN-BCN-Ryanair-50', 'EIN-BCN-Transavia-70']);
});

test('countryBatches caps the Google searches a country can cost', () => {
  const origins = ['AMS', 'FMO', 'DUS', 'EIN', 'NRN', 'RTM', 'GRQ', 'CGN'];
  const small = countryBatches(origins, ['LIS', 'OPO', 'FAO']);
  assert.equal(small.length, 3);
  assert.ok(small.every((b) => b.origins.length <= 3));
  const big = countryBatches(origins, Array.from({ length: 40 }, (_, i) => `A${String(i).padStart(2, '0')}`));
  assert.equal(big.length, 6);
  assert.ok(big.every((b) => b.destinations.length <= 7));
  assert.ok(!countryBatches(['DUS'], ['DUS', 'BER'])[0].destinations.includes('DUS'), 'never to the airport you leave from');
});

test('country search adds Google Flights, caches it, and survives a Google failure', async (t) => {
  const itinerary = (from, to, airline, price) => ({
    price, flights: [{ departure_airport: { id: from, time: '2027-01-29 10:00' }, arrival_airport: { id: to, time: '2027-01-29 13:00' }, airline, flight_number: `${airline} ${price}` }],
  });
  let calls = 0;
  const mock = t.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    const u = new URL(String(url));
    assert.match(u.searchParams.get('arrival_id'), /LIS,OPO|OPO,LIS|LIS/);
    return new Response(JSON.stringify({ best_flights: [itinerary('AMS', 'LIS', 'KLM', 180), itinerary('AMS', 'LIS', 'TAP', 170)] }), { status: 200 });
  });
  const svc = createFlightService({ config: { ryanair: false, serpapiKey: 'k' }, cache: createCache(), logger: quiet });
  const q = { origin: 'NL', origins: ['AMS'], country: 'PT', departDate: '2027-01-29', returnDate: '2027-02-02' };
  const res = await svc.searchAnywhere(q);
  assert.deepEqual(res.offers.filter((o) => o.source === 'serpapi').map((o) => o.airline), ['TAP', 'KLM']);
  const used = calls;
  await svc.searchAnywhere(q);
  assert.equal(calls, used, 'second search comes from the cache');

  mock.mock.mockImplementation(async () => new Response('down', { status: 503 }));
  const svc2 = createFlightService({ config: { ryanair: false, serpapiKey: 'k' }, cache: createCache(), logger: quiet });
  const failed = await svc2.searchAnywhere(q);
  assert.match(failed.warnings.join(), /may be incomplete/);
});

test('sorting uses the flight price, not flight + train', async () => {
  const svc = createFlightService({ config: { ryanair: false }, cache: createCache(), logger: quiet });
  const q = { origin: 'NL', origins: ['AMS', 'NRN'], country: 'ES', departDate: '2026-11-12', returnDate: '2026-11-18' };
  const { offers } = await svc.searchAnywhere(q);
  assert.ok(offers.every((o, i, arr) => i === 0 || arr[i - 1].price <= o.price));
  const route = await svc.searchRoute({ ...q, destination: 'BCN', country: null });
  assert.ok(route.offers.every((o, i, arr) => i === 0 || arr[i - 1].price <= o.price));
  assert.ok(route.offers.every((o) => o.travelEur > 0), 'the train/bus cost stays a separate number');
});

test('country search ignores reach and returns every route into that country', async () => {
  const svc = createFlightService({ config: { ryanair: false }, cache: createCache(), logger: quiet });
  const res = await svc.searchAnywhere({ origin: 'NL', origins: ['AMS', 'DUS'], country: 'ES', reach: 'short', departDate: '2026-11-12', returnDate: '2026-11-18' });
  assert.equal(res.country.name, 'Spain');
  assert.ok(new Set(res.offers.map((o) => o.origin)).size === 2, 'both origins');
  assert.ok(new Set(res.offers.map((o) => o.destination)).size >= 5, 'several Spanish airports');
  assert.ok(res.offers.every((o) => findAirport(o.destination).country === 'ES'));
});

test('travelpayouts ignores booking links that are not plain paths', () => {
  const row = { origin: 'AMS', destination: 'BCN', price: 80, departure_at: '2026-11-12T08:00:00Z', link: '.evil.com/x' };
  assert.match(normalizeTravelpayouts(row).bookingUrl, /^https:\/\/www\.aviasales\.com\/search\//);
});

test('flight service with no keys runs anywhere search in demo mode, cheapest flight first', async () => {
  const svc = createFlightService({ config: { ryanair: false }, cache: createCache(), logger: quiet });
  assert.deepEqual(svc.providers, []);
  const res = await svc.searchAnywhere({ origin: 'LHR', departDate: '2026-11-12', returnDate: null });
  assert.ok(res.offers.every((o, i, arr) => i === 0 || arr[i - 1].price <= o.price));
});

test('wikipedia: classify, pick biggest articles, normalise popularity', () => {
  assert.equal(classifyArticle('Colosseum', 'Ancient Roman amphitheater'), 'sight');
  assert.equal(classifyArticle('Rome Termini', 'railway station'), null);
  assert.equal(classifyArticle('Vatican Museums', 'Art museum'), 'museum');
  assert.equal(classifyArticle('List of tallest churches', 'church list'), null);
  const body = { query: { pages: {
    1: { pageid: 1, title: 'Colosseum', description: 'Ancient amphitheatre', length: 70000, coordinates: [{ lat: 41.89, lon: 12.49 }] },
    2: { pageid: 2, title: 'Side Chapel', description: 'Small church', length: 3000, coordinates: [{ lat: 41.9, lon: 12.5 }] },
    3: { pageid: 3, title: 'Some Hotel', description: 'Hotel in Rome', length: 9000, coordinates: [{ lat: 41.9, lon: 12.5 }] },
    4: { pageid: 4, title: 'No coords church', description: 'church', length: 1 },
  } } };
  const candidates = pickCandidates(body);
  assert.deepEqual(candidates.map((c) => c.title), ['Colosseum', 'Side Chapel']);
  const places = normalizeWikipedia(candidates, { query: { pages: { 1: { pageviews: { a: 9000, b: 1000 }, thumbnail: { source: 'https://img.test/c.jpg' } } } } });
  assert.equal(places[0].popularity, 1);
  assert.equal(places[0].image, 'https://img.test/c.jpg');
  assert.ok(places[1].popularity < 1);
  assert.ok(normalizeWikipedia(candidates, null).every((p) => p.popularity > 0));
});

test('geoapify categories map to place kinds', () => {
  assert.equal(kindFromCategories(['entertainment.museum']), 'museum');
  assert.equal(kindFromCategories(['catering.bar']), 'nightlife');
  assert.equal(kindFromCategories(['catering.restaurant.pizza']), 'food');
  assert.equal(kindFromCategories(['leisure.park']), 'nature');
  assert.equal(kindFromCategories(['commercial.marketplace']), 'shopping');
  assert.equal(kindFromCategories(['tourism.sights']), 'sight');
  assert.equal(kindFromCategories(['office']), null);
  const places = normalizeGeoapify({ features: [
    { properties: { name: 'Da Enzo', lat: 41.88, lon: 12.47, categories: ['catering.restaurant'], place_id: 'p1' } },
    { properties: { lat: 1, lon: 1, categories: ['catering.cafe'] } },
  ] });
  assert.equal(places.length, 1);
  assert.equal(places[0].kind, 'food');
});

test('viator products are normalised', () => {
  const [x] = normalizeViator({ products: { results: [{
    productCode: 'P1', title: 'Colosseum tour', description: 'Skip the line', productUrl: 'https://viator.test/p1',
    images: [{ variants: [{ url: 'https://i/s.jpg', width: 200 }, { url: 'https://i/m.jpg', width: 480 }] }],
    reviews: { combinedAverageRating: 4.8, totalReviews: 1200 }, pricing: { summary: { fromPrice: 59 }, currency: 'USD' },
    duration: { fixedDurationInMinutes: 180 },
  }] } });
  assert.equal(x.image, 'https://i/m.jpg');
  assert.equal(x.duration, '3 h');
  assert.deepEqual(normalizeViator({}), []);
});

test('mergePlaces removes near-duplicates across sources', () => {
  const merged = mergePlaces(
    [{ id: 'a', name: 'Pantheon', lat: 41.8986, lon: 12.4769 }],
    [{ id: 'b', name: 'Pantheon, Rome', lat: 41.8987, lon: 12.477 }, { id: 'c', name: 'Pantheon', lat: 48.846, lon: 2.346 }],
  );
  assert.deepEqual(merged.map((p) => p.id), ['a', 'c']);
});

test('weather helpers', () => {
  assert.equal(describeWeather(0), 'Clear');
  assert.equal(describeWeather(63), 'Rain');
  assert.equal(describeWeather(95), 'Thunderstorms');
  const days = normalizeDaily({ daily: { time: ['2025-11-12'], temperature_2m_max: [18.6], temperature_2m_min: [9.2], precipitation_sum: [1.26], weather_code: [61] } }, ['2026-11-12'], true);
  assert.deepEqual(days[0], { date: '2026-11-12', high: 19, low: 9, rainMm: 1.3, summary: 'Rain', typical: true });
  assert.deepEqual(normalizeDaily({}, [], false), []);
});
