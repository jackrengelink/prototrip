// Wikipedia GeoSearch: free, no key.
// Step 1: up to 500 articles near the city centre, with descriptions and article length.
//         Article length is a good proxy for "this is a big deal" (Colosseum vs a side chapel).
// Step 2: for the top 50, fetch 30-day pageviews and a photo. Pageviews become the popularity score.
// Wikimedia asks API clients to send a descriptive User-Agent with a contact address.

import { fetchJson } from '../../lib/http.js';

const API = 'https://en.wikipedia.org/w/api.php';
const RADIUS_M = 10000;
const CANDIDATES = 500;
const DETAILED = 50; // API limit for pageviews/pageimages per request

const RULES = [
  { kind: null, re: /\b(hotel|railway|station|metro|airport|school|university|college|hospital|company|embassy|district|neighbou?rhood|quarter of|rione|quartiere|municipality|municipio|comune|frazione|ward|constituency|bus|road|motorway|tram|stadium|office|ministry|bank|newspaper|football club|siege|battle|bombing|attack|riot|election|circuit|racecourse|list of)\b/i },
  { kind: 'museum', re: /\b(museum|gallery|galleria|pinacoteca|art collection|exhibition)\b/i },
  { kind: 'nature', re: /\b(park|garden|gardens|beach|hill|lake|river|island|nature reserve|botanical|forest|mountain|viewpoint)\b/i },
  { kind: 'shopping', re: /\b(market|shopping|bazaar|mall|department store)\b/i },
  { kind: 'sight', re: /\b(church|basilica|cathedral|chapel|temple|shrine|mosque|synagogue|palace|castle|fort|fortress|tower|monument|memorial|ruins|ancient|archaeological|amphitheat(?:re|er)|theatre|square|piazza|plaza|fountain|obelisk|gate|arch|column|baths|circus|villa|abbey|monastery|landmark|opera|historic|bridge)\b/i },
];

/** Decide what kind of place an article is, or null to skip it. */
export function classifyArticle(title, description = '') {
  const text = `${title} ${description || ''}`;
  for (const rule of RULES) {
    if (rule.re.test(text)) return rule.kind;
  }
  return null;
}

function totalViews(pageviews) {
  if (!pageviews) return 0;
  return Object.values(pageviews).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

/** Classified candidates, biggest articles first. */
export function pickCandidates(body, limit = DETAILED) {
  return Object.values(body?.query?.pages || {})
    .filter((p) => Array.isArray(p.coordinates) && p.coordinates[0])
    .map((p) => ({ ...p, kind: classifyArticle(p.title, p.description) }))
    .filter((p) => p.kind)
    .sort((a, b) => (b.length || 0) - (a.length || 0))
    .slice(0, limit);
}

/** Combine candidates with their details into normalised places with 0..1 popularity. */
export function normalizeWikipedia(candidates, detailsBody) {
  const details = detailsBody?.query?.pages || {};
  const rows = candidates.map((c) => {
    const d = details[c.pageid] || {};
    return { c, image: d.thumbnail?.source || null, views: totalViews(d.pageviews) };
  });
  const maxLog = Math.log10(Math.max(10, ...rows.map((r) => r.views + 1)));
  const maxLen = Math.max(1, ...candidates.map((c) => c.length || 0));
  return rows.map(({ c, image, views }) => ({
    id: `wiki-${c.pageid}`,
    name: c.title,
    lat: c.coordinates[0].lat,
    lon: c.coordinates[0].lon,
    kind: c.kind,
    description: c.description || null,
    image,
    url: c.fullurl || `https://en.wikipedia.org/?curid=${c.pageid}`,
    popularity: Math.round((views > 0 ? Math.log10(views + 1) / maxLog : (c.length || 0) / maxLen) * 100) / 100,
    source: 'wikipedia',
  }));
}

export function createWikipedia({ contact = '' } = {}) {
  const headers = { 'User-Agent': `ProtoTrip/0.1 (trip planner; ${contact || 'local development'})` };
  const get = (params) => fetchJson('wikipedia', `${API}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '1', ...params })}`, { headers });

  return {
    id: 'wikipedia',
    async nearby({ lat, lon }) {
      const body = await get({
        generator: 'geosearch',
        ggscoord: `${lat.toFixed(5)}|${lon.toFixed(5)}`,
        ggsradius: String(RADIUS_M),
        ggslimit: String(CANDIDATES),
        prop: 'coordinates|description|info',
        inprop: 'url',
        colimit: 'max',
      });
      const candidates = pickCandidates(body);
      if (candidates.length === 0) return [];
      const detailsBody = await get({
        pageids: candidates.map((c) => c.pageid).join('|'),
        prop: 'pageviews|pageimages',
        pvipdays: '30',
        piprop: 'thumbnail',
        pithumbsize: '480',
        pilimit: 'max',
      }).catch(() => null); // details are a nice-to-have; fall back to article length
      return normalizeWikipedia(candidates, detailsBody);
    },
  };
}
