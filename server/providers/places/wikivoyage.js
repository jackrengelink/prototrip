// Wikivoyage: the free travel guide. City articles list places to See, Do, Eat, Drink and Buy,
// with coordinates and prices, written for travellers. No key. Big cities (Rome, Paris) split
// their listings over district articles, which we fetch too.

import { fetchJson } from '../../lib/http.js';
import { haversineKm } from '../../lib/geo.js';

const API = 'https://en.wikivoyage.org/w/api.php';
const MAX_DISTRICTS = 8;
const MAX_KM_FROM_CENTRE = 35;
const LISTING_RE = /\{\{\s*(see|do|eat|drink|buy|sleep|listing)\s*\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/gi;
const DISTRICT_RE = /region\d+name\s*=\s*\[\[([^\]|#]+)/g;

const MUSEUM_RE = /\b(museum|gallery|galleria|pinacoteca|exhibition)\b/i;
const NATURE_RE = /\b(park|garden|beach|hike|hiking|trail|lake|mountain|viewpoint|nature|botanical|island|cove)\b/i;
const NIGHT_RE = /\b(club|nightclub|disco|cocktail|pub|bar)\b/i;

/** Strip wiki markup from a listing field: [[links|text]], '''bold''', <tags>, {{templates}}. */
export function cleanWikiText(s) {
  return String(s || '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s([^\]]+)\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split "a=1 | b=[[x|y]] | c={{t|u}}" on top-level pipes only. */
function splitFields(body) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if ((two === '}}' || two === ']]') && depth > 0) { depth--; cur += two; i++; continue; }
    if (body[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  parts.push(cur);
  const fields = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return fields;
}

function kindFor(type, name, content) {
  const text = `${name} ${content}`;
  if (type === 'eat') return 'food';
  if (type === 'drink') return 'nightlife';
  if (type === 'buy') return 'shopping';
  if (type === 'sleep') return null;
  if (MUSEUM_RE.test(text)) return 'museum';
  if (NATURE_RE.test(text)) return 'nature';
  if (type === 'do' && NIGHT_RE.test(name)) return 'nightlife';
  return type === 'do' ? 'activity' : 'sight';
}

/** Parse every listing template in an article's wikitext. Only listings with coordinates are kept. */
export function parseListings(wikitext, sourceTitle = '') {
  const out = [];
  for (const m of String(wikitext || '').matchAll(LISTING_RE)) {
    const type = m[1].toLowerCase() === 'listing' ? 'see' : m[1].toLowerCase();
    const f = splitFields(m[2]);
    const name = cleanWikiText(f.name);
    const lat = Number(f.lat);
    const lon = Number(f.long ?? f.lon);
    const content = cleanWikiText(f.content);
    const kind = kindFor(type, name, content);
    if (!name || !kind || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    out.push({
      id: `wv-${sourceTitle}-${name}`.replace(/[^\w-]+/g, '_').slice(0, 120),
      name,
      lat,
      lon,
      kind,
      description: content ? content.slice(0, 220) : null,
      price: cleanWikiText(f.price) || null,
      hours: cleanWikiText(f.hours) || null,
      url: /^https:\/\//.test(f.url || '') ? f.url : null,
      popularity: type === 'see' ? 0.4 : 0.3,
      source: 'wikivoyage',
    });
  }
  return out;
}

export function districtTitles(wikitext) {
  return [...String(wikitext || '').matchAll(DISTRICT_RE)].map((m) => m[1].trim()).slice(0, MAX_DISTRICTS);
}

export function createWikivoyage({ contact = '', fetcher = fetchJson } = {}) {
  const headers = { 'User-Agent': `ProtoTrip/0.2 (student trip planner; ${contact || 'local development'})` };

  async function pages(titles) {
    const qs = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'revisions', rvprop: 'content', rvslots: 'main',
      redirects: '1', titles: titles.join('|'),
    });
    const body = await fetcher('wikivoyage', `${API}?${qs}`, { headers, timeoutMs: 15_000 });
    return (body?.query?.pages || []).filter((p) => !p.missing).map((p) => ({ title: p.title, text: p.revisions?.[0]?.slots?.main?.content || '' }));
  }

  return {
    id: 'wikivoyage',
    /** Listings for a city, kept within reach of the centre (guards against same-name places). */
    async nearby(center, { cityName } = {}) {
      if (!cityName) return [];
      const [main] = await pages([cityName]);
      if (!main) return [];
      const districts = districtTitles(main.text);
      const extra = districts.length ? await pages(districts) : [];
      return [main, ...extra]
        .flatMap((p) => parseListings(p.text, p.title))
        .filter((p) => haversineKm(p, center) <= MAX_KM_FROM_CENTRE);
    },
  };
}
