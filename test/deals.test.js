import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crazyLine, modelFare, median, normalPrice, scoreDeal, scoreOffers, tierFor } from '../server/lib/deals.js';

const real = (value) => ({ value, basis: 'typical-range', real: true });

test('the crazy line grows with distance; one-way is cheaper', () => {
  assert.ok(crazyLine(3250) > crazyLine(1900));
  assert.ok(crazyLine(1900) > crazyLine(360));
  assert.ok(crazyLine(1900, { roundTrip: false }) < crazyLine(1900));
  assert.ok(modelFare(1000) > crazyLine(1000));
});

test('cheap for the distance: €43 Tenerife and €70 south Spain returns are crazy', () => {
  assert.equal(scoreDeal({ price: 43, distanceKm: 3250 }).tier, 'crazy');
  assert.equal(scoreDeal({ price: 70, distanceKm: 1900 }).tier, 'crazy');
  assert.deepEqual(scoreDeal({ price: 70, distanceKm: 1900 }).reasons, ['cheap-for-distance']);
  assert.equal(scoreDeal({ price: 270, distanceKm: 9000 }).tier, 'crazy', 'a €270 Bangkok return is crazy');
});

test('big real discount: 55% off a real normal price is crazy even above the line', () => {
  const deal = scoreDeal({ price: 110, distanceKm: 1250, normal: real(250) }); // line ≈ €69
  assert.equal(deal.tier, 'crazy');
  assert.deepEqual(deal.reasons, ['big-discount']);
  assert.equal(deal.savingsPct, 56);
});

test('a discount alone cannot make an expensive-for-the-distance fare crazy', () => {
  const deal = scoreDeal({ price: 400, distanceKm: 1250, normal: real(900) });
  assert.notEqual(deal.tier, 'crazy');
  assert.equal(deal.tier, 'great', '55% off still lifts it to great');
});

test('the distance model never counts as a real discount', () => {
  const deal = scoreDeal({ price: 110, distanceKm: 1250 }); // ~€172 model normal → 36% "off"
  assert.equal(deal.normalBasis, 'distance-typical');
  assert.ok(deal.savingsPct > 30);
  assert.equal(deal.tier, 'good', 'tier comes from price-for-distance only (1.6× the line)');
});

test('both reasons together score highest', () => {
  const both = scoreDeal({ price: 40, distanceKm: 1900, normal: real(160) });
  const priceOnly = scoreDeal({ price: 40, distanceKm: 1900, normal: real(45) });
  assert.deepEqual(both.reasons, ['cheap-for-distance', 'big-discount']);
  assert.ok(both.score > priceOnly.score);
});

test('tierFor combines ratio and real savings', () => {
  assert.equal(tierFor(0.5).id, 'crazy');
  assert.equal(tierFor(1.8, 0.5).id, 'crazy');
  assert.equal(tierFor(2.5, 0.5).id, 'great');
  assert.equal(tierFor(1.2).id, 'great');
  assert.equal(tierFor(3, 0.2).id, 'good');
  assert.equal(tierFor(3).id, 'typical');
  assert.equal(tierFor(9).id, 'pricey');
});

test('normalPrice prefers typical range, then previous price, then peers, then distance', () => {
  assert.deepEqual(normalPrice({ typicalRange: [100, 200] }), { value: 150, basis: 'typical-range', real: true });
  assert.equal(normalPrice({ previousPrice: 120 }).basis, 'previous-price');
  assert.equal(normalPrice({ peerPrices: [1, 2, 3, 4, 5] }).basis, 'route-median');
  assert.deepEqual(normalPrice({ cityPrices: [60, 90, 100, 120] }), { value: 95, basis: 'city-median', real: true });
  const model = normalPrice({ peerPrices: [1], distanceKm: 1000 });
  assert.equal(model.basis, 'distance-typical');
  assert.equal(model.real, false);
});

test('score is clamped to 0..100', () => {
  assert.equal(scoreDeal({ price: 5000, distanceKm: 100 }).score, 0);
  assert.equal(scoreDeal({ price: 10, distanceKm: 0 }).centsPerKm, null);
});

test('median handles odd, even, empty and junk values', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
  assert.equal(median([NaN, 5]), 5);
});

test('scoreOffers uses route peers and previous prices, without mutating input', () => {
  const offers = [100, 400, 410, 420, 430].map((price, i) => ({ id: String(i), origin: 'EIN', destination: 'AGP', price }));
  const scored = scoreOffers(offers, { distanceFor: () => 1900 });
  assert.equal(scored[0].deal.normalBasis, 'route-median');
  assert.equal(scored[0].deal.tier, 'crazy', '76% below the route median');
  assert.equal(offers[0].deal, undefined);
  const [dropped] = scoreOffers([{ origin: 'EIN', destination: 'TIA', price: 34, previousPrice: 90 }], { distanceFor: () => 1500 });
  assert.equal(dropped.deal.normalBasis, 'previous-price');
  assert.deepEqual(dropped.deal.reasons, ['cheap-for-distance', 'big-discount']);
  const city = scoreOffers(['EIN', 'NRN', 'CRL', 'CGN'].map((origin, i) => ({ origin, destination: 'BCN', destinationCity: 'BCN', price: [40, 95, 110, 120][i] })), { distanceFor: () => 1250 });
  assert.equal(city[0].deal.normalBasis, 'city-median');
  assert.ok(city[0].deal.savingsPct >= 55);
  assert.deepEqual(city[0].deal.reasons, ['cheap-for-distance', 'big-discount']);
});
