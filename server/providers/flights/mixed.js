// Trips that fly home from another airport: two one-way tickets instead of one return.
// Fly into Porto and home from Faro, or leave from Eindhoven and come back to Schiphol.

import { haversineKm } from '../../lib/geo.js';
import { findAirport } from '../../data/airports.js';

const DAY_MS = 86_400_000;
// Flexible dates may shift the trip, but keep its length within a night of what was asked.
const NIGHTS_SLACK = 1;
// You make this hop yourself by train or bus: Seville to Malaga works, Seville to Mallorca doesn't.
const MAX_HOP_KM = 600;

const nightsBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const addMoney = (a, b) => Math.round((a + b) * 100) / 100;

function closeEnough(from, to) {
  if (from === to) return true;
  const [a, b] = [findAirport(from), findAirport(to)];
  return Boolean(a && b) && haversineKm(a, b) <= MAX_HOP_KM;
}

/** Both tickets as one offer. It reads like a return, plus where the way home starts and ends. */
function pair(out, back) {
  const prevOut = out.previousPrice ?? out.price;
  const prevBack = back.previousPrice ?? back.price;
  const dropped = out.previousPrice || back.previousPrice;
  return {
    ...out,
    id: `mix-${out.origin}-${out.destination}-${back.origin}-${back.destination}-${out.departDate}-${back.departDate}`,
    sourceLabel: `${out.airline}, 2 one-way tickets`,
    mixed: true,
    returnFrom: back.origin,
    returnTo: back.destination,
    returnDate: back.departDate,
    returnTime: back.departTime,
    price: addMoney(out.price, back.price),
    previousPrice: dropped ? addMoney(prevOut, prevBack) : null,
    outPrice: out.price,
    backPrice: back.price,
    flightNumber: [out.flightNumber, back.flightNumber].filter(Boolean).join(' / '),
    returnBookingUrl: back.bookingUrl,
  };
}

/**
 * Every outbound ticket with every ticket home on suitable dates.
 * A pair on the same two airports both ways is skipped: that's a normal return.
 */
export function pairOneWays(outs, backs, { departDate, returnDate, flex = 0 }) {
  const asked = nightsBetween(departDate, returnDate);
  const slack = Math.min(flex, NIGHTS_SLACK);
  const fits = (out, back) => {
    const nights = nightsBetween(out.departDate, back.departDate);
    return nights >= 1 && Math.abs(nights - asked) <= slack && closeEnough(out.destination, back.origin);
  };
  return outs.flatMap((out) => backs
    .filter((back) => fits(out, back) && !(back.origin === out.destination && back.destination === out.origin))
    .map((back) => pair(out, back)));
}

/** The airport a chosen two-ticket trip flies home from, read from its id. */
export function returnAirportOf(offerId) {
  return /^mix-[A-Z]{3}-[A-Z]{3}-([A-Z]{3})-/.exec(offerId || '')?.[1] || null;
}

/** Keep lists readable: the cheapest trip for each way in and way out of the country. */
export function cheapestPerAirportPair(trips) {
  const best = new Map();
  for (const t of trips) {
    const key = `${t.destination}-${t.returnFrom}`;
    const prev = best.get(key);
    if (!prev || t.price < prev.price) best.set(key, t);
  }
  return [...best.values()];
}
