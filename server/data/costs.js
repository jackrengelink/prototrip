// Rough extra costs for the trip page: a cabin bag and a day on the ground. These are estimates, never fares.

// Daily backpacker budget in US dollars, from the Europe Backpacker Index 2025 (priceoftravel.com):
// a cheap hostel bunk, two public transport rides, three budget meals, one attraction and three cheap drinks.
const BACKPACKER_INDEX = [
  ['Kyiv', 'UA', 36.32], ['Sofia', 'BG', 38.85], ['Bucharest', 'RO', 39.85], ['Budapest', 'HU', 41.02],
  ['Sarajevo', 'BA', 46.91], ['Zagreb', 'HR', 48.52], ['Cesky Krumlov', 'CZ', 48.94], ['Belgrade', 'RS', 49.58],
  ['Krakow', 'PL', 51.49], ['Riga', 'LV', 53.27], ['Warsaw', 'PL', 54.96], ['Bratislava', 'SK', 56.02],
  ['Vilnius', 'LT', 61.04], ['Tallinn', 'EE', 62.81], ['Istanbul', 'TR', 65.01], ['Naples', 'IT', 65.21],
  ['Tenerife', 'ES', 65.31], ['Ljubljana', 'SI', 67.08], ['Split', 'HR', 67.71], ['Prague', 'CZ', 68.43],
  ['Valletta', 'MT', 69.27], ['Athens', 'GR', 72.08], ['Lisbon', 'PT', 74.94], ['Madrid', 'ES', 82.51],
  ['Santorini', 'GR', 82.6], ['Berlin', 'DE', 82.81], ['Bruges', 'BE', 85.31], ['Nice', 'FR', 87.6],
  ['Stockholm', 'SE', 88.88], ['Munich', 'DE', 89.06], ['Hamburg', 'DE', 89.16], ['Barcelona', 'ES', 90.99],
  ['Dubrovnik', 'HR', 92.29], ['Helsinki', 'FI', 92.38], ['Luxembourg', 'LU', 92.5], ['Vienna', 'AT', 93.15],
  ['Amsterdam', 'NL', 94.68], ['Copenhagen', 'DK', 95.1], ['Brussels', 'BE', 95.52], ['Dublin', 'IE', 98.54],
  ['Salzburg', 'AT', 98.6], ['Ibiza', 'ES', 98.75], ['Milan', 'IT', 99.9], ['Edinburgh', 'GB', 101.49],
  ['Rome', 'IT', 104.43], ['Paris', 'FR', 109.28], ['Bergen', 'NO', 111.54], ['Oslo', 'NO', 115.24],
  ['Florence', 'IT', 115.83], ['Reykjavik', 'IS', 116.74], ['London', 'GB', 125.73], ['Venice', 'IT', 126.31],
  ['Interlaken', 'CH', 128.58], ['Zurich', 'CH', 163.94],
];
const USD_TO_EUR = 0.88;
const ROUND_TO_EUR = 5;
const LOCAL_NAMES = {
  praha: 'prague', kiev: 'kyiv', wien: 'vienna', munchen: 'munich', roma: 'rome', milano: 'milan', venezia: 'venice',
  firenze: 'florence', napoli: 'naples', lisboa: 'lisbon', brugge: 'bruges', bucuresti: 'bucharest', warszawa: 'warsaw',
};

// A 10 kg cabin bag, per flight, for the airlines whose cheapest fare only covers a small under-seat bag.
// Mid-points of what travel guides report: prices move with route and date, and sources disagree.
const CABIN_BAG_EUR = { ryanair: 20, 'wizz air': 25, easyjet: 30, transavia: 25 };

const DAY_MS = 86_400_000;
const plain = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const toEur = (usd) => Math.round((usd * USD_TO_EUR) / ROUND_TO_EUR) * ROUND_TO_EUR;

function cityIn(name) {
  const known = plain(name);
  const words = known.split(/[\s,/-]+/);
  const key = LOCAL_NAMES[known] || LOCAL_NAMES[words[0]] || known;
  return BACKPACKER_INDEX.find(([city]) => plain(city) === key || words.includes(plain(city))) || null;
}

/** Roughly what a day costs: the city's own number, or the average of its country's cities. */
export function dailyBudget(place) {
  if (!place) return null;
  const city = cityIn(place.name);
  if (city) return { eur: toEur(city[2]), basis: 'city', place: city[0] };
  const peers = BACKPACKER_INDEX.filter(([, country]) => country === place.country);
  if (peers.length === 0) return null;
  const average = peers.reduce((sum, [, , usd]) => sum + usd, 0) / peers.length;
  return { eur: toEur(average), basis: 'country', place: peers.length === 1 ? peers[0][0] : null };
}

/** Estimated price of a cabin bag on one flight, or null when we don't know the airline to charge for it. */
export function bagPerFlight(airline) {
  const name = plain(airline);
  const known = Object.keys(CABIN_BAG_EUR).find((key) => name.includes(key));
  return known ? CABIN_BAG_EUR[known] : null;
}

/** The numbers behind the "what it really costs" panel on the trip page. */
export function tripCosts({ airline, returnDate, stay, place }) {
  return {
    bagPerFlight: bagPerFlight(airline),
    flights: returnDate ? 2 : 1,
    nights: Math.max(0, Math.round((Date.parse(stay.endDate) - Date.parse(stay.startDate)) / DAY_MS)),
    daily: dailyBudget(place),
  };
}
