// Travelpayouts / Aviasales Data API: cached cheapest fares seen by Aviasales users (2-7 days old).
// Docs: https://support.travelpayouts.com/hc/en-us/articles/203956163

import { fetchJson } from '../../lib/http.js';
import { aviasalesSearchUrl } from '../../lib/links.js';
import { findAirport } from '../../data/airports.js';
import { airlineName } from './airlines.js';

const BASE = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const MIN_FOR_RANGE = 5;

const datePart = (iso) => (iso ? String(iso).slice(0, 10) : null);
const timePart = (iso) => (iso && String(iso).length >= 16 ? String(iso).slice(11, 16) : null);

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

/** Turn a Travelpayouts row into the app's offer shape. */
export function normalizeTravelpayouts(row, { marker = '', returnRequested = false } = {}) {
  const departDate = datePart(row.departure_at);
  const returnDate = returnRequested ? datePart(row.return_at) : null;
  const dest = findAirport(row.destination_airport) || findAirport(row.destination);
  const durationTo = Number(row.duration_to || row.duration) || null;
  // `link` must be a path; anything else could point the booking button at another host.
  const bookingUrl = typeof row.link === 'string' && row.link.startsWith('/') && !row.link.startsWith('//')
    ? `https://www.aviasales.com${row.link}${marker ? `${row.link.includes('?') ? '&' : '?'}marker=${encodeURIComponent(marker)}` : ''}`
    : aviasalesSearchUrl({ origin: row.origin, destination: row.destination, departDate, returnDate, marker });
  return {
    id: `tp-${row.origin_airport || row.origin}-${row.destination_airport || row.destination}-${row.departure_at}-${row.airline}${row.flight_number}`.replace(/[^\w.:+-]/g, ''),
    source: 'travelpayouts',
    sourceLabel: 'Aviasales (cached)',
    live: false,
    origin: row.origin_airport || row.origin,
    destination: row.destination_airport || row.destination,
    destinationCity: row.destination,
    destinationName: dest?.name || row.destination,
    departDate,
    departTime: timePart(row.departure_at),
    arriveTime: null,
    returnDate,
    returnTime: returnRequested ? timePart(row.return_at) : null,
    price: Number(row.price),
    currency: 'EUR',
    airline: airlineName(row.airline),
    flightNumber: row.flight_number ? `${row.airline}${row.flight_number}` : null,
    transfers: Number(row.transfers) || 0,
    durationMin: durationTo,
    bookingUrl,
  };
}

export function createTravelpayouts({ token, marker = '' }) {
  async function query(params) {
    const qs = new URLSearchParams({ currency: 'eur', sorting: 'price', limit: '100', ...params });
    const body = await fetchJson('travelpayouts', `${BASE}?${qs}`, { headers: { 'X-Access-Token': token, 'Accept-Encoding': 'gzip' } });
    if (body?.success === false) throw new Error(`travelpayouts: ${body.error || 'request failed'}`);
    return Array.isArray(body?.data) ? body.data : [];
  }

  return {
    id: 'travelpayouts',
    async searchRoute({ origin, destination, departDate, returnDate }) {
      const base = { origin, destination, one_way: String(!returnDate), unique: 'false' };
      const [exact, month] = await Promise.all([
        query({ ...base, departure_at: departDate, ...(returnDate && { return_at: returnDate }) }),
        query({ ...base, departure_at: departDate.slice(0, 7), ...(returnDate && { return_at: returnDate.slice(0, 7) }) }),
      ]);
      const monthPrices = month.map((r) => Number(r.price)).filter(Number.isFinite).sort((a, b) => a - b);
      const typicalRange = monthPrices.length >= MIN_FOR_RANGE ? [percentile(monthPrices, 0.25), percentile(monthPrices, 0.75)] : null;
      return exact
        .map((row) => normalizeTravelpayouts(row, { marker, returnRequested: Boolean(returnDate) }))
        .map((o) => ({ ...o, typicalRange }));
    },
    async searchAnywhere({ origin, departDate, returnDate }) {
      // `unique=true` with only an origin returns the cheapest fare per destination for that month.
      const rows = await query({
        origin,
        unique: 'true',
        one_way: String(!returnDate),
        departure_at: departDate.slice(0, 7),
        ...(returnDate && { return_at: returnDate.slice(0, 7) }),
      });
      return rows.map((row) => normalizeTravelpayouts(row, { marker, returnRequested: Boolean(returnDate) }));
    },
  };
}
