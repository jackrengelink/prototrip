// Ryanair fare finder: live cheapest fare per destination, no API key.
// This is the public endpoint behind ryanair.com's own "fare finder". It's unofficial: no quota,
// but Ryanair could change or block it, so results are cached and failures fall back to other sources.
// Ryanair flies from Eindhoven, Weeze, Cologne, Charleroi, Münster/Osnabrück and Schiphol (few routes).

import { fetchJson } from '../../lib/http.js';
import { findAirport } from '../../data/airports.js';

const BASE = 'https://www.ryanair.com/api/farfnd/v4';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (ProtoTrip student trip finder)', Accept: 'application/json' };
const DAY_MS = 86_400_000;
// Flexible dates may shift the trip, but keep its length within a night of what was asked.
const NIGHTS_SLACK = 1;

const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const shift = (iso, days) => isoDay(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS);
const datePart = (s) => (s ? String(s).slice(0, 10) : null);
const timePart = (s) => (s && String(s).length >= 16 ? String(s).slice(11, 16) : null);
// Ryanair sometimes sends shouty names ("IASI"); keep normal ones ("Palma de Mallorca") as they are.
const tidyName = (s) => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : s);

/** Date windows for the fare finder: exact dates ± flex days, never in the past. */
export function fareWindows({ departDate, returnDate, flex = 0, today = isoDay(Date.now()) }) {
  const clampPast = (iso) => (iso < today ? today : iso);
  const out = { from: clampPast(shift(departDate, -flex)), to: shift(departDate, flex) };
  if (!returnDate) return { out };
  const nights = Math.round((Date.parse(returnDate) - Date.parse(departDate)) / DAY_MS);
  return {
    out,
    back: { from: clampPast(shift(returnDate, -flex)), to: shift(returnDate, flex) },
    nights: { from: Math.max(1, nights - Math.min(flex, NIGHTS_SLACK)), to: nights + Math.min(flex, NIGHTS_SLACK) },
  };
}

/** Ryanair's own booking page for these exact flights. */
export function ryanairBookingUrl({ origin, destination, outDate, inDate }) {
  const qs = new URLSearchParams({
    adults: '1', teens: '0', children: '0', infants: '0',
    dateOut: outDate, ...(inDate && { dateIn: inDate }),
    isReturn: String(Boolean(inDate)), originIata: origin, destinationIata: destination,
  });
  return `https://www.ryanair.com/gb/en/trip/flights/select?${qs}`;
}

/** Turn one fare-finder result into the app's offer shape. */
export function normalizeRyanair(fare) {
  const out = fare?.outbound;
  if (!out?.arrivalAirport?.iataCode || !out.departureAirport?.iataCode) return null;
  const back = fare.inbound || null;
  const price = Number(fare.summary?.price?.value ?? out.price?.value);
  if (!Number.isFinite(price)) return null;
  const dest = out.arrivalAirport;
  const known = findAirport(dest.iataCode);
  // When Ryanair drops a price it reports the old one: a real "% off" signal.
  const hadDrop = Boolean(out.previousPrice?.value || back?.previousPrice?.value || fare.summary?.previousPrice?.value);
  const prevTotal = fare.summary?.previousPrice?.value
    ?? (out.previousPrice?.value ?? out.price?.value ?? 0) + (back ? back.previousPrice?.value ?? back.price?.value ?? 0 : 0);
  const previousPrice = hadDrop && Number(prevTotal) > price ? Math.round(Number(prevTotal) * 100) / 100 : null;
  const outDate = datePart(out.departureDate);
  const inDate = back ? datePart(back.departureDate) : null;
  const id = `fr-${out.flightNumber || ''}-${outDate}-${back?.flightNumber || 'ow'}-${inDate || ''}`.replace(/[^\w.:+-]/g, '');
  return {
    id,
    source: 'ryanair',
    sourceLabel: 'Ryanair (live)',
    live: true,
    origin: out.departureAirport.iataCode,
    destination: dest.iataCode,
    destinationCity: known?.city || dest.iataCode,
    destinationName: tidyName(dest.city?.name || known?.name || dest.name),
    departDate: outDate,
    departTime: timePart(out.departureDate),
    arriveDate: datePart(out.arrivalDate),
    arriveTime: timePart(out.arrivalDate),
    returnDate: inDate,
    returnTime: back ? timePart(back.departureDate) : null,
    price: Math.round(price * 100) / 100,
    previousPrice,
    currency: fare.summary?.price?.currencyCode || out.price?.currencyCode || 'EUR',
    airline: 'Ryanair',
    flightNumber: [out.flightNumber, back?.flightNumber].filter(Boolean).join(' / '),
    transfers: 0,
    durationMin: null,
    bookingUrl: ryanairBookingUrl({ origin: out.departureAirport.iataCode, destination: dest.iataCode, outDate, inDate }),
  };
}

/** One month of a route's cheapest one-way fare per day. Days with no fare keep a null price. */
export function normalizeCalendar(body) {
  const fares = Array.isArray(body?.outbound?.fares) ? body.outbound.fares : [];
  return fares.map((f) => {
    const price = !f.soldOut && !f.unavailable && Number.isFinite(f.price?.value) ? f.price.value : null;
    return { date: f.day, price, departTime: price === null ? null : timePart(f.departureDate) };
  });
}

const FARES_TTL_MS = 20 * 60 * 1000;
const CALENDAR_TTL_MS = 60 * 60 * 1000;

export function createRyanair({ fetcher = fetchJson, cache = null } = {}) {
  async function fares(query) {
    const { origin, departDate, returnDate, flex = 0 } = query;
    const key = `ryanair:${origin}:${departDate}:${returnDate}:${flex}`;
    return cache ? cache.wrap(key, FARES_TTL_MS, () => fetchFares({ origin, departDate, returnDate, flex })) : fetchFares({ origin, departDate, returnDate, flex });
  }

  async function fetchFares({ origin, departDate, returnDate, flex }) {
    const w = fareWindows({ departDate, returnDate, flex });
    const qs = new URLSearchParams({
      departureAirportIataCode: origin,
      outboundDepartureDateFrom: w.out.from,
      outboundDepartureDateTo: w.out.to,
      market: 'en-gb',
      language: 'en',
      currency: 'EUR',
      adultPaxCount: '1',
      ...(returnDate && {
        inboundDepartureDateFrom: w.back.from,
        inboundDepartureDateTo: w.back.to,
        durationFrom: String(w.nights.from),
        durationTo: String(w.nights.to),
      }),
    });
    const endpoint = returnDate ? 'roundTripFares' : 'oneWayFares';
    const body = await fetcher('ryanair', `${BASE}/${endpoint}?${qs}`, { headers: HEADERS, timeoutMs: 10_000 });
    return (Array.isArray(body?.fares) ? body.fares : []).map(normalizeRyanair).filter(Boolean);
  }

  async function fetchCalendar({ origin, destination, month }) {
    const qs = new URLSearchParams({ outboundMonthOfDate: `${month}-01`, currency: 'EUR', market: 'en-gb' });
    const body = await fetcher('ryanair', `${BASE}/oneWayFares/${origin}/${destination}/cheapestPerDay?${qs}`, { headers: HEADERS, timeoutMs: 10_000 });
    return normalizeCalendar(body);
  }

  return {
    id: 'ryanair',
    /** The cheapest fare per day for one route and month. */
    async cheapestDays(query) {
      const { origin, destination, month } = query;
      return cache ? cache.wrap(`ryanair:days:${origin}:${destination}:${month}`, CALENDAR_TTL_MS, () => fetchCalendar(query)) : fetchCalendar(query);
    },
    /** Cheapest one-way ticket to everywhere from an airport, around one date. */
    async oneWays({ origin, departDate, flex }) {
      return fares({ origin, departDate, returnDate: null, flex });
    },
    async searchAnywhere(query) {
      return fares(query);
    },
    /** Same call as "Anywhere" (cached), filtered to airports in the destination city. */
    async searchRoute(query) {
      const target = findAirport(query.destination);
      const city = target?.city || query.destination;
      const all = await fares(query);
      return all.filter((o) => o.destination === query.destination || o.destinationCity === city);
    },
  };
}
