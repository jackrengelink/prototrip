// Thin client for the ProtoTrip API. Every response is { success, data, error }.

// While Render wakes the app (about a minute) it answers with its own loading page instead of data.
const WAKE_CHECKS = 18;
const WAKE_CHECK_MS = 5000;
let onWaking = () => {};

/** Called with true while the server is waking up, and false once it answers. */
export const setWakingHandler = (handler) => { onWaking = handler; };

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function fetchWhenAwake(url) {
  let waited = false;
  for (let check = 0; ; check += 1) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const asleep = res.ok && !res.headers.get('content-type')?.includes('json');
    if (!asleep || check >= WAKE_CHECKS) {
      if (waited) onWaking(false);
      return res;
    }
    waited = true;
    onWaking(true);
    await wait(WAKE_CHECK_MS);
  }
}

export async function getJson(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  let res;
  try {
    res = await fetchWhenAwake(`${path}?${qs}`);
  } catch {
    throw new Error('Could not reach the ProtoTrip server. Is it running?');
  }
  // Session expired on the online version: go to the login page.
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Please log in again.');
  }
  const body = await res.json().catch(() => null);
  if (!body?.success) throw new Error(body?.error || `Request failed (${res.status})`);
  return body.data;
}

const AIRPORT_CODE = /^[A-Za-z]{3}$/;
const COUNTRY_LABEL = /· all airports · ([A-Z]{2})$/;
const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

/** The ISO code in a "country:ES" destination, or null. */
export const countryOf = (destination) => /^country:([A-Z]{2})$/i.exec(destination || '')?.[1]?.toUpperCase() || null;
export const countryLabel = (code, name = REGION_NAMES.of(code)) => `${name} · all airports · ${code}`;
export const HOME_CODE = 'NL';
const HOME_WORDS = /^(nl|netherlands|holland|nederland|home|enschede|ut|twente)$/i;

/** Turn whatever the user typed ("Rome", "fco", "Rome · FCO", "Netherlands") into a code. */
export async function resolveCode(text) {
  const raw = String(text || '').trim();
  if (HOME_WORDS.test(raw) || raw.endsWith(`· ${HOME_CODE}`)) return HOME_CODE;
  const tagged = raw.match(/\b([A-Z]{3})\b\s*$/);
  if (tagged) return tagged[1];
  if (AIRPORT_CODE.test(raw)) return raw.toUpperCase();
  const matches = await getJson('/api/airports', { q: raw });
  if (matches.length === 0) throw new Error(`Couldn't find an airport for "${raw}". Try a 3-letter code like FCO.`);
  return matches[0].iata;
}

/** Like resolveCode, for the To field: a country ("Spain") becomes "country:ES". */
export async function resolveDestination(text) {
  const raw = String(text || '').trim();
  const labelled = raw.match(COUNTRY_LABEL);
  if (labelled) return `country:${labelled[1]}`;
  const tagged = raw.match(/\b([A-Z]{3})\b\s*$/);
  if (tagged) return tagged[1];
  const matches = await getJson('/api/airports', { q: raw, countries: '1' });
  const first = matches[0];
  if (first?.type === 'country' && first.exact) return `country:${first.code}`;
  if (AIRPORT_CODE.test(raw)) return raw.toUpperCase();
  // A partial word prefers a city ("Mala" is Málaga), then falls back to a country ("Slovak").
  const airport = matches.find((m) => m.iata);
  if (airport) return airport.iata;
  if (first?.type === 'country') return `country:${first.code}`;
  throw new Error(`Couldn't find "${raw}". Try a country, a city or a 3-letter airport code.`);
}
