// Places service: Wikipedia (headline sights, photos, popularity) + Wikivoyage (what travellers
// actually do, eat and drink) are free and keyless. Geoapify and Viator are optional extras.
// This only runs when someone clicks "What to do here?", never on the deals screen.

import { createWikipedia } from './wikipedia.js';
import { createWikivoyage } from './wikivoyage.js';
import { createGeoapify } from './geoapify.js';
import { createViator } from './viator.js';
import { haversineKm } from '../../lib/geo.js';
import { HOUR } from '../../lib/cache.js';

const PLACES_TTL_MS = 24 * HOUR;
const DUPLICATE_KM = 0.25;

const normName = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function sameName(a, b) {
  const x = normName(a);
  const y = normName(b);
  return x === y || (x.length > 4 && y.includes(x)) || (y.length > 4 && x.includes(y));
}

/**
 * Merge place lists. Earlier lists win, but a duplicate from a later list fills in
 * anything the first copy is missing (a Wikivoyage price or opening hours on a Wikipedia sight).
 */
export function mergePlaces(...lists) {
  const out = [];
  for (const place of lists.flat()) {
    const idx = out.findIndex((p) => sameName(p.name, place.name) && haversineKm(p, place) < DUPLICATE_KM);
    if (idx === -1) {
      out.push(place);
      continue;
    }
    const kept = out[idx];
    const filled = Object.fromEntries(Object.entries(place).filter(([k, v]) => v !== null && v !== undefined && (kept[k] === null || kept[k] === undefined)));
    out[idx] = { ...kept, ...filled };
  }
  return out;
}

export function createPlacesService({ config, cache, logger = console }) {
  const sources = [createWikipedia({ contact: config.contactEmail }), createWikivoyage({ contact: config.contactEmail })];
  if (config.geoapifyKey) sources.push(createGeoapify({ apiKey: config.geoapifyKey }));
  const viator = config.viatorKey ? createViator({ apiKey: config.viatorKey }) : null;

  async function nearby(point, { cityName = '' } = {}) {
    const key = `places:${cityName}:${point.lat.toFixed(3)},${point.lon.toFixed(3)}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const results = await Promise.allSettled(sources.map((s) => s.nearby(point, { cityName })));
    const warnings = [];
    const lists = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      logger.warn(`[places] ${sources[i].id} failed: ${r.reason?.message}`);
      warnings.push(`${sources[i].id} is unavailable right now`);
      return [];
    });
    const result = { places: mergePlaces(...lists), warnings };
    // Only cache complete answers; a Wikipedia timeout shouldn't empty a city's plan for a day.
    if (warnings.length === 0) cache.set(key, result, PLACES_TTL_MS);
    return result;
  }

  async function experiences({ cityName, interests }) {
    if (!viator) return [];
    const key = `viator:${cityName}:${interests.includes('food')}`;
    try {
      return await cache.wrap(key, PLACES_TTL_MS, () => viator.experiences({ cityName, interests }));
    } catch (err) {
      logger.warn(`[places] viator failed: ${err.message}`);
      return [];
    }
  }

  return { sources: [...sources.map((s) => s.id), ...(viator ? ['viator'] : [])], nearby, experiences };
}
