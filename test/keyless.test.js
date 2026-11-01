// Tests for the keyless sources: Ryanair fare finder, Wikivoyage listings, airport directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRyanair, normalizeRyanair, fareWindows, ryanairBookingUrl, normalizeCalendar } from '../server/providers/flights/ryanair.js';
import { parseListings, districtTitles, cleanWikiText, createWikivoyage } from '../server/providers/places/wikivoyage.js';
import { buildDirectory, createDirectory } from '../server/data/directory.js';
import { findAirport } from '../server/data/airports.js';
import { mergePlaces } from '../server/providers/places/index.js';
import { parseStay, parseFlex, parseTime, ValidationError } from '../server/lib/validate.js';
import { createCache } from '../server/lib/cache.js';

const quiet = { warn() {}, error() {}, info() {} };

// Shape copied from a real roundTripFares response (Eindhoven → Tirana, Nov 2026).
const tiranaFare = {
  outbound: {
    departureAirport: { iataCode: 'EIN', city: { name: 'Eindhoven' } },
    arrivalAirport: { iataCode: 'TIA', name: 'Tirana', city: { name: 'Tirana', code: 'TIRANA' } },
    departureDate: '2026-11-18T09:10:00',
    arrivalDate: '2026-11-18T11:50:00',
    price: { value: 16.99, currencyCode: 'EUR' },
    flightNumber: 'FR9940',
  },
  inbound: {
    departureAirport: { iataCode: 'TIA' },
    arrivalAirport: { iataCode: 'EIN' },
    departureDate: '2026-11-25T06:05:00',
    flightNumber: 'FR9941',
  },
  summary: { price: { value: 33.98, currencyCode: 'EUR' } },
};

test('fareWindows: ±flex days, never in the past, nights range', () => {
  const w = fareWindows({ departDate: '2026-11-15', returnDate: '2026-11-20', flex: 3, today: '2026-11-13' });
  assert.deepEqual(w.out, { from: '2026-11-13', to: '2026-11-18' });
  assert.deepEqual(w.back, { from: '2026-11-17', to: '2026-11-23' });
  assert.deepEqual(w.nights, { from: 4, to: 6 });
  assert.equal(fareWindows({ departDate: '2026-11-15', flex: 0, today: '2026-11-01' }).back, undefined);
});

test('normalizeCalendar keeps priced days and marks the rest as no fare', () => {
  const days = normalizeCalendar({ outbound: { fares: [
    { day: '2027-01-01', departureDate: '2027-01-01T19:05:00', price: { value: 66.99, currencyCode: 'EUR' }, soldOut: false, unavailable: false },
    { day: '2027-01-02', price: null, soldOut: true, unavailable: false },
    { day: '2027-01-03', price: null, soldOut: false, unavailable: true },
  ] } });
  assert.deepEqual(days, [
    { date: '2027-01-01', price: 66.99, departTime: '19:05' },
    { date: '2027-01-02', price: null, departTime: null },
    { date: '2027-01-03', price: null, departTime: null },
  ]);
  assert.deepEqual(normalizeCalendar(null), []);
});

test('the Ryanair calendar asks for one route and month, and caches it', async () => {
  const calls = [];
  const fetcher = async (_id, url) => { calls.push(url); return { outbound: { fares: [] } }; };
  const ryanair = createRyanair({ fetcher, cache: createCache() });
  await ryanair.cheapestDays({ origin: 'EIN', destination: 'OPO', month: '2027-01' });
  await ryanair.cheapestDays({ origin: 'EIN', destination: 'OPO', month: '2027-01' });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /oneWayFares\/EIN\/OPO\/cheapestPerDay\?/);
  assert.match(calls[0], /outboundMonthOfDate=2027-01-01/);
});

test('normalizeRyanair keeps real local times, price and a booking link', () => {
  const o = normalizeRyanair(tiranaFare);
  assert.equal(o.origin, 'EIN');
  assert.equal(o.destination, 'TIA');
  assert.equal(o.destinationName, 'Tirana');
  const shouty = normalizeRyanair({ ...tiranaFare, outbound: { ...tiranaFare.outbound, arrivalAirport: { iataCode: 'IAS', city: { name: 'IASI' } } } });
  assert.equal(shouty.destinationName, 'Iasi');
  assert.equal(o.price, 33.98);
  assert.equal(o.arriveTime, '11:50');
  assert.equal(o.returnDate, '2026-11-25');
  assert.equal(o.returnTime, '06:05');
  assert.equal(o.live, true);
  assert.match(o.id, /^[\w.:+-]+$/);
  assert.match(o.bookingUrl, /^https:\/\/www\.ryanair\.com\/.*originIata=EIN.*destinationIata=TIA/);
  assert.equal(normalizeRyanair({}), null);
  assert.equal(normalizeRyanair({ ...tiranaFare, summary: { price: { value: 'x' } }, outbound: { ...tiranaFare.outbound, price: {} } }), null);
  assert.doesNotMatch(ryanairBookingUrl({ origin: 'EIN', destination: 'TIA', outDate: '2026-11-18' }), /dateIn/);
});

test('ryanair provider: one cached call serves both Anywhere and route searches', async () => {
  let calls = 0;
  const fetcher = async (_src, url) => {
    calls++;
    assert.match(url, /roundTripFares\?departureAirportIataCode=EIN/);
    return { fares: [tiranaFare, { ...tiranaFare, outbound: { ...tiranaFare.outbound, arrivalAirport: { iataCode: 'STN', city: { name: 'London' } } } }] };
  };
  const fr = createRyanair({ fetcher, cache: createCache() });
  const q = { origin: 'EIN', departDate: '2026-11-15', returnDate: '2026-11-22', flex: 3 };
  assert.equal((await fr.searchAnywhere(q)).length, 2);
  const london = await fr.searchRoute({ ...q, destination: 'LON' });
  assert.deepEqual(london.map((o) => o.destination), ['STN']);
  assert.equal(calls, 1);
});

test('wikivoyage: clean markup and parse listings with coordinates', () => {
  assert.equal(cleanWikiText("'''[[Old Town|old town]]''' <br>bar {{tmpl}}"), 'old town bar');
  const text = `
* {{see | name=[[Colosseum]] | lat=41.8902 | long=12.4922 | content=Huge '''ancient''' arena. }}
* {{eat | name=Da Enzo | lat=41.888 | long=12.477 | price=€12-20 | hours=12:00-23:00 | content=Roman classics. }}
* {{drink | name=Freni e Frizioni | lat=41.891 | long=12.470 | content=Aperitivo spot. }}
* {{see | name=Musei Capitolini | lat=41.893 | long=12.482 | content=Art museum on the hill. }}
* {{do | name=Villa Borghese park walk | lat=41.914 | long=12.485 }}
* {{sleep | name=Hotel X | lat=41.9 | long=12.5 }}
* {{eat | name=No Coords Place | content=Nice. }}
{{Regionlist | region1name=[[Rome/Old Rome|Old Rome]] | region2name=[[Rome/Trastevere]] }}`;
  const places = parseListings(text, 'Rome');
  assert.deepEqual(places.map((p) => [p.name, p.kind]), [
    ['Colosseum', 'sight'], ['Da Enzo', 'food'], ['Freni e Frizioni', 'nightlife'], ['Musei Capitolini', 'museum'], ['Villa Borghese park walk', 'nature'],
  ]);
  assert.equal(places[1].price, '€12-20');
  assert.equal(places[0].description, 'Huge ancient arena.');
  assert.deepEqual(districtTitles(text), ['Rome/Old Rome', 'Rome/Trastevere']);
});

test('wikivoyage provider fetches districts and drops same-name places far away', async () => {
  const fetcher = async (_src, url) => {
    const titles = new URL(url).searchParams.get('titles');
    if (titles === 'Rome') {
      return { query: { pages: [{ title: 'Rome', revisions: [{ slots: { main: { content: '{{eat|name=Near|lat=41.9|long=12.5}} {{eat|name=Far Away|lat=48.8|long=2.3}} region1name=[[Rome/Old Rome]]' } } }] }] } };
    }
    return { query: { pages: [{ title: 'Rome/Old Rome', revisions: [{ slots: { main: { content: '{{see|name=Pantheon|lat=41.8986|long=12.4769}}' } } }] }, { missing: true }] } };
  };
  const wv = createWikivoyage({ fetcher });
  const places = await wv.nearby({ lat: 41.9, lon: 12.5 }, { cityName: 'Rome' });
  assert.deepEqual(places.map((p) => p.name).sort(), ['Near', 'Pantheon']);
  assert.deepEqual(await wv.nearby({ lat: 0, lon: 0 }), []);
});

test('mergePlaces fills gaps from later duplicates', () => {
  const merged = mergePlaces(
    [{ id: 'wiki', name: 'Pantheon', lat: 41.8986, lon: 12.4769, image: 'https://img', price: null }],
    [{ id: 'wv', name: 'Pantheon', lat: 41.8987, lon: 12.477, price: 'Free', hours: '9-19' }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'wiki');
  assert.equal(merged[0].price, 'Free');
  assert.equal(merged[0].hours, '9-19');
});

test('airport directory: joins cities, registers unknown airports, caches to disk', async (t) => {
  const airports = [
    { code: 'GRO', city_code: 'GRO', country_code: 'ES', iata_type: 'airport', name: 'Girona-Costa Brava Airport', coordinates: { lat: 41.898, lon: 2.766 }, flightable: true },
    { code: 'XXX', iata_type: 'railway', coordinates: { lat: 1, lon: 1 } },
  ];
  const cities = [{ code: 'GRO', name: 'Girona', country_code: 'ES', coordinates: { lat: 41.98, lon: 2.82 }, has_flightable_airport: true }];
  const entries = buildDirectory(airports, cities);
  assert.equal(entries.find((e) => e.iata === 'GRO').name, 'Girona');
  assert.ok(!entries.some((e) => e.iata === 'XXX'));

  const root = await mkdtemp(path.join(os.tmpdir(), 'prototrip-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let downloads = 0;
  const fetcher = async (_s, url) => { downloads++; return url.includes('airports') ? airports : cities; };
  assert.equal(findAirport('GRO'), null);
  assert.ok(await createDirectory({ root, fetcher, logger: quiet }).ready() > 0);
  assert.equal(findAirport('GRO').name, 'Girona');
  await createDirectory({ root, fetcher, logger: quiet }).ready();
  assert.equal(downloads, 2, 'second start reads the disk cache');
});

test('airport directory uses an older copy right away and updates it in the background', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'prototrip-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '.cache'));
  const entries = [{ iata: 'ZZY', name: 'Oldtown', country: 'ES', city: 'ZZY', lat: 1, lon: 1 }];
  await writeFile(path.join(root, '.cache', 'airports.json'), JSON.stringify({ savedAt: 0, entries }));
  let asked = 0;
  const fetcher = () => { asked += 1; return new Promise(() => {}); }; // A download that never finishes
  assert.equal(await createDirectory({ root, fetcher, logger: quiet }).ready(), 1);
  assert.equal(findAirport('ZZY').name, 'Oldtown');
  assert.ok(asked > 0);
});

test('airport directory survives a failed download', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'prototrip-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fetcher = async () => { throw new Error('offline'); };
  assert.equal(await createDirectory({ root, fetcher, logger: quiet }).ready(), 0);
});

test('validation for flex, times and stays', () => {
  assert.equal(parseFlex(''), 3);
  assert.equal(parseFlex('0'), 0);
  assert.throws(() => parseFlex('9'), ValidationError);
  assert.equal(parseTime('09:05', 't'), '09:05');
  assert.equal(parseTime('', 't'), null);
  assert.throws(() => parseTime('9am', 't'), ValidationError);
  const today = Date.UTC(2026, 9, 18);
  const stay = parseStay(new URLSearchParams('destination=tia&startDate=2026-11-18&endDate=2026-11-25&arrivalTime=11:50&interests=food'), { today });
  assert.deepEqual(stay, { destination: 'TIA', startDate: '2026-11-18', endDate: '2026-11-25', arrivalTime: '11:50', departureTime: null, interests: ['food'] });
  assert.throws(() => parseStay(new URLSearchParams('destination=TIA&startDate=2026-11-25&endDate=2026-11-18'), { today }), /after/);
});
