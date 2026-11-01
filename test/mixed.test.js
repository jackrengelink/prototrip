import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairOneWays, cheapestPerAirport, cheaperThanReturns } from '../server/providers/flights/mixed.js';
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
const OUT = '2027-01-29';
const BACK = '2027-02-02';

test('pairOneWays comes home to another airport and adds up both tickets', () => {
  const [trip, ...others] = pairOneWays([leg('EIN', 'OPO', OUT, 20)], [leg('OPO', 'NRN', BACK, 30)], dates);
  assert.equal(others.length, 0);
  assert.equal(trip.mixed, true);
  assert.equal(trip.price, 50);
  assert.equal(trip.outPrice, 20);
  assert.equal(trip.backPrice, 30);
  assert.equal(trip.returnFrom, 'OPO');
  assert.equal(trip.returnTo, 'NRN');
  assert.equal(trip.bookingUrl, 'https://book/EIN-OPO');
  assert.equal(trip.returnBookingUrl, 'https://book/OPO-NRN');
});

test('pairOneWays never flies home from another airport at the destination', () => {
  assert.deepEqual(pairOneWays([leg('EIN', 'OPO', OUT, 20)], [leg('FAO', 'NRN', BACK, 30)], dates), []);
});

test('pairOneWays skips the plain return', () => {
  assert.deepEqual(pairOneWays([leg('EIN', 'OPO', OUT, 20)], [leg('OPO', 'EIN', BACK, 30)], dates), []);
});

test('pairOneWays keeps the trip length within a night of what was asked', () => {
  const outs = [leg('EIN', 'OPO', OUT, 20)];
  const backs = [leg('OPO', 'NRN', '2027-02-03', 30), leg('OPO', 'AMS', '2027-02-04', 30), leg('OPO', 'CGN', OUT, 30)];
  assert.deepEqual(pairOneWays(outs, backs, { ...dates, flex: 3 }).map((t) => t.returnTo), ['NRN']);
  assert.deepEqual(pairOneWays(outs, backs, dates), []);
});

test('pairOneWays gives every combination an id that passes the offerId check', () => {
  const trips = pairOneWays([leg('EIN', 'OPO', OUT, 20)], [leg('OPO', 'NRN', BACK, 30), leg('OPO', 'AMS', BACK, 30)], dates);
  assert.equal(new Set(trips.map((t) => t.id)).size, 2);
  assert.ok(trips.every((t) => /^[\w.:+-]{1,200}$/.test(t.id)));
});

test('cheaperThanReturns only keeps trips that beat a normal return', () => {
  const trips = [{ destination: 'OPO', price: 50 }, { destination: 'FAO', price: 90 }, { destination: 'LIS', price: 200 }];
  const returns = [{ destination: 'OPO', price: 60 }, { destination: 'OPO', price: 80 }, { destination: 'FAO', price: 90 }, { destination: 'OPO', price: 1, mixed: true }];
  assert.deepEqual(cheaperThanReturns(trips, returns).map((t) => t.destination), ['OPO', 'LIS']);
});

test('cheapestPerAirport keeps one trip per airport', () => {
  const kept = cheapestPerAirport(pairOneWays([leg('EIN', 'OPO', OUT, 20), leg('AMS', 'OPO', OUT, 40)], [leg('OPO', 'NRN', BACK, 30), leg('OPO', 'CGN', BACK, 10)], dates));
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
  const c = coordsFor({ origin: 'EIN', destination: 'OPO', returnFrom: 'OPO', returnTo: 'AMS' });
  assert.deepEqual(c.returnFrom, c.destination);
  assert.ok(c.returnTo[0] > 52, 'Amsterdam');
  assert.equal(coordsFor({ origin: 'EIN', destination: 'OPO' }).returnFrom, undefined);
});

const fare = (from, to, date, value = 20) => ({
  outbound: { departureAirport: { iataCode: from }, arrivalAirport: { iataCode: to, city: { name: to } }, departureDate: `${date}T10:00:00`, arrivalDate: `${date}T13:00:00`, price: { value, currencyCode: 'EUR' }, flightNumber: `FR${value}` },
  summary: { price: { value, currencyCode: 'EUR' } },
});

/** Fake Ryanair. roundTrips answers the normal return search, oneWays the one-way search. */
function fakeRyanair(t, { oneWays, roundTrips = {} }) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const from = u.searchParams.get('departureAirportIataCode');
    calls.push(from);
    const table = u.pathname.endsWith('oneWayFares') ? oneWays : roundTrips;
    return new Response(JSON.stringify({ fares: table[from] || [] }), { status: 200 });
  };
  return calls;
}

const service = () => createFlightService({ config: {}, cache: createCache(), logger: quiet });
const origins = ['EIN', 'NRN'];
const portugal = {
  EIN: [fare('EIN', 'OPO', OUT, 20), fare('EIN', 'BCN', OUT, 5)],
  NRN: [],
  OPO: [fare('OPO', 'NRN', BACK, 15), fare('OPO', 'DUB', BACK, 1)],
};

test('a country search adds trips coming home to another airport', async (t) => {
  const calls = fakeRyanair(t, { oneWays: portugal });
  const { offers } = await service().searchAnywhere({ ...dates, origin: 'NL', origins, country: 'PT', destination: null });
  assert.deepEqual(offers.map((o) => `${o.origin}-${o.destination}-${o.returnTo}-${o.price}`), ['EIN-OPO-NRN-35']);
  assert.ok(offers[0].deal && offers[0].coords.returnTo, 'scored and placed on the map');
  assert.equal(offers[0].totalPrice, offers[0].price + offers[0].travelEur);
  assert.ok(offers[0].travelEur > 0, 'half the train to each home airport');
  assert.ok(!calls.includes('BCN'), 'only airports in the country are searched');
});

test('two tickets disappear when a normal return is cheaper, but a chosen one is still found', async (t) => {
  fakeRyanair(t, { oneWays: portugal, roundTrips: { NRN: [{ ...fare('NRN', 'OPO', OUT, 30), inbound: fare('OPO', 'NRN', BACK, 0).outbound }] } });
  const query = { ...dates, origin: 'NL', origins, destination: 'OPO' };
  const svc = service();
  assert.ok((await svc.searchRoute(query)).offers.every((o) => !o.mixed));
  const offerId = `mix-EIN-OPO-OPO-NRN-${OUT}-${BACK}`;
  assert.ok((await svc.searchRoute(query, { offerId })).offers.some((o) => o.id === offerId));
});

test('one-way searches never pair tickets', async (t) => {
  fakeRyanair(t, { oneWays: portugal });
  const { offers } = await service().searchRoute({ ...dates, returnDate: null, origin: 'NL', origins, destination: 'OPO' });
  assert.ok(offers.every((o) => !o.mixed));
});

test('a failed airport is not remembered, so the next search can find its trips', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let portoIsDown = true;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const from = u.searchParams.get('departureAirportIataCode');
    if (from === 'OPO' && portoIsDown) return new Response('nope', { status: 500 });
    const fares = u.pathname.endsWith('oneWayFares') ? portugal[from] || [] : [];
    return new Response(JSON.stringify({ fares }), { status: 200 });
  };
  const svc = service();
  const query = { ...dates, origin: 'NL', origins, destination: 'OPO' };
  assert.equal((await svc.searchRoute(query)).offers.length, 0);
  portoIsDown = false;
  assert.equal((await svc.searchRoute(query)).offers.length, 1);
});

test('losing Ryanair one-ways does not break the search', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  const res = await service().searchRoute({ ...dates, origin: 'NL', origins, destination: 'OPO' });
  assert.ok(res.offers.every((o) => !o.mixed));
});
