import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortTripPath, tripUrlFromCode } from '../public/js/shortlink.js';

const paramsOf = (path) => Object.fromEntries(new URLSearchParams(tripUrlFromCode(path.replace('/t/', '')).slice(2)));
const BERLIN = '40d8f682-8646-11e6-9066-549f350fcb0c';

test('a normal return gives a short readable link that opens the same trip', () => {
  const path = shortTripPath({ from: 'EIN', to: 'OPO', depart: '2027-01-26', ret: '2027-01-31' });
  assert.equal(path, '/t/ein-opo-270126-270131');
  const p = paramsOf(path);
  assert.equal(p.origin, 'NL');
  assert.equal(p.tripFrom, 'EIN');
  assert.equal(p.trip, 'OPO');
  assert.equal(p.tripDepart, '2027-01-26');
  assert.equal(p.tripReturn, '2027-01-31');
  assert.equal(p.offerId, undefined);
});

test('a one-way stays a one-way', () => {
  const p = paramsOf(shortTripPath({ from: 'EIN', to: 'OPO', depart: '2027-01-26', ret: '' }));
  assert.equal(p.returnDate, '');
  assert.equal(p.tripReturn, undefined);
});

test('two tickets keep both home airports and find the same fare', () => {
  const path = shortTripPath({ from: 'EIN', to: 'OPO', returnTo: 'NRN', depart: '2027-01-26', ret: '2027-01-31' });
  assert.equal(path, '/t/ein-opo-nrn-270126-270131');
  const p = paramsOf(path);
  assert.equal(p.offerId, 'mix-EIN-OPO-OPO-NRN-2027-01-26-2027-01-31');
  assert.equal(p.airports, 'all');
  assert.equal(p.tripFrom, undefined);
});

test('the group size comes along', () => {
  const path = shortTripPath({ from: 'EIN', to: 'OPO', depart: '2027-01-26', ret: '2027-01-31', people: 20 });
  assert.equal(path, '/t/ein-opo-270126-270131-g20');
  assert.equal(paramsOf(path).group, '20');
  assert.equal(shortTripPath({ from: 'EIN', to: 'OPO', depart: '2027-01-26', ret: '', people: 1 }), '/t/ein-opo-270126');
});

test('a bus trip squeezes the long city id', () => {
  const path = shortTripPath({ mode: 'ground', cityId: BERLIN, depart: '2027-01-29', ret: '2027-02-02', people: 3 });
  assert.ok(path.length < 50, path);
  const p = paramsOf(path);
  assert.equal(p.mode, 'ground');
  assert.equal(p.trip, BERLIN);
  assert.equal(p.group, '3');
  assert.equal(p.tripReturn, '2027-02-02');
});

test('anything else is not a trip', () => {
  for (const code of ['', 'nonsense', 'ein-opo', 'ein-opo-2701', '../../etc', 'ein-opo-nrn-270126', 'https://evil.test', 'ein-opo-270126-g999']) {
    assert.equal(tripUrlFromCode(code), null, code);
  }
});
