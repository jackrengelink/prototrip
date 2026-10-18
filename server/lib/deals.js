// Deal scoring combines two questions:
//
//   1. Is it cheap for the distance?  Every trip has a "crazy line" that grows with distance:
//        crazy line (return, EUR) = 35 + 0.027 × km      one-way = 55% of that
//        ≈ €45 London · €69 Barcelona · €86 Málaga · €123 Tenerife · €194 New York
//   2. How much is it off the normal price?  "Normal" comes from real data when we have it
//      (Google's typical range, Ryanair's previous price, this month's fares on the route,
//      or all fares we found to that city from the nearby airports),
//      otherwise from what a trip of this length usually costs.
//
// A fare is a Crazy deal if it's under the crazy line, OR it's 45%+ off a *real* normal price
// without being expensive for the distance. The score blends both, so a fare that is cheap for
// the distance and a big discount ranks highest.

// Bus & train ("ground") trips: ProtoTrip aims for €50-70 per person, return. The crazy line grows with
// distance but tops out at €50, so Amsterdam must be ~€24 to be crazy and Berlin or Paris ~€50.
const GROUND_BASE_EUR = 12;
const GROUND_PER_KM_EUR = 0.08;
const GROUND_MAX_LINE_EUR = 50;

const CRAZY_BASE_EUR = 35;
const CRAZY_PER_KM_EUR = 0.027;
const ONE_WAY_FACTOR = 0.55;
const TYPICAL_TO_LINE = 2.5;
const MIN_SAMPLES_FOR_MEDIAN = 5;
const MIN_CITY_SAMPLES = 4;

// Discount rules only count against real price data, never against the distance model.
const CRAZY_DISCOUNT = 0.45;
const CRAZY_DISCOUNT_MAX_RATIO = 2; // 50% off a €400 Barcelona ticket is still not crazy
const GREAT_DISCOUNT = 0.3;
const GOOD_DISCOUNT = 0.15;
const PRICE_WEIGHT = 0.55;

export const DEAL_TIERS = Object.freeze([
  { id: 'crazy', label: 'Crazy deal', maxRatio: 1 },
  { id: 'great', label: 'Great price', maxRatio: 1.5 },
  { id: 'good', label: 'Good price', maxRatio: 2.2 },
  { id: 'typical', label: 'Normal price', maxRatio: 3.5 },
  { id: 'pricey', label: 'Pricey', maxRatio: Infinity },
]);
const TIER = Object.fromEntries(DEAL_TIERS.map((t) => [t.id, t]));
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/** The price (EUR) under which a trip of this length counts as crazy cheap. */
export function crazyLine(distanceKm, { roundTrip = true, mode = 'fly' } = {}) {
  const km = Math.max(0, distanceKm);
  const rt = mode === 'ground'
    ? Math.min(GROUND_MAX_LINE_EUR, GROUND_BASE_EUR + GROUND_PER_KM_EUR * km)
    : CRAZY_BASE_EUR + CRAZY_PER_KM_EUR * km;
  return Math.round(roundTrip ? rt : rt * ONE_WAY_FACTOR);
}

/** What a trip of this length usually costs: the fallback "normal" price. */
export function modelFare(distanceKm, { roundTrip = true, mode = 'fly' } = {}) {
  return Math.round(crazyLine(distanceKm, { roundTrip, mode }) * TYPICAL_TO_LINE);
}

export function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * The route's normal price, from the most trustworthy source available.
 * `real: true` means it came from actual fares, not the distance model.
 */
export function normalPrice({ typicalRange, previousPrice, peerPrices = [], cityPrices = [], distanceKm = 0, roundTrip = true, mode = 'fly' }) {
  if (Array.isArray(typicalRange) && typicalRange.length === 2 && typicalRange.every(Number.isFinite)) {
    return { value: Math.round((typicalRange[0] + typicalRange[1]) / 2), basis: 'typical-range', real: true };
  }
  if (Number.isFinite(previousPrice) && previousPrice > 0) return { value: Math.round(previousPrice), basis: 'previous-price', real: true };
  if (peerPrices.length >= MIN_SAMPLES_FOR_MEDIAN) return { value: Math.round(median(peerPrices)), basis: 'route-median', real: true };
  if (cityPrices.length >= MIN_CITY_SAMPLES) return { value: Math.round(median(cityPrices)), basis: 'city-median', real: true };
  return { value: modelFare(distanceKm, { roundTrip, mode }), basis: 'distance-typical', real: false };
}

/** Tier from price-for-distance, lifted by a real discount where one exists. */
export function tierFor(ratio, realSavings = null) {
  const s = realSavings ?? -Infinity;
  if (ratio <= TIER.crazy.maxRatio || (s >= CRAZY_DISCOUNT && ratio <= CRAZY_DISCOUNT_MAX_RATIO)) return TIER.crazy;
  if (ratio <= TIER.great.maxRatio || s >= GREAT_DISCOUNT) return TIER.great;
  if (ratio <= TIER.good.maxRatio || s >= GOOD_DISCOUNT) return TIER.good;
  return ratio <= TIER.typical.maxRatio ? TIER.typical : TIER.pricey;
}

/**
 * Score one fare.
 * @param {{price:number, distanceKm:number, roundTrip?:boolean, normal?:{value:number,basis:string,real:boolean}|null}} input
 */
export function scoreDeal({ price, distanceKm, roundTrip = true, normal = null, mode = 'fly' }) {
  const line = crazyLine(distanceKm, { roundTrip, mode });
  const ratio = line > 0 ? price / line : Infinity;
  const base = normal || normalPrice({ distanceKm, roundTrip, mode });
  const savings = base.value > 0 ? (base.value - price) / base.value : 0;
  const realSavings = base.real ? savings : null;
  const tier = tierFor(ratio, realSavings);

  // 60 = at the crazy line / 45% off. Blend: cheap-for-distance weighs a bit more than % off.
  const priceScore = clamp(100 - 40 * ratio);
  const discountScore = clamp(15 + savings * 100);
  const reasons = [
    ...(ratio <= 1 ? ['cheap-for-distance'] : []),
    ...(realSavings !== null && realSavings >= CRAZY_DISCOUNT ? ['big-discount'] : []),
  ];
  return {
    score: clamp(PRICE_WEIGHT * priceScore + (1 - PRICE_WEIGHT) * discountScore + (reasons.length === 2 ? 5 : 0)),
    tier: tier.id,
    label: tier.label,
    reasons,
    crazyLine: line,
    ratio: Math.round(ratio * 100) / 100,
    centsPerKm: distanceKm > 0 ? Math.round((price / distanceKm) * 1000) / 10 : null,
    normalPrice: base.value,
    normalBasis: base.basis,
    savingsPct: Math.round(savings * 100),
  };
}

/**
 * Attach a `deal` object to every offer. Offers on the same route are each other's peers
 * for the "normal price". Returns new objects; inputs are not modified.
 */
export function scoreOffers(offers, { distanceFor, roundTrip = true, mode = 'fly' }) {
  const byRoute = new Map();
  const byCity = new Map();
  const push = (map, key, price) => map.set(key, [...(map.get(key) || []), price]);
  for (const o of offers) {
    push(byRoute, `${o.origin}-${o.destination}`, o.price);
    push(byCity, o.destinationCity || o.destination, o.price);
  }
  return offers.map((o) => {
    const distanceKm = distanceFor(o);
    const normal = normalPrice({
      typicalRange: o.typicalRange,
      previousPrice: o.previousPrice,
      peerPrices: byRoute.get(`${o.origin}-${o.destination}`),
      cityPrices: byCity.get(o.destinationCity || o.destination),
      distanceKm,
      roundTrip,
      mode,
    });
    // Score the door-to-door price when there's a cost for getting to the airport;
    // the "normal" price gets the same travel cost added so the % off stays fair.
    const price = o.totalPrice ?? o.price;
    const extra = price - o.price;
    if (extra > 0) normal.value += extra;
    return { ...o, distanceKm: Math.round(distanceKm), deal: scoreDeal({ price, distanceKm, roundTrip, normal, mode }) };
  });
}
