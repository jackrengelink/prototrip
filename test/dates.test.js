import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, nightsBetween, monthWeeks, shiftMonth, pickDate, withNights, formatDay, MAX_TRIP_NIGHTS } from '../public/js/dates.js';

test('addDays and nightsBetween cross months and years', () => {
  assert.equal(addDays('2026-12-30', 5), '2027-01-04');
  assert.equal(nightsBetween('2026-12-30', '2027-01-04'), 5);
});

test('monthWeeks starts on Monday and fills whole weeks', () => {
  const weeks = monthWeeks('2027-01');
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks[0][0], '2026-12-28', '1 Jan 2027 is a Friday');
  assert.equal(weeks.at(-1).at(-1), '2027-01-31');
});

test('shiftMonth moves across years', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
});

test('picking the departure moves on to the return', () => {
  const next = pickDate({ depart: '2027-01-29', ret: '2027-02-02', target: 'depart' }, '2027-01-30');
  assert.deepEqual(next, { depart: '2027-01-30', ret: '2027-02-02', target: 'return', done: false });
});

test('a departure after the return clears the return', () => {
  const next = pickDate({ depart: '2027-01-29', ret: '2027-02-02', target: 'depart' }, '2027-02-10');
  assert.equal(next.ret, '');
  assert.equal(next.target, 'return');
});

test('a departure too long before the return clears the return', () => {
  const next = pickDate({ depart: '2027-03-01', ret: '2027-03-05', target: 'depart' }, addDays('2027-03-05', -(MAX_TRIP_NIGHTS + 1)));
  assert.equal(next.ret, '');
});

test('picking the return finishes the choice', () => {
  const next = pickDate({ depart: '2027-01-29', ret: '', target: 'return' }, '2027-02-02');
  assert.deepEqual(next, { depart: '2027-01-29', ret: '2027-02-02', target: 'return', done: true });
});

test('a return before the departure starts again from that day', () => {
  const next = pickDate({ depart: '2027-01-29', ret: '', target: 'return' }, '2027-01-20');
  assert.deepEqual(next, { depart: '2027-01-20', ret: '', target: 'return', done: false });
});

test('a return past the trip limit starts again from that day', () => {
  const far = addDays('2027-01-01', MAX_TRIP_NIGHTS + 1);
  const next = pickDate({ depart: '2027-01-01', ret: '', target: 'return' }, far);
  assert.deepEqual(next, { depart: far, ret: '', target: 'return', done: false });
});

test('withNights sets the return from the departure', () => {
  assert.deepEqual(withNights({ depart: '2027-01-29', ret: '', target: 'return' }, 3), { depart: '2027-01-29', ret: '2027-02-01', target: 'return', done: true });
});

test('formatDay reads like "Fri 29 Jan"', () => {
  assert.equal(formatDay('2027-01-29'), 'Fri 29 Jan');
});
