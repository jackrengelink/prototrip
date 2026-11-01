// Trips that come home to another airport: two one-way tickets instead of one return.
// Leave from Eindhoven and come back to Weeze, always flying home from the airport you landed at.

const DAY_MS = 86_400_000;
// Flexible dates may shift the trip, but keep its length within a night of what was asked.
const NIGHTS_SLACK = 1;

const nightsBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const addMoney = (a, b) => Math.round((a + b) * 100) / 100;

/** Both tickets as one offer. It reads like a return, plus where the way home ends. */
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

/** Every outbound ticket with every ticket home from the same airport to a different home airport. */
export function pairOneWays(outs, backs, { departDate, returnDate, flex = 0 }) {
  const asked = nightsBetween(departDate, returnDate);
  const slack = Math.min(flex, NIGHTS_SLACK);
  const fits = (out, back) => {
    const nights = nightsBetween(out.departDate, back.departDate);
    return nights >= 1 && Math.abs(nights - asked) <= slack;
  };
  return outs.flatMap((out) => backs
    .filter((back) => back.origin === out.destination && back.destination !== out.origin && fits(out, back))
    .map((back) => pair(out, back)));
}

/** Two tickets are only worth the hassle when they beat the cheapest normal return to that airport. */
export function cheaperThanReturns(trips, returns) {
  const best = new Map();
  for (const r of returns) {
    if (r.mixed || !(r.price < (best.get(r.destination) ?? Infinity))) continue;
    best.set(r.destination, r.price);
  }
  return trips.filter((t) => t.price < (best.get(t.destination) ?? Infinity));
}

/** Keep lists readable: the cheapest two-ticket trip to each airport. */
export function cheapestPerAirport(trips) {
  const best = new Map();
  for (const t of trips) {
    const prev = best.get(t.destination);
    if (!prev || t.price < prev.price) best.set(t.destination, t);
  }
  return [...best.values()];
}
