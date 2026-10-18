import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankPlaces, dateRange, slotsForDay, clusterIntoDays, orderRoute, travelBetween, buildItinerary, toMinutes, fromMinutes,
} from '../server/lib/itinerary.js';

// Two neighbourhoods ~5 km apart, plus restaurants.
const west = [0, 1, 2].map((i) => ({ id: `w${i}`, name: `West ${i}`, lat: 41.9, lon: 12.45 + i * 0.002, kind: 'sight', popularity: 0.5 }));
const east = [0, 1, 2].map((i) => ({ id: `e${i}`, name: `East ${i}`, lat: 41.9, lon: 12.51 + i * 0.002, kind: 'museum', popularity: 0.6 }));
const food = [
  { id: 'f1', name: 'Trattoria West', lat: 41.9, lon: 12.452, kind: 'food', popularity: 0.3 },
  { id: 'f2', name: 'Osteria East', lat: 41.9, lon: 12.512, kind: 'food', popularity: 0.3 },
  { id: 'n1', name: 'Bar East', lat: 41.9, lon: 12.513, kind: 'nightlife', popularity: 0.3 },
];

test('time helpers round-trip', () => {
  assert.equal(toMinutes('09:30'), 570);
  assert.equal(fromMinutes(570), '09:30');
});

test('rankPlaces boosts places matching interests and does not mutate', () => {
  const ranked = rankPlaces([...west, ...east], ['history']);
  assert.equal(ranked[0].kind, 'sight');
  assert.equal(west[0].score, undefined);
});

test('rankPlaces uses ratings and defaults missing popularity', () => {
  const ranked = rankPlaces([{ id: 'a', kind: 'food', rating: 5 }, { id: 'b', kind: 'food', rating: 2 }]);
  assert.equal(ranked[0].id, 'a');
});

test('dateRange is inclusive', () => {
  assert.deepEqual(dateRange('2026-11-30', '2026-12-02'), ['2026-11-30', '2026-12-01', '2026-12-02']);
});

test('slotsForDay trims arrival and departure days', () => {
  assert.equal(slotsForDay({}).length, 5);
  const arrival = slotsForDay({ isFirst: true, arrivalTime: '13:00' });
  assert.ok(arrival.every((s) => toMinutes(s.time) >= toMinutes('15:00')));
  const departure = slotsForDay({ isLast: true, departureTime: '14:00' });
  assert.deepEqual(departure.map((s) => s.slot), ['Morning']);
});

test('clusterIntoDays keeps each neighbourhood on its own day', () => {
  const groups = clusterIntoDays([...west, ...east], [3, 3]);
  for (const g of groups) {
    assert.equal(g.length, 3);
    assert.equal(new Set(g.map((p) => p.id[0])).size, 1, 'a day mixes both areas');
  }
});

test('clusterIntoDays respects zero-capacity days and empty input', () => {
  const groups = clusterIntoDays([...west], [0, 2]);
  assert.equal(groups[0].length, 0);
  assert.equal(groups[1].length, 2);
  assert.deepEqual(clusterIntoDays([], [2, 2]), [[], []]);
});

test('orderRoute visits every point once', () => {
  const route = orderRoute([...west, ...east]);
  assert.equal(route.length, 6);
  assert.equal(new Set(route.map((p) => p.id)).size, 6);
  assert.equal(orderRoute([west[0]]).length, 1);
});

test('travelBetween picks walking for short hops and transit for long ones', () => {
  assert.equal(travelBetween(west[0], west[1]).mode, 'walk');
  assert.equal(travelBetween(west[0], east[0]).mode, 'transit');
  assert.equal(travelBetween(null, west[0]), null);
});

test('buildItinerary lays out days with flights, sights and meals', () => {
  const { days, extras } = buildItinerary({
    places: [...west, ...east, ...food],
    startDate: '2026-11-13',
    endDate: '2026-11-15',
    arrivalTime: '08:00',
    departureTime: '18:00',
    interests: ['art', 'nightlife'],
    destinationName: 'Rome',
  });
  assert.equal(days.length, 3);
  assert.equal(days[0].items[0].kind, 'flight');
  assert.equal(days[2].items.at(-1).title, 'Head to the airport');
  const sightIds = days.flatMap((d) => d.items).filter((i) => i.place && ['sight', 'museum'].includes(i.kind)).map((i) => i.place.id);
  assert.equal(new Set(sightIds).size, sightIds.length, 'a sight was scheduled twice');
  assert.ok(days.flatMap((d) => d.items).some((i) => i.kind === 'nightlife'), 'nightlife interest should add a bar');
  assert.ok(Array.isArray(extras));
});

test('the top sight lands on the first full day, not a short travel day', () => {
  const star = { id: 'star', name: 'Sagrada Familia', lat: 41.92, lon: 12.6, kind: 'sight', popularity: 1 };
  const { days } = buildItinerary({
    places: [star, ...west, ...east],
    startDate: '2026-11-13',
    endDate: '2026-11-16',
    arrivalTime: '13:00',
    departureTime: '15:00',
  });
  const dayOf = days.findIndex((d) => d.items.some((i) => i.place?.id === 'star'));
  assert.equal(dayOf, 1, 'expected the headline sight on day 2 (first full day)');
  assert.equal(days[1].title, 'Around Sagrada Familia');
});

test('buildItinerary still works with no places at all', () => {
  const { days } = buildItinerary({ places: [], startDate: '2026-11-13', endDate: '2026-11-14' });
  assert.equal(days.length, 2);
  assert.ok(days[0].items.some((i) => i.title.startsWith('Lunch near')));
});
