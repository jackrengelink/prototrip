import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyBudget, bagPerFlight, tripCosts } from '../server/data/costs.js';
import { costBreakdown, groupNote, shareMessage, clampPeople, stayDiscount } from '../public/js/costs.js';
import { pickFareTiers, moveTripDates } from '../public/js/fares.js';

test('dailyBudget finds a city in the index, whatever its spelling', () => {
  assert.deepEqual(dailyBudget({ name: 'Lisbon', country: 'PT' }), { eur: 65, basis: 'city', place: 'Lisbon' });
  assert.equal(dailyBudget({ name: 'Kraków', country: 'PL' }).basis, 'city');
  assert.equal(dailyBudget({ name: 'Praha', country: 'CZ' }).basis, 'city');
});

test('dailyBudget falls back to other cities in the country', () => {
  assert.deepEqual(dailyBudget({ name: 'Porto', country: 'PT' }), { eur: 65, basis: 'country', place: 'Lisbon' });
  const spain = dailyBudget({ name: 'Malaga', country: 'ES' });
  assert.equal(spain.basis, 'country');
  assert.ok(spain.eur >= 55 && spain.eur <= 90);
});

test('dailyBudget says nothing about countries it has no data for', () => {
  assert.equal(dailyBudget({ name: 'Marrakesh', country: 'MA' }), null);
  assert.equal(dailyBudget(null), null);
});

test('bagPerFlight only knows the airlines that charge for a cabin bag', () => {
  assert.equal(bagPerFlight('Ryanair'), 20);
  assert.ok(bagPerFlight('Wizz Air') > 0);
  assert.equal(bagPerFlight('KLM'), null);
  assert.equal(bagPerFlight(undefined), null);
});

test('tripCosts counts flights and nights', () => {
  const stay = { startDate: '2027-01-29', endDate: '2027-02-02' };
  const place = { name: 'Lisbon', country: 'PT' };
  assert.deepEqual(tripCosts({ airline: 'Ryanair', returnDate: '2027-02-02', stay, place }), {
    bagPerFlight: 20, flights: 2, nights: 4, daily: { eur: 65, basis: 'city', place: 'Lisbon' },
  });
  assert.equal(tripCosts({ airline: 'Ryanair', returnDate: null, stay, place }).flights, 1);
});

const parts = { ticket: 57, travel: 30, bagPerFlight: 20, flights: 2, dayRate: 65, nights: 3 };

test('costBreakdown adds only what is switched on', () => {
  assert.equal(costBreakdown({ ...parts, people: 1 }).perPerson, 87);
  assert.equal(costBreakdown({ ...parts, withBag: true, people: 1 }).perPerson, 127);
  assert.equal(costBreakdown({ ...parts, withStay: true, people: 1 }).perPerson, 282);
});

test('costBreakdown multiplies by the group', () => {
  const c = costBreakdown({ ...parts, withBag: true, people: 20 });
  assert.equal(c.bag, 40);
  assert.equal(c.total, 2540);
});

test('costBreakdown survives a trip without those costs', () => {
  const c = costBreakdown({ ticket: 40, travel: 0, bagPerFlight: null, flights: 2, dayRate: null, nights: 3, withBag: true, withStay: true, people: 2 });
  assert.equal(c.perPerson, 40);
  assert.equal(c.total, 80);
});

test('clampPeople keeps the group between 1 and 60', () => {
  assert.equal(clampPeople('20'), 20);
  assert.equal(clampPeople(0), 1);
  assert.equal(clampPeople(500), 60);
  assert.equal(clampPeople('lots'), 1);
});

test('groupNote warns about seats, and about Ryanair group booking from 15', () => {
  assert.equal(groupNote({ people: 3, airline: 'Ryanair' }), null);
  assert.match(groupNote({ people: 8, airline: 'KLM' }), /8 seats/);
  assert.match(groupNote({ people: 15, airline: 'Ryanair' }), /group booking/);
  assert.doesNotMatch(groupNote({ people: 15, airline: 'KLM' }), /Ryanair/);
});

test('the stay gets cheaper per person as the group grows', () => {
  const stay = (people) => costBreakdown({ ...parts, withStay: true, people }).stay;
  assert.equal(stay(1), 195);
  assert.ok(stay(2) < stay(1));
  assert.ok(stay(4) < stay(2));
  assert.ok(stay(8) < stay(4));
  assert.ok(stay(15) < stay(8));
  assert.equal(stay(30), stay(15), 'a group can only share so much');
});

test('a group only gets cheaper on the stay, not on flights or trains', () => {
  const c = costBreakdown({ ...parts, people: 30 });
  assert.equal(c.perPerson, 87);
  assert.equal(c.total, 2610);
  assert.equal(stayDiscount(1), 0);
  assert.equal(stayDiscount(30), 0.2);
});

test('shareMessage reads well in WhatsApp: bold title, price, dates, then the link alone', () => {
  const lines = shareMessage({ name: 'Porto', deal: 'Crazy deal', from: 'Weeze', price: '€57', travel: '€30', when: 'Mon 1 Feb to Thu 4 Feb', url: 'https://x.test/t/a' }).split('\n');
  assert.equal(lines[0], '✈️ *Porto* · Crazy deal');
  assert.equal(lines[1], '*€57* per person + ~€30 train/bus');
  assert.equal(lines[2], 'Mon 1 Feb to Thu 4 Feb');
  assert.equal(lines[3], 'From Weeze');
  assert.equal(lines[4], '');
  assert.equal(lines[5], 'https://x.test/t/a');
});

test('shareMessage adds the group total, and a bus for bus trips', () => {
  const msg = shareMessage({ icon: '🚌', name: 'Berlin', from: 'Enschede', price: '€47', when: 'Mon 1 Feb', url: 'https://x.test', people: 20, total: '€940' });
  assert.match(msg, /^🚌 \*Berlin\*\n/);
  assert.match(msg, /\*20 people: €940 in total\*/);
  assert.doesNotMatch(msg, /train\/bus/);
});

test('pickFareTiers marks the cheapest days of the month', () => {
  const tiers = pickFareTiers([{ date: 'a', price: 20 }, { date: 'b', price: 22 }, { date: 'c', price: 60 }, { date: 'd', price: 100 }, { date: 'e', price: null }]);
  assert.equal(tiers.a, 'low');
  assert.equal(tiers.b, 'low');
  assert.equal(tiers.c, 'mid');
  assert.equal(tiers.d, 'high');
  assert.equal(tiers.e, undefined);
});

test('moveTripDates keeps the trip length when the way out moves', () => {
  assert.deepEqual(moveTripDates({ depart: '2027-01-29', ret: '2027-02-02' }, 'out', '2027-02-05'), { depart: '2027-02-05', ret: '2027-02-09' });
});

test('moveTripDates moves only the way home, but never before the way out', () => {
  assert.deepEqual(moveTripDates({ depart: '2027-01-29', ret: '2027-02-02' }, 'home', '2027-02-04'), { depart: '2027-01-29', ret: '2027-02-04' });
  assert.deepEqual(moveTripDates({ depart: '2027-01-29', ret: '2027-02-02' }, 'home', '2027-01-20'), { depart: '2027-01-16', ret: '2027-01-20' });
});

test('moveTripDates leaves a one-way as a one-way', () => {
  assert.deepEqual(moveTripDates({ depart: '2027-01-29', ret: '' }, 'out', '2027-02-05'), { depart: '2027-02-05', ret: '' });
});
