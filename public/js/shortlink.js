// Short trip links like /t/ein-opo-270126-270131. No database: the link itself holds the trip,
// so it survives restarts. Built here in the browser, opened by the server. No DOM here.

const FLY_CODE = /^([a-z]{3})-([a-z]{3})(?:-([a-z]{3}))?-(\d{6})(?:-(\d{6}))?(?:-g(\d{1,2}))?$/;
const BUS_CODE = /^bus-([\w-]{22})-(\d{6})(?:-(\d{6}))?(?:-g(\d{1,2}))?$/;

const shortDate = (iso) => iso.slice(2).replace(/-/g, '');
const fullDate = (s) => `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4)}`;

function squeezeId(id) {
  const bytes = id.replace(/-/g, '').match(/../g).map((pair) => Number.parseInt(pair, 16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unsqueezeId(code) {
  const hex = [...atob(code.replace(/-/g, '+').replace(/_/g, '/'))].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

/** The short path for a trip on screen. */
export function shortTripPath({ mode, cityId, from, to, returnTo, depart, ret, people = 1 }) {
  const where = mode === 'ground' ? ['bus', squeezeId(cityId)] : [from, to, returnTo].filter(Boolean).map((c) => c.toLowerCase());
  const parts = [...where, shortDate(depart), ret ? shortDate(ret) : null, people > 1 ? `g${people}` : null];
  return `/t/${parts.filter(Boolean).join('-')}`;
}

const toUrl = (params) => `/?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined))}`;

function flyUrl([, from, to, home, depart, ret, group]) {
  const [origin, destination, returnTo] = [from, to, home].map((c) => c?.toUpperCase());
  const [departDate, returnDate] = [fullDate(depart), ret ? fullDate(ret) : ''];
  // Two tickets have to search every home airport to find the same pair again.
  return toUrl({
    origin: 'NL', destination, departDate, returnDate, airports: returnTo ? 'all' : 'near',
    trip: destination, tripFrom: returnTo ? null : origin, tripDepart: departDate, tripReturn: returnDate || null,
    offerId: returnTo ? `mix-${origin}-${destination}-${destination}-${returnTo}-${departDate}-${returnDate}` : null,
    group,
  });
}

function busUrl([, id, depart, ret, group]) {
  const [departDate, returnDate] = [fullDate(depart), ret ? fullDate(ret) : ''];
  return toUrl({ mode: 'ground', departDate, returnDate, trip: unsqueezeId(id), tripDepart: departDate, tripReturn: returnDate || null, group });
}

/** The full address for a short code, or null when it isn't one of ours. */
export function tripUrlFromCode(code) {
  const bus = BUS_CODE.exec(code);
  if (bus) return busUrl(bus);
  const fly = FLY_CODE.exec(code);
  if (!fly || (fly[3] && !fly[5])) return null; // Two tickets always have a way back
  return flyUrl(fly);
}
