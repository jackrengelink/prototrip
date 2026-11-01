// Public airport + city directory (Travelpayouts open data, no token needed).
// ~10,000 airports with coordinates. Downloaded once, then kept in .cache/ for a week,
// so restarts are instant and the app keeps working offline.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchJson } from '../lib/http.js';
import { registerAirports } from './airports.js';

const AIRPORTS_URL = 'https://api.travelpayouts.com/data/en/airports.json';
const CITIES_URL = 'https://api.travelpayouts.com/data/en/cities.json';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Join airports to their city names into the compact shape the app uses. */
export function buildDirectory(airports, cities) {
  const cityByCode = new Map((cities || []).map((c) => [c.code, c]));
  const out = [];
  for (const a of airports || []) {
    if (!a.code || !a.coordinates || a.flightable === false || (a.iata_type && a.iata_type !== 'airport')) continue;
    const city = cityByCode.get(a.city_code);
    out.push({
      iata: a.code,
      kind: 'airport',
      name: city?.name_translations?.en || city?.name || a.name_translations?.en || a.name,
      country: a.country_code,
      city: a.city_code || a.code,
      lat: a.coordinates.lat,
      lon: a.coordinates.lon,
    });
  }
  // City codes too (TCI = Tenerife, LON = London), placed at the city centre.
  for (const c of cities || []) {
    if (!c.code || !c.coordinates || c.has_flightable_airport === false) continue;
    out.push({ iata: c.code, name: c.name_translations?.en || c.name, country: c.country_code, city: c.code, lat: c.coordinates.lat, lon: c.coordinates.lon });
  }
  return out;
}

export function createDirectory({ root, logger = console, fetcher = fetchJson }) {
  const file = path.join(root, '.cache', 'airports.json');
  let loading = null;

  async function readCache() {
    try {
      const { savedAt, entries } = JSON.parse(await readFile(file, 'utf8'));
      return { entries, fresh: Date.now() - savedAt < MAX_AGE_MS };
    } catch {
      return null;
    }
  }

  async function download() {
    const [airports, cities] = await Promise.all([
      fetcher('airport-directory', AIRPORTS_URL, { timeoutMs: 30_000 }),
      fetcher('airport-directory', CITIES_URL, { timeoutMs: 30_000 }),
    ]);
    const entries = buildDirectory(airports, cities);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ savedAt: Date.now(), entries }));
    return entries;
  }

  async function refresh() {
    registerAirports(await download());
  }

  async function load() {
    const cached = await readCache();
    if (cached) {
      registerAirports(cached.entries);
      // An older copy still works, so searches never wait for the update.
      if (!cached.fresh) refresh().catch((err) => logger.warn(`[directory] update failed (${err.message}); keeping older copy`));
      return cached.entries.length;
    }
    try {
      const entries = await download();
      registerAirports(entries);
      return entries.length;
    } catch (err) {
      // The curated airport list still works.
      logger.warn(`[directory] download failed (${err.message}); using built-in airports only`);
      return 0;
    }
  }

  return {
    /** Resolves once the directory is registered. Safe to call many times. */
    ready() {
      if (!loading) loading = load();
      return loading;
    },
  };
}
