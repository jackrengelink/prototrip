// Curated list of major airports. `city` is the Travelpayouts/IATA metro code,
// which groups airports like LHR/LGW/STN under LON.
// Fields: iata, name (city), country, city code, lat, lon
const RAW = [
  ['JFK', 'New York', 'US', 'NYC', 40.6413, -73.7781],
  ['EWR', 'Newark', 'US', 'NYC', 40.6895, -74.1745],
  ['BOS', 'Boston', 'US', 'BOS', 42.3656, -71.0096],
  ['IAD', 'Washington', 'US', 'WAS', 38.9531, -77.4565],
  ['ATL', 'Atlanta', 'US', 'ATL', 33.6407, -84.4277],
  ['MIA', 'Miami', 'US', 'MIA', 25.7959, -80.287],
  ['MCO', 'Orlando', 'US', 'ORL', 28.4312, -81.3081],
  ['ORD', 'Chicago', 'US', 'CHI', 41.9742, -87.9073],
  ['DFW', 'Dallas', 'US', 'DFW', 32.8998, -97.0403],
  ['DEN', 'Denver', 'US', 'DEN', 39.8561, -104.6737],
  ['LAS', 'Las Vegas', 'US', 'LAS', 36.084, -115.1537],
  ['LAX', 'Los Angeles', 'US', 'LAX', 33.9416, -118.4085],
  ['SFO', 'San Francisco', 'US', 'SFO', 37.6213, -122.379],
  ['SEA', 'Seattle', 'US', 'SEA', 47.4502, -122.3088],
  ['HNL', 'Honolulu', 'US', 'HNL', 21.3245, -157.925],
  ['YYZ', 'Toronto', 'CA', 'YTO', 43.6777, -79.6248],
  ['YVR', 'Vancouver', 'CA', 'YVR', 49.1967, -123.1815],
  ['MEX', 'Mexico City', 'MX', 'MEX', 19.4361, -99.0719],
  ['CUN', 'Cancun', 'MX', 'CUN', 21.0365, -86.8771],
  ['SJO', 'San Jose', 'CR', 'SJO', 9.9939, -84.2088],
  ['BOG', 'Bogota', 'CO', 'BOG', 4.7016, -74.1469],
  ['LIM', 'Lima', 'PE', 'LIM', -12.0219, -77.1143],
  ['GRU', 'Sao Paulo', 'BR', 'SAO', -23.4356, -46.4731],
  ['GIG', 'Rio de Janeiro', 'BR', 'RIO', -22.81, -43.2506],
  ['EZE', 'Buenos Aires', 'AR', 'BUE', -34.8222, -58.5358],
  ['LHR', 'London', 'GB', 'LON', 51.47, -0.4543],
  ['LGW', 'London', 'GB', 'LON', 51.1537, -0.1821],
  ['STN', 'London', 'GB', 'LON', 51.885, 0.235],
  ['MAN', 'Manchester', 'GB', 'MAN', 53.3537, -2.275],
  ['EDI', 'Edinburgh', 'GB', 'EDI', 55.95, -3.3725],
  ['DUB', 'Dublin', 'IE', 'DUB', 53.4264, -6.2499],
  ['KEF', 'Reykjavik', 'IS', 'REK', 63.985, -22.6056],
  ['CDG', 'Paris', 'FR', 'PAR', 49.0097, 2.5479],
  ['ORY', 'Paris', 'FR', 'PAR', 48.7262, 2.3652],
  ['NCE', 'Nice', 'FR', 'NCE', 43.6584, 7.2159],
  ['AMS', 'Amsterdam', 'NL', 'AMS', 52.3105, 4.7683],
  ['EIN', 'Eindhoven', 'NL', 'EIN', 51.4501, 5.3745],
  ['RTM', 'Rotterdam', 'NL', 'RTM', 51.9569, 4.4372],
  ['GRQ', 'Groningen', 'NL', 'GRQ', 53.1197, 6.5794],
  ['MST', 'Maastricht', 'NL', 'MST', 50.9117, 5.7701],
  ['FMO', 'Münster/Osnabrück', 'DE', 'FMO', 52.1346, 7.6848],
  ['DUS', 'Düsseldorf', 'DE', 'DUS', 51.2895, 6.7668],
  ['NRN', 'Weeze', 'DE', 'NRN', 51.6024, 6.1422],
  ['CGN', 'Cologne', 'DE', 'CGN', 50.8659, 7.1427],
  ['CRL', 'Charleroi', 'BE', 'CRL', 50.4592, 4.4538],
  ['BRU', 'Brussels', 'BE', 'BRU', 50.901, 4.4844],
  ['FRA', 'Frankfurt', 'DE', 'FRA', 50.0379, 8.5622],
  ['MUC', 'Munich', 'DE', 'MUC', 48.3537, 11.775],
  ['BER', 'Berlin', 'DE', 'BER', 52.3667, 13.5033],
  ['ZRH', 'Zurich', 'CH', 'ZRH', 47.4582, 8.5555],
  ['VIE', 'Vienna', 'AT', 'VIE', 48.1103, 16.5697],
  ['PRG', 'Prague', 'CZ', 'PRG', 50.1008, 14.26],
  ['BUD', 'Budapest', 'HU', 'BUD', 47.4369, 19.2556],
  ['WAW', 'Warsaw', 'PL', 'WAW', 52.1657, 20.9671],
  ['KRK', 'Krakow', 'PL', 'KRK', 50.0777, 19.7848],
  ['CPH', 'Copenhagen', 'DK', 'CPH', 55.618, 12.656],
  ['ARN', 'Stockholm', 'SE', 'STO', 59.6498, 17.9238],
  ['OSL', 'Oslo', 'NO', 'OSL', 60.1976, 11.1004],
  ['HEL', 'Helsinki', 'FI', 'HEL', 60.3172, 24.9633],
  ['FCO', 'Rome', 'IT', 'ROM', 41.8003, 12.2389],
  ['CIA', 'Rome', 'IT', 'ROM', 41.7994, 12.5949],
  ['MXP', 'Milan', 'IT', 'MIL', 45.6306, 8.7281],
  ['VCE', 'Venice', 'IT', 'VCE', 45.5053, 12.3519],
  ['FLR', 'Florence', 'IT', 'FLR', 43.81, 11.2051],
  ['NAP', 'Naples', 'IT', 'NAP', 40.886, 14.2908],
  ['BCN', 'Barcelona', 'ES', 'BCN', 41.2974, 2.0833],
  ['MAD', 'Madrid', 'ES', 'MAD', 40.4983, -3.5676],
  ['AGP', 'Malaga', 'ES', 'AGP', 36.6749, -4.4991],
  ['PMI', 'Palma de Mallorca', 'ES', 'PMI', 39.5517, 2.7388],
  ['LIS', 'Lisbon', 'PT', 'LIS', 38.7742, -9.1342],
  ['OPO', 'Porto', 'PT', 'OPO', 41.2481, -8.6814],
  ['ATH', 'Athens', 'GR', 'ATH', 37.9364, 23.9445],
  ['SKG', 'Thessaloniki', 'GR', 'SKG', 40.5197, 22.9709],
  ['SVQ', 'Seville', 'ES', 'SVQ', 37.418, -5.8931],
  ['VLC', 'Valencia', 'ES', 'VLC', 39.4893, -0.4816],
  ['TFS', 'Tenerife', 'ES', 'TCI', 28.0445, -16.5725],
  ['FAO', 'Faro', 'PT', 'FAO', 37.0144, -7.9659],
  ['BLQ', 'Bologna', 'IT', 'BLQ', 44.5354, 11.2887],
  ['PSA', 'Pisa', 'IT', 'PSA', 43.6839, 10.3927],
  ['CTA', 'Catania', 'IT', 'CTA', 37.4668, 15.0664],
  ['MLA', 'Malta', 'MT', 'MLA', 35.8575, 14.4775],
  ['RIX', 'Riga', 'LV', 'RIX', 56.9236, 23.9711],
  ['VNO', 'Vilnius', 'LT', 'VNO', 54.6341, 25.2858],
  ['TLL', 'Tallinn', 'EE', 'TLL', 59.4133, 24.8328],
  ['GDN', 'Gdansk', 'PL', 'GDN', 54.3776, 18.4662],
  ['SOF', 'Sofia', 'BG', 'SOF', 42.6952, 23.4062],
  ['OTP', 'Bucharest', 'RO', 'BUH', 44.5711, 26.085],
  ['BEG', 'Belgrade', 'RS', 'BEG', 44.8184, 20.3091],
  ['TIA', 'Tirana', 'AL', 'TIA', 41.4147, 19.7206],
  ['LJU', 'Ljubljana', 'SI', 'LJU', 46.2237, 14.4576],
  ['DBV', 'Dubrovnik', 'HR', 'DBV', 42.5614, 18.2682],
  ['SPU', 'Split', 'HR', 'SPU', 43.5389, 16.298],
  ['IST', 'Istanbul', 'TR', 'IST', 41.2753, 28.7519],
  ['RAK', 'Marrakech', 'MA', 'RAK', 31.6069, -8.0363],
  ['CAI', 'Cairo', 'EG', 'CAI', 30.1219, 31.4056],
  ['TLV', 'Tel Aviv', 'IL', 'TLV', 32.0055, 34.8854],
  ['DXB', 'Dubai', 'AE', 'DXB', 25.2532, 55.3657],
  ['DOH', 'Doha', 'QA', 'DOH', 25.2731, 51.608],
  ['NBO', 'Nairobi', 'KE', 'NBO', -1.3192, 36.9278],
  ['CPT', 'Cape Town', 'ZA', 'CPT', -33.9715, 18.6021],
  ['DEL', 'Delhi', 'IN', 'DEL', 28.5562, 77.1],
  ['BOM', 'Mumbai', 'IN', 'BOM', 19.0896, 72.8656],
  ['BKK', 'Bangkok', 'TH', 'BKK', 13.69, 100.7501],
  ['HKT', 'Phuket', 'TH', 'HKT', 8.1132, 98.3169],
  ['SIN', 'Singapore', 'SG', 'SIN', 1.3644, 103.9915],
  ['KUL', 'Kuala Lumpur', 'MY', 'KUL', 2.7456, 101.7099],
  ['DPS', 'Bali', 'ID', 'DPS', -8.7482, 115.1675],
  ['HAN', 'Hanoi', 'VN', 'HAN', 21.2212, 105.807],
  ['SGN', 'Ho Chi Minh City', 'VN', 'SGN', 10.8188, 106.652],
  ['HKG', 'Hong Kong', 'HK', 'HKG', 22.308, 113.9185],
  ['TPE', 'Taipei', 'TW', 'TPE', 25.0797, 121.2342],
  ['MNL', 'Manila', 'PH', 'MNL', 14.5086, 121.0194],
  ['ICN', 'Seoul', 'KR', 'SEL', 37.4602, 126.4407],
  ['NRT', 'Tokyo', 'JP', 'TYO', 35.772, 140.3929],
  ['HND', 'Tokyo', 'JP', 'TYO', 35.5494, 139.7798],
  ['KIX', 'Osaka', 'JP', 'OSA', 34.4347, 135.244],
  ['SYD', 'Sydney', 'AU', 'SYD', -33.9399, 151.1753],
  ['MEL', 'Melbourne', 'AU', 'MEL', -37.669, 144.841],
  ['AKL', 'Auckland', 'NZ', 'AKL', -37.0082, 174.785],
];

export const AIRPORTS = Object.freeze(
  RAW.map(([iata, name, country, city, lat, lon]) =>
    Object.freeze({ iata, name, country, city, lat, lon }),
  ),
);

// Home base: Enschede (University of Twente). Airports within reach by public transport, with a rough
// door-to-gate time (minutes) and a rough return ticket from Enschede (EUR, off-peak / cheapest usual
// option). These are estimates, not timetables, but they make a "cheap" flight from Charleroi honest.
//   group: nl = Dutch airports · near = + German border airports · all = + Belgium
export const HOME = Object.freeze({ code: 'NL', name: 'Netherlands & nearby', city: 'Enschede', lat: 52.2215, lon: 6.8937 });
export const HOME_AIRPORTS = Object.freeze([
  { iata: 'AMS', travelMin: 135, travelEur: 40, group: 'nl' },
  { iata: 'FMO', travelMin: 95, travelEur: 35, group: 'near' },
  { iata: 'DUS', travelMin: 150, travelEur: 40, group: 'near' },
  { iata: 'EIN', travelMin: 165, travelEur: 45, group: 'nl' },
  { iata: 'NRN', travelMin: 170, travelEur: 30, group: 'near' },
  { iata: 'RTM', travelMin: 170, travelEur: 45, group: 'nl' },
  { iata: 'GRQ', travelMin: 170, travelEur: 35, group: 'nl' },
  { iata: 'CGN', travelMin: 185, travelEur: 55, group: 'near' },
  { iata: 'BRU', travelMin: 230, travelEur: 70, group: 'all' },
  { iata: 'CRL', travelMin: 260, travelEur: 100, group: 'all' },
]);
export const AIRPORT_GROUPS = Object.freeze({ nl: ['nl'], near: ['nl', 'near'], all: ['nl', 'near', 'all'] });

/** Home airport codes for an airport choice: nl | near (default) | all. */
export function homeAirportCodes(choice = 'near') {
  const groups = AIRPORT_GROUPS[choice] || AIRPORT_GROUPS.near;
  return HOME_AIRPORTS.filter((a) => groups.includes(a.group)).map((a) => a.iata);
}

const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]));
const BY_CITY = new Map();
for (const a of AIRPORTS) {
  if (!BY_CITY.has(a.city)) BY_CITY.set(a.city, a);
}

/** Home airports with their details, closest first. */
export function homeAirports() {
  return HOME_AIRPORTS.map((h) => ({ ...BY_IATA.get(h.iata), travelMin: h.travelMin, travelEur: h.travelEur, group: h.group }));
}

const HOME_CODES = new Set(HOME_AIRPORTS.map((h) => h.iata));
export const isHomeAirport = (code) => HOME_CODES.has(String(code || '').toUpperCase());

// Extra airports/cities learned at runtime from the public airport directory (see directory.js),
// so destinations outside the curated list (Girona, Treviso, ...) still get names and coordinates.
const EXTRA = new Map();

/** Add airports or cities: [{ iata, name, country, city, lat, lon }]. Curated entries always win. */
export function registerAirports(list) {
  for (const a of list) {
    if (!a?.iata || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
    if (!BY_IATA.has(a.iata) && !EXTRA.has(a.iata)) EXTRA.set(a.iata, Object.freeze({ ...a }));
  }
}

/** Look up an airport by its own code or by its metro city code (e.g. ROM, LON). */
export function findAirport(code) {
  const key = String(code || '').toUpperCase();
  return BY_IATA.get(key) || BY_CITY.get(key) || EXTRA.get(key) || null;
}

/** One representative airport per destination city, for "Anywhere" searches. */
export function destinationCities() {
  return [...BY_CITY.values()].filter((a) => !HOME_CODES.has(a.iata));
}

/** Airport codes in a country: the ones already seen in fares first, then the major ones, then the rest. */
export function airportsInCountry(country, preferred = []) {
  const curated = AIRPORTS.filter((a) => a.country === country).map((a) => a.iata);
  const others = [...EXTRA.values()].filter((a) => a.country === country && a.kind === 'airport').map((a) => a.iata);
  const known = new Set([...curated, ...others]);
  return [...new Set([...preferred.filter((c) => known.has(c)), ...curated, ...others])];
}

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });
const COUNTRY_ALIASES = { uk: 'GB', england: 'GB', scotland: 'GB', 'great britain': 'GB', usa: 'US', america: 'US', 'united states of america': 'US', holland: 'NL', czech: 'CZ', czechia: 'CZ' };

/** English country name for a two-letter code. */
export function countryName(code) {
  try {
    return REGION_NAMES.of(String(code).toUpperCase());
  } catch {
    return String(code);
  }
}

/** Every country that has an airport we know, matched by name or a common alias. Best match first. */
export function searchCountries(query, limit = 3) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const codes = new Set([...AIRPORTS, ...EXTRA.values()].map((a) => a.country).filter((c) => /^[A-Z]{2}$/.test(c || '')));
  const alias = COUNTRY_ALIASES[q];
  return [...codes]
    .map((code) => {
      const name = countryName(code);
      const lower = name.toLowerCase();
      const exact = code === alias || lower === q;
      return { type: 'country', code, name, exact, rank: exact ? 3 : lower.startsWith(q) ? 2 : lower.includes(q) ? 1 : 0 };
    })
    .filter((c) => c.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ rank, ...c }) => c);
}

export function searchAirports(query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = AIRPORTS.map((a) => {
    const name = a.name.toLowerCase();
    let score = 0;
    if (a.iata.toLowerCase() === q || a.city.toLowerCase() === q) score = 3;
    else if (name.startsWith(q)) score = 2;
    else if (name.includes(q) || a.iata.toLowerCase().startsWith(q)) score = 1;
    return { a, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((s) => s.a);
}
