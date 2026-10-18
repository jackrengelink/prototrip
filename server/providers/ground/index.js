// Bus & train mode: everything you can reach from Enschede by FlixBus / FlixTrain.
// The deals list uses one "reachable cities" call (from-prices, not date-specific); a chosen trip
// then searches exact connections for the dates, both ways.

import { createFlixbus, ENSCHEDE_FLIX_ID, flixBookingUrl } from './flixbus.js';
import { scoreOffers } from '../../lib/deals.js';
import { haversineKm } from '../../lib/geo.js';
import { HOME } from '../../data/airports.js';
import { MINUTE } from '../../lib/cache.js';

const TTL_MS = 30 * MINUTE;
export const MAX_GROUND_HOURS = 10;
const HOME_POINT = [HOME.lat, HOME.lon];
// When picking "the" connection: a little money is worth a lot of time on a bus.
const EUR_PER_HOUR = 4;
const MIN_TRIP_KM = 100;
// Trip-worthy destinations only (Potsdam, Lübeck: yes; Bad Oeynhausen, Bünde: no). FlixBus search volume.
const MIN_SEARCH_VOLUME = 300_000;
const AIRPORT_STOP = /\b(airport|flughafen|a[eé]roport|aeropuerto|luchthaven)\b/i;

const transportLabel = (modes) => (modes.includes('train') && modes.includes('bus') ? 'Bus + train' : modes.includes('train') ? 'Train' : 'Bus');

/** Turn a reachable city into a deal offer. Return price is estimated as 2× the cheapest one-way. */
export function cityToOffer(city, { departDate, returnDate }) {
  const legs = returnDate ? 2 : 1;
  const price = Math.round(city.minPrice * legs * 100) / 100;
  const usual = city.avgPrice ? Math.round(city.avgPrice * legs * 100) / 100 : null;
  return {
    id: `flix-${city.id}`,
    mode: 'ground',
    source: 'flixbus',
    sourceLabel: 'FlixBus / FlixTrain',
    live: true,
    priceIsFrom: true,
    origin: 'ENS',
    destination: city.id,
    destinationCity: city.id,
    destinationName: city.name,
    country: city.country,
    departDate,
    returnDate,
    departTime: null,
    price,
    typicalRange: usual ? [usual, usual] : null,
    currency: 'EUR',
    airline: transportLabel(city.transport.map((t) => (t === 'flixtrain' ? 'train' : t))),
    transfers: city.direct ? 0 : 1,
    durationMin: city.minDurationMin,
    coords: { origin: HOME_POINT, destination: [city.lat, city.lon] },
    place: { name: city.name, country: city.country, lat: city.lat, lon: city.lon },
    bookingUrl: flixBookingUrl({ fromId: ENSCHEDE_FLIX_ID, toId: city.id, date: departDate, returnDate }),
  };
}

/** Pick the best connection: cheapest, with each hour on the road counting as a few euros. */
export function bestConnection(trips) {
  if (!trips.length) return null;
  return [...trips].sort((a, b) => a.price + (a.durationMin / 60) * EUR_PER_HOUR - (b.price + (b.durationMin / 60) * EUR_PER_HOUR))[0];
}

export function createGroundService({ cache, logger = console, flix = createFlixbus() }) {
  async function reachable() {
    return cache.wrap('ground:reachable', TTL_MS, () => flix.reachable(ENSCHEDE_FLIX_ID));
  }

  async function search(fromId, toId, date) {
    return cache.wrap(`ground:search:${fromId}:${toId}:${date}`, TTL_MS, () => flix.search({ fromId, toId, date }));
  }

  return {
    /** All destinations within MAX_GROUND_HOURS, scored with the bus & train crazy line. */
    async searchAnywhere({ departDate, returnDate, maxHours = MAX_GROUND_HOURS, domestic = false }) {
      try {
        // Real trips only: not airport stops, not towns next door.
        const cities = (await reachable()).filter((c) => c.minDurationMin && c.minDurationMin <= maxHours * 60
          && !AIRPORT_STOP.test(c.name) && haversineKm(HOME, c) >= MIN_TRIP_KM
          && c.searchVolume >= MIN_SEARCH_VOLUME
          // Dutch cities are opt-in: most students already travel there free with their student OV.
          && (domestic || c.country !== 'NL'));
        const offers = cities.map((c) => cityToOffer(c, { departDate, returnDate }));
        const scored = scoreOffers(offers, {
          distanceFor: (o) => haversineKm({ lat: HOME.lat, lon: HOME.lon }, { lat: o.place.lat, lon: o.place.lon }),
          roundTrip: Boolean(returnDate),
          mode: 'ground',
        });
        return { offers: scored.sort((a, b) => b.deal.score - a.deal.score || a.price - b.price), warnings: [], demo: false };
      } catch (err) {
        logger.warn(`[ground] flixbus failed: ${err.message}`);
        return { offers: [], warnings: ['FlixBus is unavailable right now'], demo: false };
      }
    },

    /** Exact connections both ways for one destination city. */
    async trip({ cityId, departDate, returnDate }) {
      const city = (await reachable()).find((c) => c.id === cityId);
      if (!city) return null;
      const [outbound, inbound] = await Promise.all([
        search(ENSCHEDE_FLIX_ID, cityId, departDate),
        returnDate ? search(cityId, ENSCHEDE_FLIX_ID, returnDate) : Promise.resolve([]),
      ]);
      const out = bestConnection(outbound);
      const back = returnDate ? bestConnection(inbound) : null;
      const total = out ? Math.round((out.price + (back?.price || 0)) * 100) / 100 : null;
      const [scored] = total === null ? [null] : scoreOffers([{ ...cityToOffer(city, { departDate, returnDate }), price: total, priceIsFrom: false }], {
        distanceFor: () => haversineKm({ lat: HOME.lat, lon: HOME.lon }, city),
        roundTrip: Boolean(returnDate),
        mode: 'ground',
      });
      return {
        city,
        offer: scored,
        outbound: out,
        inbound: back,
        outboundOptions: [...outbound].sort((a, b) => a.price - b.price).slice(0, 6),
        inboundOptions: [...inbound].sort((a, b) => a.price - b.price).slice(0, 6),
        bookingUrl: flixBookingUrl({ fromId: ENSCHEDE_FLIX_ID, toId: cityId, date: departDate, returnDate }),
      };
    },
  };
}
