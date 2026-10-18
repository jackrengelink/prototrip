// Flight service: searches every origin with every configured provider, merges, scores deals,
// applies the "reach" filter and falls back to demo fares.

import { createDemoFlights } from './demo.js';
import { createSerpApi } from './serpapi.js';
import { createTravelpayouts } from './travelpayouts.js';
import { createRyanair } from './ryanair.js';
import { scoreOffers } from '../../lib/deals.js';
import { haversineKm } from '../../lib/geo.js';
import { findAirport, homeAirports } from '../../data/airports.js';
import { MINUTE } from '../../lib/cache.js';

const FLIGHT_TTL_MS = 30 * MINUTE;
// Roughly a 4.5-hour flight from the Netherlands: all of Europe, the Canaries, Morocco, Istanbul.
export const SHORT_HAUL_KM = 3600;

const HOME_INFO = new Map(homeAirports().map((a) => [a.iata, a]));

function distanceFor(offer) {
  const a = findAirport(offer.origin);
  const b = findAirport(offer.destination) || findAirport(offer.destinationCity);
  return a && b ? haversineKm(a, b) : 0;
}

/** Map positions for the origin airport and the destination, for drawing the route. */
export function coordsFor(offer) {
  const a = findAirport(offer.origin);
  const b = findAirport(offer.destination) || findAirport(offer.destinationCity);
  return {
    origin: a ? [a.lat, a.lon] : null,
    destination: b ? [b.lat, b.lon] : null,
  };
}

/** Keep the cheapest copy when two providers return the same flight. */
function dedupe(offers) {
  const seen = new Map();
  for (const o of offers) {
    const key = `${o.origin}-${o.destination}-${o.departDate}-${o.departTime}-${o.airline}`;
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
    // Door-to-door: add the train/bus ticket from Enschede to the departure airport.
    const withTravel = dedupe(offers).map((o) => {
      const home = HOME_INFO.get(o.origin);
      const travelEur = home ? (returnDate ? home.travelEur : Math.round(home.travelEur / 2)) : 0;
      return { ...o, travelMin: home?.travelMin ?? null, travelEur, totalPrice: Math.round((o.price + travelEur) * 100) / 100 };
    });
    const scored = scoreOffers(withTravel, { distanceFor, roundTrip: Boolean(returnDate) })
      .map((o) => ({ ...o, coords: coordsFor(o) }));

    const warnings = [...new Set(failed)].map((id) => `${id} is unavailable right now`);
    if (isDemo && failed.length > 0) warnings.push('No live fares found, so these are demo prices');
    const result = { offers: scored, warnings, demo: isDemo };
    // Never cache a result that came from a failure, or one outage sticks around for 30 minutes.
    if (failed.length === 0) cache.set(key, result, FLIGHT_TTL_MS);
    return result;
  }

  return {
    providers: live.map((p) => p.id),
    /** Flights for one route (from one or many origins), cheapest first. */
    async searchRoute(query) {
      const res = await search('searchRoute', query);
      return { ...res, offers: [...res.offers].sort((a, b) => (a.totalPrice ?? a.price) - (b.totalPrice ?? b.price)) };
    },
    /** One fare per destination, best deal first, filtered by reach. */
    async searchAnywhere(query) {
      const res = await search('searchAnywhere', query);
      const offers = applyReach(bestPerDestination(res.offers), query.reach || 'smart');
      return { ...res, offers: offers.sort((a, b) => b.deal.score - a.deal.score || a.price - b.price) };
    },
  };
}
