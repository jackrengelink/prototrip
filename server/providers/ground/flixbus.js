// FlixBus / FlixTrain: the public endpoints behind flixbus.com, no API key.
//   reachable: every city you can get to from Enschede, with min/avg price and travel time (one call)
//   search:    exact bus + train connections between two cities on a date
// Unofficial like the Ryanair one, so results are cached and failures are reported, not hidden.

import { fetchJson } from '../../lib/http.js';

const API = 'https://global.api.flixbus.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (ProtoTrip student trip finder)', Accept: 'application/json' };
export const ENSCHEDE_FLIX_ID = '40de6ded-8646-11e6-9066-549f350fcb0c';

const ddmmyyyy = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const minutesBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);

/** One reachable city -> plain object. Prices are one-way, per adult. */
export function normalizeReachable(c) {
  const eur = c?.price?.EUR;
  if (!c?.uuid || !c.location || !Number.isFinite(eur?.min)) return null;
  return {
    id: c.uuid,
    name: c.name,
    country: String(c.country || '').toUpperCase(),
    lat: c.location.lat,
    lon: c.location.lon,
    minPrice: eur.min,
    avgPrice: Number.isFinite(eur.avg) ? eur.avg : null,
    minDurationMin: Math.round(c.min_duration || 0) || null,
    avgDurationMin: Math.round(c.avg_duration || 0) || null,
    transport: Array.isArray(c.transportation_category) ? c.transportation_category : ['bus'],
    direct: c.interconnection === false,
    // How often people search for this destination on FlixBus: separates Berlin from Bünde.
    searchVolume: Number(c.search_volume) || 0,
  };
}

/** One search result (a connection) -> plain object. */
export function normalizeTrip(t) {
  if (!t?.departure?.date || !t?.arrival?.date || !Number.isFinite(t.price?.total)) return null;
  const legs = Array.isArray(t.legs) ? t.legs : [];
  return {
    id: String(t.uid || `${t.departure.date}-${t.price.total}`).replace(/[^\w.:+-]/g, '').slice(0, 120),
    departAt: t.departure.date,
    arriveAt: t.arrival.date,
    departTime: t.departure.date.slice(11, 16),
    arriveTime: t.arrival.date.slice(11, 16),
    departDate: t.departure.date.slice(0, 10),
    arriveDate: t.arrival.date.slice(0, 10),
    durationMin: minutesBetween(t.departure.date, t.arrival.date),
    price: t.price.total,
    transfers: Math.max(0, legs.length - 1),
    modes: [...new Set(legs.map((l) => (l.means_of_transport === 'train' ? 'train' : 'bus')))],
    available: t.status !== 'full' && t.available?.seats !== 0,
  };
}

export function flixBookingUrl({ fromId, toId, date, returnDate = null }) {
  const qs = new URLSearchParams({ departureCity: fromId, arrivalCity: toId, rideDate: ddmmyyyy(date), adult: '1', _locale: 'en' });
  if (returnDate) qs.set('backRide', ddmmyyyy(returnDate));
  return `https://shop.flixbus.com/search?${qs}`;
}

export function createFlixbus({ fetcher = fetchJson } = {}) {
  return {
    id: 'flixbus',
    async reachable(fromId = ENSCHEDE_FLIX_ID) {
      const body = await fetcher('flixbus', `${API}/cms/cities/${fromId}/reachable?language=en&country=nl&limit=400`, { headers: HEADERS, timeoutMs: 15_000 });
      return (Array.isArray(body?.result) ? body.result : []).map(normalizeReachable).filter(Boolean);
    },
    async search({ fromId, toId, date }) {
      const qs = new URLSearchParams({
        from_city_id: fromId, to_city_id: toId, departure_date: ddmmyyyy(date),
        products: JSON.stringify({ adult: 1 }), currency: 'EUR', locale: 'en', search_by: 'cities', include_after_midnight_rides: '1',
      });
      const body = await fetcher('flixbus', `${API}/search/service/v4/search?${qs}`, { headers: HEADERS, timeoutMs: 20_000 });
      const results = Object.values(body?.trips?.[0]?.results || {});
      return results.map(normalizeTrip).filter((t) => t && t.available);
    },
  };
}
