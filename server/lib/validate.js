// Input validation for every query parameter that reaches a provider.

import { INTERESTS } from './itinerary.js';
import { HOME, homeAirportCodes, AIRPORT_GROUPS } from '../data/airports.js';

const IATA = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TRIP_DAYS = 21;
const MAX_FLEX_DAYS = 7;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DAYS_AHEAD = 360;
const DAY_MS = 86_400_000;
export const REACH = Object.freeze(['short', 'smart', 'world']);

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// One day of slack so a user west of UTC can still pick their local "today".
function todayUtc() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY_MS;
}

export function parseIata(value, field) {
  const code = String(value || '').trim().toUpperCase();
  if (!IATA.test(code)) throw new ValidationError(`${field} must be a 3-letter airport or city code`);
  return code;
}

export function parseDate(value, field, { today = todayUtc() } = {}) {
  const s = String(value || '').trim();
  if (!ISO_DATE.test(s)) throw new ValidationError(`${field} must be a date like 2026-11-20`);
  const t = Date.parse(`${s}T00:00:00Z`);
  // Date.parse rolls 2026-02-31 over to March; reject anything that doesn't round-trip.
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new ValidationError(`${field} is not a real date`);
  if (t < today) throw new ValidationError(`${field} is in the past`);
  if (t > today + MAX_DAYS_AHEAD * DAY_MS) throw new ValidationError(`${field} is too far ahead (max ~1 year)`);
  return s;
}

export function parseMonth(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new ValidationError('month must look like 2026-11');
  return s;
}

export function parseReach(value) {
  const reach = String(value || 'smart').toLowerCase();
  if (!REACH.includes(reach)) throw new ValidationError(`reach must be one of ${REACH.join(', ')}`);
  return reach;
}

export function parseFlex(value) {
  if (value === undefined || value === null || value === '') return 3;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_FLEX_DAYS) throw new ValidationError(`flex must be 0-${MAX_FLEX_DAYS} days`);
  return n;
}

export function parseTime(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim();
  if (!HHMM.test(s)) throw new ValidationError(`${field} must be a time like 14:30`);
  return s;
}

export function parseInterests(value) {
  if (!value) return [];
  const list = String(value).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set(list.filter((i) => INTERESTS.includes(i)))];
}

export function parseBudget(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) throw new ValidationError('budget must be a positive number');
  return Math.round(n);
}

/**
 * Validate a search. Destination may be "ANYWHERE" (or empty) for open-ended deal hunting.
 * @param {URLSearchParams} params
 */
export function parseSearch(params, opts = {}) {
  // "NL" means: search every airport students in Enschede can reach by train.
  const rawOrigin = String(params.get('origin') || '').trim().toUpperCase();
  const origin = rawOrigin === HOME.code ? HOME.code : parseIata(rawOrigin, 'origin');
  const airports = String(params.get('airports') || 'near').toLowerCase();
  if (!AIRPORT_GROUPS[airports]) throw new ValidationError('airports must be nl, near or all');
  const origins = origin === HOME.code ? homeAirportCodes(airports) : [origin];
  const rawDest = String(params.get('destination') || '').trim().toUpperCase();
  // "country:ES" = every airport in that country.
  const country = /^COUNTRY:([A-Z]{2})$/.exec(rawDest)?.[1] || null;
  const destination = country || rawDest === '' || rawDest === 'ANYWHERE' ? null : parseIata(rawDest, 'destination');
  if (destination && origins.includes(destination)) throw new ValidationError('origin and destination must differ');

  const departDate = parseDate(params.get('departDate'), 'departDate', opts);
  const returnDate = params.get('returnDate') ? parseDate(params.get('returnDate'), 'returnDate', opts) : null;
  if (returnDate) {
    const days = (Date.parse(returnDate) - Date.parse(departDate)) / DAY_MS;
    if (days < 0) throw new ValidationError('returnDate must be after departDate');
    if (days > MAX_TRIP_DAYS) throw new ValidationError(`trips are limited to ${MAX_TRIP_DAYS} days`);
  }
  return {
    origin,
    origins,
    destination,
    country,
    departDate,
    returnDate,
    budget: parseBudget(params.get('budget')),
    interests: parseInterests(params.get('interests')),
    reach: parseReach(params.get('reach')),
    flex: parseFlex(params.get('flex')),
    airports,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACE_NAME = /^[\p{L}\p{M}0-9 .,'()\/-]{1,80}$/u;

export function parseCityId(value) {
  const s = String(value || '').trim();
  if (!UUID.test(s)) throw new ValidationError('city must be a FlixBus city id');
  return s.toLowerCase();
}

/** Bus & train searches start in Enschede, so they only need dates, budget and interests. */
export function parseGroundSearch(params, opts = {}) {
  const departDate = parseDate(params.get('departDate'), 'departDate', opts);
  const returnDate = params.get('returnDate') ? parseDate(params.get('returnDate'), 'returnDate', opts) : null;
  if (returnDate && returnDate < departDate) throw new ValidationError('returnDate must be after departDate');
  if (returnDate && (Date.parse(returnDate) - Date.parse(departDate)) / DAY_MS > MAX_TRIP_DAYS) throw new ValidationError(`trips are limited to ${MAX_TRIP_DAYS} days`);
  return { departDate, returnDate, budget: parseBudget(params.get('budget')), interests: parseInterests(params.get('interests')), domestic: params.get('domestic') === '1' };
}

/** A place without an airport code (bus & train destinations): name + coordinates. */
function parsePlace(params) {
  const name = String(params.get('name') || '').trim();
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!PLACE_NAME.test(name)) throw new ValidationError('name is invalid');
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ValidationError('lat/lon are invalid');
  const country = String(params.get('country') || '').trim().toUpperCase();
  return { name, lat, lon, country: /^[A-Z]{2}$/.test(country) ? country : null };
}

/** Validate a stay for /api/explore: destination (airport code or place), dates, times, interests. */
export function parseStay(params, opts = {}) {
  const place = params.get('destination') ? null : parsePlace(params);
  const destination = place ? null : parseIata(params.get('destination'), 'destination');
  const startDate = parseDate(params.get('startDate'), 'startDate', opts);
  const endDate = parseDate(params.get('endDate'), 'endDate', opts);
  const days = (Date.parse(endDate) - Date.parse(startDate)) / DAY_MS;
  if (days < 0) throw new ValidationError('endDate must be after startDate');
  if (days > MAX_TRIP_DAYS) throw new ValidationError(`trips are limited to ${MAX_TRIP_DAYS} days`);
  return {
    destination,
    ...(place && { place }),
    startDate,
    endDate,
    arrivalTime: parseTime(params.get('arrivalTime'), 'arrivalTime'),
    departureTime: parseTime(params.get('departureTime'), 'departureTime'),
    interests: parseInterests(params.get('interests')),
  };
}
