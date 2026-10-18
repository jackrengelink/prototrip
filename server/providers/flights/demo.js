// Demo flight engine: realistic-looking, deterministic fares so the app works with no API keys.
// Everything it returns is marked `live: false` and labelled as simulated in the UI.

import { findAirport, destinationCities } from '../../data/airports.js';
import { haversineKm } from '../../lib/geo.js';
import { modelFare } from '../../lib/deals.js';
import { comparisonLinks } from '../../lib/links.js';

const FULL_SERVICE = ['KLM', 'Lufthansa', 'Delta', 'United', 'British Airways', 'Air France', 'ITA Airways', 'Iberia', 'TAP Air Portugal', 'Turkish Airlines', 'Emirates', 'Qatar Airways', 'Singapore Airlines', 'ANA', 'Cathay Pacific'];
const BUDGET_BY_REGION = {
  americas: ['Spirit', 'JetBlue', 'Frontier', 'Southwest', 'Volaris'],
  europe: ['Ryanair', 'easyJet', 'Wizz Air', 'Transavia', 'Vueling', 'Eurowings'],
  other: ['AirAsia', 'Scoot', 'flydubai', 'IndiGo', 'Jetstar'],
};
const AMERICAS = new Set(['US', 'CA', 'MX', 'CR', 'CO', 'PE', 'BR', 'AR']);
const EUROPE = new Set(['GB', 'IE', 'IS', 'FR', 'NL', 'BE', 'DE', 'CH', 'AT', 'CZ', 'HU', 'PL', 'DK', 'SE', 'NO', 'FI', 'IT', 'ES', 'PT', 'GR', 'HR', 'TR', 'MA', 'MT', 'LV', 'LT', 'EE', 'BG', 'RO', 'RS', 'AL', 'SI']);
const budgetFor = (country) => BUDGET_BY_REGION[AMERICAS.has(country) ? 'americas' : EUROPE.has(country) ? 'europe' : 'other'];
const SHORT_HAUL_KM = 2500;
const CRUISE_KMH = 820;
// Chance that one airport-to-city route has a sale or error fare right now. Searching ~10 home
// airports means roughly 1 in 4 destinations shows a crazy deal somewhere: rare enough to mean something.
const ROUTE_DEAL_CHANCE = 0.03;
const MIN_FARE = 39; // Ryanair-style floor in EUR

/** FNV-1a string hash -> 32-bit seed */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: same seed, same sequence. */
export function seededRandom(seedStr) {
  let a = hash(seedStr);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seasonFactor(isoDate) {
  const [, m, d] = isoDate.split('-').map(Number);
  if (m >= 6 && m <= 8) return 1.22;
  if (m === 12 && d >= 15) return 1.3;
  if (m === 1 || m === 2 || m === 11) return 0.85;
  return 1;
}

const addMinutes = (hhmm, mins) => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function makeOffer({ from, to, departDate, returnDate, rand, index, isDeal }) {
  const km = haversineKm(from, to);
  const shortHaul = km < SHORT_HAUL_KM;
  const transfers = km > 7500 ? (rand() < 0.75 ? 1 : 0) : km > 3000 ? (rand() < 0.45 ? 1 : 0) : 0;
  const carriers = shortHaul && rand() < 0.6 ? budgetFor(from.country) : FULL_SERVICE;
  const airline = carriers[Math.floor(rand() * carriers.length)];
  const noise = 0.82 + rand() * 0.5;
  const dealCut = isDeal ? 0.45 + rand() * 0.2 : 1;
  const nonstopPremium = transfers === 0 && km > 3000 ? 1.12 : 1;
  const base = modelFare(km, { roundTrip: Boolean(returnDate) });
  const season = seasonFactor(departDate);
  const price = Math.max(MIN_FARE, Math.round(base * noise * dealCut * nonstopPremium * season));
  // Plays the role of Google's "typical price" insight, so deal scores match across screens.
  const typicalRange = [Math.round(base * season * 0.85), Math.round(base * season * 1.15)];

  const durationMin = Math.round((km / CRUISE_KMH) * 60 + 35 + transfers * (70 + rand() * 120));
  const depHour = 6 + Math.floor(rand() * 16);
  const departTime = `${String(depHour).padStart(2, '0')}:${rand() < 0.5 ? '05' : '40'}`;
  const tzShiftMin = Math.round((to.lon - from.lon) / 15) * 60;
  const arriveTime = addMinutes(departTime, durationMin + tzShiftMin);
  const returnTime = returnDate ? `${String(8 + Math.floor(rand() * 13)).padStart(2, '0')}:${rand() < 0.5 ? '15' : '50'}` : null;

  return {
    id: `demo-${from.iata}-${to.iata}-${departDate}-${index}`,
    source: 'demo',
    sourceLabel: 'Demo fares',
    live: false,
    origin: from.iata,
    destination: to.iata,
    destinationCity: to.city,
    destinationName: to.name,
    departDate,
    departTime,
    arriveTime,
    returnDate,
    returnTime,
    price,
    currency: 'EUR',
    airline,
    transfers,
    durationMin,
    typicalRange,
    bookingUrl: comparisonLinks({ origin: from.iata, destination: to.iata, departDate, returnDate })[0].url,
  };
}

const OFFERS_PER_ROUTE = 8;

/** Same route + dates always gives the same fares, so "Anywhere" and route views agree. */
function routeOffers(from, to, departDate, returnDate) {
  const rand = seededRandom(`${from.iata}-${to.city}-${departDate}-${returnDate}`);
  const dealIndex = rand() < ROUTE_DEAL_CHANCE ? Math.floor(rand() * OFFERS_PER_ROUTE) : -1;
  return Array.from({ length: OFFERS_PER_ROUTE }, (_, i) => makeOffer({ from, to, departDate, returnDate, rand, index: i, isDeal: i === dealIndex }));
}

export function createDemoFlights() {
  return {
    id: 'demo',
    async searchRoute({ origin, destination, departDate, returnDate }) {
      const from = findAirport(origin);
      const to = findAirport(destination);
      if (!from || !to || from.city === to.city) return [];
      return routeOffers(from, to, departDate, returnDate);
    },
    async searchAnywhere({ origin, departDate, returnDate }) {
      const from = findAirport(origin);
      if (!from) return [];
      return destinationCities()
        .filter((to) => to.city !== from.city)
        .map((to) => routeOffers(from, to, departDate, returnDate).reduce((a, b) => (a.price <= b.price ? a : b)));
    },
  };
}
