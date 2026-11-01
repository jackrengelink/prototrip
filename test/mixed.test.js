import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairOneWays, cheapestPerAirportPair } from '../server/providers/flights/mixed.js';
import { createFlightService, coordsFor } from '../server/providers/flights/index.js';
import { chooseOffer } from '../server/trip.js';
import { createCache } from '../server/lib/cache.js';

const quiet = { warn() {}, error() {}, info() {} };
const leg = (origin, destination, departDate, price) => ({
  id: `${origin}-${destination}`, source: 'ryanair', live: true, origin, destination, destinationCity: destination, destinationName: destination,
  departDate, departTime: '10:00', arriveDate: departDate, arriveTime: '13:00', returnDate: null, returnTime: null,
  price, previousPrice: null, currency: 'EUR', airline: 'Ryanair', flightNumber: `FR${price}`, transfers: 0, durationMin: null, bookingUrl: `https://book/${origin}-${destination}`,
});
const dates = { departDate: '2027-01-29', returnDate: '2027-02-02', flex: 0 };

test('pairOneWays flies home from a different airport, and adds up both tickets', () => {
  const [trip, ...others] = pairOneWays([leg('EIN', 'OPO', '2027-01-29', 20)], [leg('FAO', 'EIN', '2027-02-02', 30)], dates);
  assert.equal(others.length, 0);
  assert.equal(trip.mixed, true);
  assert.equal(trip.price, 50);
  assert.equal(trip.outPrice, 20);
  assert.equal(trip.backPrice, 30);
  assert.equal(trip.destination, 'OPO');
  assert.equal(trip.returnFrom, 'FAO');
  assert.equal(trip.returnTo, 'EIN');
  assert.equal(trip.returnDate, '2027-02-02');
  assert.equal(trip.returnTime, '10:00');
  assert.equal(trip.bookingUrl, 'https://book/EIN-OPO');
  assert.equal(trip.returnBookingUrl, 'https://book/FAO-EIN');
});

test('pairOneWays allows a different home airport, but skips the plain return', () => {
  const outs = [leg('EIN', 'OPO', '2027-01-29', 20)];
  assert.deepEqual(pairOneWays(outs, [leg('OPO', 'EIN', '2027-02-02', 30)], dates), []);
  const [trip] = pairOneWays(outs, [leg('OPO', 'AMS', '2027-02-02', 30)], dates);
  assert.equal(trip.returnTo, 'AMS');
  assert.equal(trip.returnFrom, 'OPO');
});

test('pairOneWays keeps the trip length within a night of what was asked', () => {
  const outs = [leg('EIN', 'OPO', '2027-01-29', 20)];
  const backs = [leg('FAO', 'EIN', '2027-02-03', 30), leg('FAO', 'AMS', '2027-02-04', 30), leg('FAO', 'NRN', '2027-01-29', 30)];
  assert.deepEqual(pairOneWays(outs, backs, { ...dates, flex: 3 }).map((t) => t.returnTo), ['EIN']);
  assert.deepEqual(pairOneWays(outs, backs, dates), []);
});

test('pairOneWays skips airports too far apart to travel between yourself', () => {
  const outs = [leg('EIN', 'SVQ', '2027-01-29', 20)];
  const backs = [leg('AGP', 'EIN', '2027-02-02', 30), leg('PMI', 'EIN', '2027-02-02', 30)];
  assert.deepEqual(pairOneWays(outs, backs, dates).map((t) => t.returnFrom), ['AGP']);
});

test('pairOneWays gives every combination its own id', () => {
  const trips = pairOneWays([leg('EIN', 'OPO', '2027-01-29', 20)], [leg('FAO', 'EIN', '2027-02-02', 30), leg('FAO', 'AMS', '2027-02-02', 30)], dates);
  assert.equal(new Set(trips.map((t) => t.id)).size, 2);
  assert.ok(trips.every((t) => /^[\w.:+-]{1,200}$/.test(t.id)), 'must pass the offerId check');
});

test('cheapestPerAirportPair keeps one trip per way in and way out', () => {
  const outs = [leg('EIN', 'OPO', '2027-01-29', 20), leg('AMS', 'OPO', '2027-01-29', 40)];
  const backs = [leg('FAO', 'EIN', '2027-02-02', 30), leg('FAO', 'AMS', '2027-02-02', 10)];
  const kept = cheapestPerAirportPair(pairOneWays(outs, backs, dates));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].price, 30);
});

test('chooseOffer never picks a two-ticket trip by itself', () => {
  const plain = { id: 'a', price: 100, transfers: 0 };
  const mixed = { id: 'b', price: 40, transfers: 0, mixed: true };
  assert.equal(chooseOffer([mixed, plain], null).id, 'a');
  assert.equal(chooseOffer([mixed, plain], 'b').id, 'b');
  assert.equal(chooseOffer([mixed], null).id, 'b');
});

test('coordsFor includes the airports of the way home', () => {
  const c = coordsFor({ origin: 'EIN', destination: 'OPO', returnFrom: 'FAO', returnTo: 'AMS' });
  assert.ok(c.returnFrom[0] < c.destination[0], 'Faro is south of Porto');
  assert.ok(c.returnTo[0] > 52, 'Amsterdam');
  assert.equal(coordsFor({ origin: 'EIN', destination: 'OPO' }).returnFrom, undefined);
});

/** Fake Ryanair: Porto and Faro are reached from Eindhoven, and both fly home. */
function fakeRyanair(t) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  const fare = (from, to, date, value) => ({
    outbound: {
      departureAirport: { iataCode: from }, arrivalAirport: { iataCode: to, city: { name: to } },
      departureDate: `${date}T10:00:00`, arrivalDate: `${date}T13:00:00`, price: { value, currencyCode: 'EUR' }, flightNumber: `FR${value}`,
    },
    summary: { price: { value, currencyCode: 'EUR' } },
  });
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const from = u.searchParams.get('departureAirportIataCode');
    calls.push(`${u.pathname.split('/').pop()}:${from}`);
    const oneWay = {
      EIN: [fare('EIN', 'OPO', dates.departDate, 20), fare('EIN', 'FAO', dates.departDate, 25), fare('EIN', 'BCN', dates.departDate, 5)],
      OPO: [fare('OPO', 'EIN', dates.returnDate, 30)],
      FAO: [fare('FAO', 'EIN', dates.returnDate, 15), fare('FAO', 'DUB', dates.returnDate, 1)],
    };
    const fares = u.pathname.endsWith('oneWayFares') ? oneWay[from] || [] : [];
    return new Response(JSON.stringify({ fares }), { status: 200 });
  };
  return calls;
}

test('a country search adds trips flying home from another airport there', async (t) => {
  const calls = fakeRyanair(t);
  const svc = createFlightService({ config: {}, cache: createCache(), logger: quiet });
  const { offers } = await svc.searchAnywhere({ ...dates, origin: 'NL', origins: ['EIN'], country: 'PT', destination: null });
  assert.deepEqual(offers.map((o) => `${o.origin}-${o.destination}/${o.returnFrom}-${o.returnTo}-${o.price}`).sort(),
    ['EIN-FAO/OPO-EIN-55', 'EIN-OPO/FAO-EIN-35']);
  assert.ok(offers.every((o) => o.deal && o.coords.returnFrom), 'scored and placed on the map');
  assert.ok(offers.every((o) => o.totalPrice > o.price), 'the train is counted');
  assert.ok(!calls.includes('oneWayFares:BCN'), 'only airports in the country are searched');
});

test('a mixed trip counts half the train to each home airport', async (t) => {
  fakeRyanair(t);
  const svc = createFlightService({ config: {}, cache: createCache(), logger: quiet });
  const { offers } = await svc.searchAnywhere({ ...dates, origin: 'NL', origins: ['EIN'], country: 'PT', destination: null });
  const [trip] = offers;
  assert.equal(trip.totalPrice, trip.price + trip.travelEur);
  assert.ok(trip.travelEur > 0);
});

test('a route search shows them too, and one-way searches do not', async (t) => {
  fakeRyanair(t);
  const svc = createFlightService({ config: {}, cache: createCache(), logger: quiet });
  const { offers } = await svc.searchRoute({ ...dates, origin: 'NL', origins: ['EIN'], destination: 'OPO' });
  assert.deepEqual(offers.map((o) => `${o.destination}/${o.returnFrom}`), ['OPO/FAO']);
  const oneWay = await svc.searchRoute({ ...dates, returnDate: null, origin: 'NL', origins: ['EIN'], destination: 'OPO' });
  assert.ok(oneWay.offers.every((o) => !o.mixed));
});

test('a chosen trip is found again when no outbound ticket reaches its way-home airport that day', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const fare = (from, to, date) => ({
    outbound: { departureAirport: { iataCode: from }, arrivalAirport: { iataCode: to, city: { name: to } }, departureDate: `${date}T10:00:00`, arrivalDate: `${date}T13:00:00`, price: { value: 20, currencyCode: 'EUR' } },
    summary: { price: { value: 20, currencyCode: 'EUR' } },
  });
  const oneWay = { EIN: [fare('EIN', 'OPO', dates.departDate)], FAO: [fare('FAO', 'EIN', dates.returnDate)] };
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const fares = u.pathname.endsWith('oneWayFares') ? oneWay[u.searchParams.get('departureAirportIataCode')] || [] : [];
    return new Response(JSON.stringify({ fares }), { status: 200 });
  };
  const svc = createFlightService({ config: {}, cache: createCache(), logger: quiet });
  const offerId = `mix-EIN-OPO-FAO-EIN-${dates.departDate}-${dates.returnDate}`;
  const query = { ...dates, origin: 'NL', origins: ['EIN'], destination: 'OPO' };
  assert.equal((await svc.searchRoute(query)).offers.length, 0);
  assert.ok((await svc.searchRoute(query, { offerId })).offers.some((o) => o.id === offerId));
});

test('a failed airport is not remembered, so the next search can find its trips', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const fare = (from, to, date) => ({
    outbound: { departureAirport: { iataCode: from }, arrivalAirport: { iataCode: to, city: { name: to } }, departureDate: `${date}T10:00:00`, arrivalDate: `${date}T13:00:00`, price: { value: 20, currencyCode: 'EUR' } },
    summary: { price: { value: 20, currencyCode: 'EUR' } },
  });
  let faroIsDown = true;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const from = u.searchParams.get('departureAirportIataCode');
    if (from === 'FAO' && faroIsDown) return new Response('nope', { status: 500 });
    const oneWay = { EIN: [fare('EIN', 'OPO', dates.departDate), fare('EIN', 'FAO', dates.departDate)], OPO: [fare('OPO', 'EIN', dates.returnDate)], FAO: [fare('FAO', 'EIN', dates.returnDate)] };
    const fares = u.pathname.endsWith('oneWayFares') ? oneWay[from] || [] : [];
    return new Response(JSON.stringify({ fares }), { status: 200 });
  };
  const svc = createFlightService({ config: {}, cache: createCache(), logger: quiet });
  const query = { ...dates, origin: 'NL', origins: ['EIN'], destination: 'OPO' };
  assert.equal((await svc.searchRoute(query)).offers.length, 0);
  faroIsDown = false;
  assert.equal((await svc.searchRoute(query)).offers.length, 1);
});

test('losing Ryanair one-ways does not break the search', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  const svc = createFlightService({ config: {}, cache: createCache(), logger: quiet });
  const res = await svc.searchRoute({ ...dates, origin: 'NL', origins: ['EIN'], destination: 'OPO' });
  assert.ok(res.offers.every((o) => !o.mixed));
});
