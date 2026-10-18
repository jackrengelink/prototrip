// Thin client for the ProtoTrip API. Every response is { success, data, error }.

export async function getJson(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  let res;
  try {
    res = await fetch(`${path}?${qs}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Could not reach the ProtoTrip server. Is it running?');
  }
  const body = await res.json().catch(() => null);
  if (!body?.success) throw new Error(body?.error || `Request failed (${res.status})`);
  return body.data;
}

const AIRPORT_CODE = /^[A-Za-z]{3}$/;
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
