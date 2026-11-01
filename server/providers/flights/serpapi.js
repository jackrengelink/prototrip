// SerpApi Google Flights engine: live Google Flights results, plus Google's "typical price" range.
// Docs: https://serpapi.com/google-flights-api

import { fetchJson } from '../../lib/http.js';
import { findAirport } from '../../data/airports.js';
import { comparisonLinks } from '../../lib/links.js';

const BASE = 'https://serpapi.com/search.json';

const timeOf = (s) => (s ? String(s).slice(-5) : null);
const dateOf = (s) => (s ? String(s).slice(0, 10) : null);

/** Turn one SerpApi itinerary into the app's offer shape. */
export function normalizeSerpItinerary(it, { departDate, returnDate, typicalRange, searchUrl }, index) {
  const segs = Array.isArray(it.flights) ? it.flights : [];
  if (segs.length === 0 || !Number.isFinite(it.price)) return null;
  const first = segs[0];
  const last = segs[segs.length - 1];
  const destCode = last.arrival_airport?.id;
  const dest = findAirport(destCode);
  const airlines = [...new Set(segs.map((s) => s.airline).filter(Boolean))];
  return {
    // Built from the flights themselves, so the id survives re-searches that reorder results.
    id: `serp-${segs.map((x) => String(x.flight_number || x.airline || index).replace(/\s+/g, '')).join('_')}-${dateOf(first.departure_airport?.time) || departDate}`,
    source: 'serpapi',
    sourceLabel: 'Google Flights (live)',
    live: true,
    origin: first.departure_airport?.id,
    destination: destCode,
    destinationCity: dest?.city || destCode,
    destinationName: dest?.name || last.arrival_airport?.name || destCode,
    departDate: dateOf(first.departure_airport?.time) || departDate,
    departTime: timeOf(first.departure_airport?.time),
    arriveDate: dateOf(last.arrival_airport?.time),
    arriveTime: timeOf(last.arrival_airport?.time),
    returnDate,
    returnTime: null,
    price: it.price,
    currency: 'EUR',
    airline: airlines.join(' + '),
    airlineLogo: it.airline_logo || first.airline_logo || null,
    flightNumber: segs.map((s) => s.flight_number).filter(Boolean).join(', '),
    transfers: Array.isArray(it.layovers) ? it.layovers.length : segs.length - 1,
    durationMin: Number(it.total_duration) || null,
    typicalRange,
    bookingUrl: searchUrl,
  };
}

export function createSerpApi({ apiKey }) {
  /** One Google Flights search. Both ids may be comma-separated airport lists. */
  async function fetchFlights({ origin, destination, departDate, returnDate }) {
    const qs = new URLSearchParams({
      engine: 'google_flights',
      departure_id: origin,
      arrival_id: destination,
      outbound_date: departDate,
      type: returnDate ? '1' : '2',
      currency: 'EUR',
      hl: 'en',
      api_key: apiKey,
      ...(returnDate && { return_date: returnDate }),
    });
    const body = await fetchJson('serpapi', `${BASE}?${qs}`, { timeoutMs: 25_000 });
    // Google answering "no flights" for a set of airports is an empty result, not an outage.
    if (body?.error && !/no results|hasn't returned any results/i.test(body.error)) throw new Error(`serpapi: ${body.error}`);
    const range = body?.price_insights?.typical_price_range;
    const ctx = {
      departDate,
      returnDate,
      typicalRange: Array.isArray(range) ? range : null,
      searchUrl: body?.search_metadata?.google_flights_url || comparisonLinks({ origin, destination, departDate, returnDate })[1].url,
    };
    const all = [...(body?.best_flights || []), ...(body?.other_flights || [])];
    return all.map((it, i) => normalizeSerpItinerary(it, ctx, i)).filter(Boolean);
  }

  return {
    id: 'serpapi',
    searchRoute: ({ origin, destination, departDate, returnDate }) => fetchFlights({ origin, destination, departDate, returnDate }),
    /** Many airports both ways in one search (costs one search; Google returns about 20 flights). */
    async searchMany({ origins, destinations, departDate, returnDate }) {
      const offers = await fetchFlights({ origin: origins.join(','), destination: destinations.join(','), departDate, returnDate });
      // A "typical price" for a mix of routes says nothing about any single one of them.
      return offers.map((o) => ({ ...o, typicalRange: null }));
    },
    // Google Flights has no "anywhere" endpoint in SerpApi's flights engine.
    searchAnywhere: null,
  };
}
