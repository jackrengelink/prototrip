// The logic behind the cheapest-day calendar. No DOM here.

import { addDays, nightsBetween, MAX_TRIP_NIGHTS } from './dates.js';

const LOW_SHARE = 0.15;
const HIGH_SHARE = 0.7;

/** Colour each priced day by where it sits between the month's cheapest and dearest fare. */
export function pickFareTiers(days) {
  const prices = days.map((d) => d.price).filter(Number.isFinite);
  if (prices.length === 0) return {};
  const low = Math.min(...prices);
  const spread = Math.max(...prices) - low;
  const tiers = {};
  for (const { date, price } of days) {
    if (!Number.isFinite(price)) continue;
    const share = spread > 0 ? (price - low) / spread : 0;
    tiers[date] = share <= LOW_SHARE ? 'low' : share >= HIGH_SHARE ? 'high' : 'mid';
  }
  return tiers;
}

/** New trip dates after picking a day: the trip keeps its length unless only the way home moved. */
export function moveTripDates({ depart, ret }, leg, day) {
  if (!ret) return { depart: day, ret: '' };
  const nights = nightsBetween(depart, ret);
  if (leg === 'out') return { depart: day, ret: addDays(day, nights) };
  const fits = day >= depart && nightsBetween(depart, day) <= MAX_TRIP_NIGHTS;
  return fits ? { depart, ret: day } : { depart: addDays(day, -nights), ret: day };
}
