// Flight service: searches every origin with every configured provider, merges, scores deals,
// applies the "reach" filter and falls back to demo fares.

import { createDemoFlights } from './demo.js';
import { createSerpApi } from './serpapi.js';
import { createTravelpayouts } from './travelpayouts.js';
import { createRyanair } from './ryanair.js';
import { pairOneWays, cheapestPerAirportPair, returnAirportOf } from './mixed.js';
import { scoreOffers } from '../../lib/deals.js';
import { haversineKm } from '../../lib/geo.js';
import { findAirport, homeAirports, countryName, airportsInCountry } from '../../data/airports.js';
import { MINUTE, HOUR } from '../../lib/cache.js';

const FLIGHT_TTL_MS = 30 * MINUTE;
// Google Flights returns ~20 flights per search, so a country takes a few searches. They come out of
// the 250-a-month SerpApi quota: keep the result longer, and never spend more than this per country.
const GOOGLE_COUNTRY_TTL_MS = 6 * HOUR;
const GOOGLE_ORIGINS_PER_SEARCH = 3;
const GOOGLE_AIRPORTS_PER_SEARCH = 7;
const GOOGLE_MAX_AIRPORT_GROUPS = 2;
// Ticket home from each airport in a country: gentle on Ryanair's unofficial endpoint.
const MIXED_TTL_MS = 20 * MINUTE;
const MIXED_CALLS_AT_ONCE = 5;
// Roughly a 4.5-hour flight from the Netherlands: all of Europe, the Canaries, Morocco, Istanbul.
export const SHORT_HAUL_KM = 3600;

const HOME_INFO = new Map(homeAirports().map((a) => [a.iata, a]));
const PROVIDER_NAMES = { ryanair: 'Ryanair', travelpayouts: 'Aviasales', serpapi: 'Google Flights' };

function distanceFor(offer) {
  const a = findAirport(offer.origin);
  const b = findAirport(offer.destination) || findAirport(offer.destinationCity);
  return a && b ? haversineKm(a, b) : 0;
}

/** Map positions for the origin airport and the destination, for drawing the route. */
export function coordsFor(offer) {
  const a = findAirport(offer.origin);
  const b = findAirport(offer.destination) || findAirport(offer.destinationCity);
  const point = (code) => {
    const place = findAirport(code);
    return place ? [place.lat, place.lon] : null;
  };
  return {
    origin: a ? [a.lat, a.lon] : null,
    destination: b ? [b.lat, b.lon] : null,
    ...(offer.returnFrom && { returnFrom: point(offer.returnFrom), returnTo: point(offer.returnTo) }),
  };
}

/** Every flight list runs from the lowest flight price up; the train/bus to the airport doesn't count here. */
export const byFlightPrice = (a, b) => a.price - b.price || b.deal.score - a.deal.score;

/** Keep the cheapest copy when two providers return the same flight. */
function dedupe(offers) {
  const seen = new Map();
  for (const o of offers) {
    const key = o.mixed ? o.id : `${o.origin}-${o.destination}-${o.departDate}-${o.departTime}-${o.airline}`;
    const prev = seen.get(key);
    if (!prev || o.price < prev.price) seen.set(key, o);
  }
  return [...seen.values()];
}

/** For "Anywhere": the single best deal per destination city, whichever home airport it leaves from. */
export function bestPerDestination(offers) {
  const best = new Map();
  for (const o of offers) {
    const key = o.destinationCity || o.destination;
    const prev = best.get(key);
    if (!prev || o.deal.score > prev.deal.score || (o.deal.score === prev.deal.score && (o.totalPrice ?? o.price) < (prev.totalPrice ?? prev.price))) best.set(key, o);
  }
  return [...best.values()];
}

/** For a whole country: the cheapest fare per airline on every from-airport/to-airport pair in it. */
export function bestPerRouteInCountry(offers, country) {
  const best = new Map();
  for (const o of offers) {
    const place = findAirport(o.destination) || findAirport(o.destinationCity);
    if (place?.country !== country) continue;
    const key = o.mixed ? o.id : `${o.origin}-${o.destination}-${String(o.airline).toLowerCase()}`;
    const prev = best.get(key);
    if (!prev || o.price < prev.price) best.set(key, o);
  }
  return [...best.values()];
}

/** The train/bus for a whole trip. With two home airports: half the return ticket to each. */
function travelCost(offer, returnDate) {
  const home = HOME_INFO.get(offer.origin);
  if (!home) return 0;
  if (!returnDate) return Math.round(home.travelEur / 2);
  if (!offer.mixed || offer.returnTo === offer.origin) return home.travelEur;
  return Math.round(home.travelEur / 2) + Math.round((HOME_INFO.get(offer.returnTo)?.travelEur || 0) / 2);
}

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/** Split a country search into Google searches: every group of origins against every group of airports. */
export function countryBatches(origins, airports) {
  const destinations = chunk(airports.filter((a) => !origins.includes(a)), GOOGLE_AIRPORTS_PER_SEARCH).slice(0, GOOGLE_MAX_AIRPORT_GROUPS);
  return chunk(origins, GOOGLE_ORIGINS_PER_SEARCH).flatMap((o) => destinations.map((d) => ({ origins: o, destinations: d })));
}

/** Door-to-door costs, deal scores and map positions for raw fares. */
function enrich(offers, { returnDate }) {
  // Door-to-door: add the train/bus ticket from Enschede to the departure airport.
  const withTravel = dedupe(offers).map((o) => {
    const home = HOME_INFO.get(o.origin);
    const travelEur = travelCost(o, returnDate);
    return { ...o, travelMin: home?.travelMin ?? null, travelEur, totalPrice: Math.round((o.price + travelEur) * 100) / 100 };
  });
  return scoreOffers(withTravel, { distanceFor, roundTrip: Boolean(returnDate) })
    .map((o) => ({ ...o, coords: coordsFor(o) }));
}

/**
 * short: only flights up to ~4.5h. smart: short-haul plus long-haul *crazy* deals only. world: everything.
 */
export function applyReach(offers, reach) {
  if (reach === 'world') return offers;
  return offers.filter((o) => o.distanceKm <= SHORT_HAUL_KM || (reach === 'smart' && o.deal.tier === 'crazy'));
}

export function createFlightService({ config, cache, directory = null, logger = console }) {
  const live = [];
  // Keyless and live: on by default. Set RYANAIR=off to disable.
  if (config.ryanair !== false) live.push({ ...createRyanair({ cache }), maxOrigins: Infinity });
  // SerpApi's free tier is small, so it only searches the first few home airports.
  if (config.serpapiKey) live.push({ ...createSerpApi({ apiKey: config.serpapiKey }), maxOrigins: 3 });
  if (config.travelpayoutsToken) live.push({ ...createTravelpayouts({ token: config.travelpayoutsToken, marker: config.travelpayoutsMarker }), maxOrigins: Infinity });
  const demo = createDemoFlights();

  /** One origin. Returns { offers, failed, demo }. */
  async function runOrigin(method, query, originIndex) {
    const supported = live.some((p) => typeof p[method] === 'function');
    const providers = live.filter((p) => typeof p[method] === 'function' && originIndex < p.maxOrigins);
    const failed = [];
    if (providers.length > 0) {
      const results = await Promise.allSettled(providers.map((p) => p[method](query)));
      const offers = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') offers.push(...r.value);
        else {
          logger.warn(`[flights] ${providers[i].id} ${query.origin} failed: ${r.reason?.message}`);
          failed.push(providers[i].id);
        }
      });
      if (offers.length > 0 || failed.length === 0) return { offers, failed, demo: false };
    }
    // Every live provider failed for this origin: show demo fares (flagged) instead of nothing.
    if (providers.length > 0) return { offers: await demo[method](query), failed, demo: true };
    // No live provider can answer this kind of search at all: demo mode.
    if (!supported) return { offers: await demo[method](query), failed, demo: true };
    // Live providers exist but skip this origin (quota-limited): nothing to add.
    return { offers: [], failed, demo: false };
  }

  async function search(method, query) {
    const { destination, departDate, returnDate, flex = 0 } = query;
    const origins = query.origins?.length ? query.origins : [query.origin];
    const key = `flights:${method}:${origins.join(',')}:${destination}:${departDate}:${returnDate}:${flex}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const perOrigin = await Promise.all(origins.map((origin, i) =>
      runOrigin(method, { origin, destination, departDate, returnDate, flex }, i)));
    // Unknown destinations (Girona, Treviso...) need coordinates before they can be scored.
    if (directory) await directory.ready();
    const failed = [...new Set(perOrigin.flatMap((r) => r.failed))];
    const isDemo = perOrigin.every((r) => r.demo || r.offers.length === 0) && perOrigin.some((r) => r.demo);
    const offers = perOrigin.flatMap((r) => r.offers).filter((o) => Number.isFinite(o.price) && o.price > 0);
    const scored = enrich(offers, { returnDate });

    const warnings = failed.map((id) => `${PROVIDER_NAMES[id] || id} is unavailable right now`);
    if (isDemo && failed.length > 0) warnings.push('No live fares found, so these are demo prices');
    const result = { offers: scored, warnings, demo: isDemo };
    // Never cache a result that came from a failure, or one outage sticks around for 30 minutes.
    if (failed.length === 0) cache.set(key, result, FLIGHT_TTL_MS);
    return result;
  }

  /** Google Flights for a whole country: the source that also knows KLM, TAP and the rest. */
  async function googleCountry(query, seenAirports) {
    const google = live.find((p) => typeof p.searchMany === 'function');
    if (!google) return { offers: [], warnings: [] };
    const { country, departDate, returnDate } = query;
    const origins = query.origins?.length ? query.origins : [query.origin];
    const key = `flights:google-country:${country}:${origins.join(',')}:${departDate}:${returnDate}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const batches = countryBatches(origins, airportsInCountry(country, seenAirports));
    const results = await Promise.allSettled(batches.map((b) => google.searchMany({ ...b, departDate, returnDate })));
    const failed = results.filter((r) => r.status === 'rejected');
    failed.forEach((r) => logger.warn(`[flights] google country search failed: ${r.reason?.message}`));
    const offers = enrich(results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])), { returnDate });
    const result = { offers, warnings: failed.length ? ['Google Flights is unavailable right now, so this list may be incomplete'] : [] };
    if (failed.length === 0) cache.set(key, result, GOOGLE_COUNTRY_TTL_MS);
    return result;
  }

  /** One-way tickets from many airports. An airport that fails is logged, left out and counted. */
  async function oneWaysFrom(source, airports, date, flex) {
    const pending = [...airports];
    const tickets = [];
    let failed = 0;
    const worker = async () => {
      while (pending.length > 0) {
        const origin = pending.shift();
        try {
          tickets.push(...await source.oneWays({ origin, departDate: date, flex }));
        } catch (err) {
          failed += 1;
          logger.warn(`[flights] one-way tickets from ${origin} failed: ${err.message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: MIXED_CALLS_AT_ONCE }, worker));
    return { tickets, failed };
  }

  /**
   * Every trip into a country that flies home from another airport, or to another home airport.
   * returnFrom: also try this airport, which an exact date's outbound tickets may not reach.
   */
  async function mixedTrips(query, country, returnFrom = null) {
    const source = live.find((p) => typeof p.oneWays === 'function');
    const { departDate, returnDate, flex = 0 } = query;
    if (!source || !returnDate || !country) return [];
    const origins = query.origins?.length ? query.origins : [query.origin];
    const key = `flights:mixed:${country}:${origins.join(',')}:${departDate}:${returnDate}:${flex}:${returnFrom}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const out = await oneWaysFrom(source, origins, departDate, flex);
    if (directory) await directory.ready();
    const outs = out.tickets.filter((o) => findAirport(o.destination)?.country === country && !origins.includes(o.destination));
    const airports = new Set([...outs.map((o) => o.destination), ...(returnFrom ? [returnFrom] : [])]);
    const back = await oneWaysFrom(source, airports, returnDate, flex);
    const backs = back.tickets.filter((o) => origins.includes(o.destination));
    const trips = enrich(pairOneWays(outs, backs, { departDate, returnDate, flex }), { returnDate })
      .map((o) => ({ ...o, returnFromName: findAirport(o.returnFrom)?.name || o.returnFrom }));
    // Only remember a complete answer, or one failed airport hides its trips for 20 minutes.
    if (out.failed + back.failed === 0) cache.set(key, trips, MIXED_TTL_MS);
    return trips;
  }

  return {
    providers: live.map((p) => p.id),
    /** Cheapest fare per day for one route and month. Empty when no source can say. */
    async calendar(query) {
      const source = live.find((p) => typeof p.cheapestDays === 'function');
      if (!source) return { days: [] };
      try {
        return { days: await source.cheapestDays(query) };
      } catch (err) {
        logger.warn(`[flights] calendar ${query.origin}-${query.destination} failed: ${err.message}`);
        return { days: [] };
      }
    },
    /**
     * Flights for one route (from one or many origins), cheapest flight first.
     * offerId: the fare someone chose. Keeps every two-ticket combination, so it can be found again.
     */
    async searchRoute(query, { offerId = null } = {}) {
      const res = await search('searchRoute', query);
      const place = findAirport(query.destination);
      const city = place?.city || query.destination;
      const trips = await mixedTrips(query, place?.country, returnAirportOf(offerId));
      const mixed = trips.filter((o) => o.destination === query.destination || o.destinationCity === city);
      return { ...res, offers: [...res.offers, ...(offerId ? mixed : cheapestPerAirportPair(mixed))].sort(byFlightPrice) };
    },
    /**
     * "Anywhere": one fare per destination, filtered by reach. Cheapest flight first.
     * With query.country: every airline on every route into that country (the user chose it, so
     * reach doesn't apply), adding Google Flights to the Anywhere data.
     */
    async searchAnywhere(query) {
      const res = await search('searchAnywhere', { ...query, destination: null });
      if (!query.country) {
        return { ...res, offers: applyReach(bestPerDestination(res.offers), query.reach || 'smart').sort(byFlightPrice) };
      }
      const seen = bestPerRouteInCountry(res.offers, query.country);
      const [google, mixed] = await Promise.all([googleCountry(query, seen.map((o) => o.destination)), mixedTrips(query, query.country)]);
      return {
        ...res,
        offers: bestPerRouteInCountry([...seen, ...google.offers, ...cheapestPerAirportPair(mixed)], query.country).sort(byFlightPrice),
        warnings: [...res.warnings, ...google.warnings],
        country: { code: query.country, name: countryName(query.country) },
      };
    },
  };
}
