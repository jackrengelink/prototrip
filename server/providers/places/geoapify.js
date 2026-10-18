// Geoapify Places (OpenStreetMap data): restaurants, bars, parks, shops, museums.
// Free plan: 3,000 credits/day. Docs: https://apidocs.geoapify.com/docs/places/

import { fetchJson } from '../../lib/http.js';

const API = 'https://api.geoapify.com/v2/places';
const RADIUS_M = 6000;

const GROUPS = {
  sights: 'tourism.sights,tourism.attraction,entertainment.museum,leisure.park,commercial.marketplace,commercial.shopping_mall',
  food: 'catering.restaurant,catering.cafe,catering.bar,catering.pub,adult.nightclub',
};

/** Map Geoapify category list to one of the app's place kinds. */
export function kindFromCategories(categories = []) {
  const has = (prefix) => categories.some((c) => c === prefix || c.startsWith(`${prefix}.`));
  if (has('entertainment.museum')) return 'museum';
  if (has('catering.bar') || has('catering.pub') || has('adult.nightclub')) return 'nightlife';
  if (has('catering')) return 'food';
  if (has('leisure.park') || has('natural')) return 'nature';
  if (has('commercial')) return 'shopping';
  if (has('tourism') || has('building.historic') || has('heritage')) return 'sight';
  return null;
}

export function normalizeGeoapify(body) {
  const features = Array.isArray(body?.features) ? body.features : [];
  return features
    .map((f) => f.properties || {})
    .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => {
      const hasWiki = Boolean(p.wiki_and_media?.wikidata || p.datasource?.raw?.wikidata);
      return {
        id: `geo-${p.place_id}`,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        kind: kindFromCategories(p.categories),
        description: p.address_line2 || null,
        url: p.website || null,
        popularity: hasWiki ? 0.45 : 0.2,
        source: 'geoapify',
      };
    })
    .filter((p) => p.kind);
}

export function createGeoapify({ apiKey }) {
  async function fetchGroup(categories, { lat, lon }, limit) {
    const qs = new URLSearchParams({
      categories,
      filter: `circle:${lon},${lat},${RADIUS_M}`,
      bias: `proximity:${lon},${lat}`,
      limit: String(limit),
      apiKey,
    });
    return normalizeGeoapify(await fetchJson('geoapify', `${API}?${qs}`));
  }
  return {
    id: 'geoapify',
    async nearby(point) {
      const [sights, food] = await Promise.all([fetchGroup(GROUPS.sights, point, 60), fetchGroup(GROUPS.food, point, 60)]);
      return [...sights, ...food];
    },
  };
}
