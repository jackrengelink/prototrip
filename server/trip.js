// A trip has two steps:
//   planTrip    the chosen flight, alternatives, weather and compare links (fast, flight data only)
//   exploreTrip things to do and the day-by-day plan; only runs when someone clicks "What to do here?"

import { findAirport } from './data/airports.js';
import { tripCosts } from './data/costs.js';
import { buildItinerary, toMinutes, fromMinutes } from './lib/itinerary.js';
import { comparisonLinks } from './lib/links.js';

const ONE_WAY_STAY_DAYS = 4;
const DEFAULT_RETURN_TIME = '17:00';
const DAY_MS = 86_400_000;

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * Work out local arrival date/time. Uses the provider's value when present,
 * otherwise estimates from departure + duration + a longitude-based time-zone shift.
 */
export function estimateArrival(offer) {
  if (offer.arriveDate && offer.arriveTime) return { date: offer.arriveDate, time: offer.arriveTime, estimated: false };
  const dep = offer.departTime ? toMinutes(offer.departTime) : null;
  // Clock times alone can't tell "same day" from "next day" on long flights, so prefer duration math.
  if (offer.arriveTime && dep !== null && !offer.durationMin) {
    const nextDay = toMinutes(offer.arriveTime) < dep;
    return { date: addDays(offer.departDate, nextDay ? 1 : 0), time: offer.arriveTime, estimated: false };
  }
  if (dep === null || !offer.durationMin) return { date: offer.departDate, time: null, estimated: true };
  const from = findAirport(offer.origin);
  const to = findAirport(offer.destination) || findAirport(offer.destinationCity);
  const tzShift = from && to ? Math.round((to.lon - from.lon) / 15) * 60 : 0;
  const total = dep + offer.durationMin + tzShift;
  const dayOffset = Math.floor(total / 1440);
  return { date: addDays(offer.departDate, dayOffset), time: fromMinutes(((total % 1440) + 1440) % 1440), estimated: true };
}

/** Pick the flight the user chose (by id), or the best value one. */
export function chooseOffer(offers, offerId) {
  if (offers.length === 0) return null;
  const chosen = offerId && offers.find((o) => o.id === offerId);
  if (chosen) return chosen;
  // Best value: cheapest, but trade a little money for fewer stops. Two separate tickets only by choice.
  const plain = offers.some((o) => !o.mixed) ? offers.filter((o) => !o.mixed) : offers;
  return [...plain].sort((a, b) => a.price + a.transfers * 40 - (b.price + b.transfers * 40))[0];
}

/** City centre for a destination code (geocoded when possible, else the airport). */
async function destinationCentre(dest, weather) {
  if (!dest) return null;
  return (await weather.geocode(dest.name, dest.country).catch(() => null)) || { lat: dest.lat, lon: dest.lon };
}

const GROUND_COMPARE = (city, date) => [
  { id: 'flixbus', name: 'FlixBus', note: 'Bus + FlixTrain', url: null },
  { id: 'ns', name: 'NS International', note: 'Trains (ICE / Eurostar)', url: 'https://www.nsinternational.com/en' },
  { id: 'db', name: 'Deutsche Bahn', note: 'German trains, Sparpreis', url: 'https://int.bahn.de/en' },
  { id: 'omio', name: 'Omio', note: 'Compares bus + train', url: `https://www.omio.com/search?destination=${encodeURIComponent(city)}&departure_date=${date}` },
];

/** Bus & train trip: exact connections both ways, weather and the stay for "What to do". */
export async function planGroundTrip({ cityId, departDate, returnDate, ground, weather }) {
  const t = await ground.trip({ cityId, departDate, returnDate });
  if (!t) return null;
  const startDate = t.outbound?.arriveDate || departDate;
  const endDate = returnDate || addDays(startDate, ONE_WAY_STAY_DAYS);
  const center = { lat: t.city.lat, lon: t.city.lon };
  const stay = { startDate: startDate > endDate ? endDate : startDate, endDate, arrivalTime: t.outbound?.arriveTime || null, departureTime: t.inbound?.departTime || null };
  return {
    mode: 'ground',
    destination: { code: null, name: t.city.name, country: t.city.country, center },
    offer: t.offer,
    outbound: t.outbound,
    inbound: t.inbound,
    outboundOptions: t.outboundOptions,
    inboundOptions: t.inboundOptions,
    stay,
    costs: tripCosts({ airline: null, returnDate, stay, place: t.city }),
    weather: await weather.forecast(center, startDate > endDate ? endDate : startDate, endDate),
    compare: GROUND_COMPARE(t.city.name, departDate).map((c) => (c.id === 'flixbus' ? { ...c, url: t.bookingUrl } : c)),
    warnings: t.outbound ? [] : ['No connections found on these dates. Try other days.'],
  };
}

export async function planTrip({ query, offerId, flights, weather }) {
  const { offers, warnings, demo } = await flights.searchRoute(query, { offerId });
  const offer = chooseOffer(offers, offerId);
  const swapped = Boolean(offerId && offer && offer.id !== offerId);
  const dest = findAirport(offer?.destination) || findAirport(query.destination);
  const cityName = offer?.destinationName || dest?.name || query.destination;

  const arrival = offer ? estimateArrival(offer) : { date: query.departDate, time: null, estimated: true };
  const endDate = offer?.returnDate || query.returnDate || addDays(arrival.date, ONE_WAY_STAY_DAYS);
  const startDate = arrival.date > endDate ? endDate : arrival.date;
  const isReturn = Boolean(offer?.returnDate || query.returnDate);
  const departureTime = isReturn ? offer?.returnTime || DEFAULT_RETURN_TIME : null;
  const center = await destinationCentre(dest, weather);
  const stay = { startDate, endDate, arrivalTime: arrival.time, departureTime };

  return {
    destination: { code: offer?.destination || query.destination, name: cityName, country: dest?.country || null, center },
    flight: offer ? { ...offer, arrival, returnTimeAssumed: isReturn && !offer.returnTime } : null,
    stay,
    costs: tripCosts({ airline: offer?.airline, returnDate: offer?.returnDate || query.returnDate, stay, place: { name: cityName, country: dest?.country } }),
    alternatives: offers.filter((o) => o.id !== offer?.id && !o.mixed).slice(0, 6),
    demoFares: demo,
    weather: center ? await weather.forecast(center, startDate, endDate) : [],
    compare: comparisonLinks({
      origin: offer?.origin || query.origins[0],
      destination: offer?.destination || query.destination,
      departDate: offer?.departDate || query.departDate,
      returnDate: offer?.returnDate || query.returnDate,
    }),
    warnings: [...warnings, ...(swapped ? ['That exact flight is no longer listed, so this shows the best current fare'] : [])],
  };
}

/**
 * Things to do + day-by-day plan for a stay.
 * @param {{destination:string, startDate:string, endDate:string, arrivalTime:string|null, departureTime:string|null, interests:string[]}} stay
 */
export async function exploreTrip({ stay, places, weather }) {
  const dest = stay.place || findAirport(stay.destination);
  if (!dest) return { destination: null, itinerary: { days: [], extras: [] }, experiences: [], warnings: ['Unknown destination'] };
  const center = await destinationCentre(dest, weather);
  const [placeResult, experiences] = await Promise.all([
    places.nearby(center, { cityName: dest.name }),
    places.experiences({ cityName: dest.name, interests: stay.interests }),
  ]);
  const itinerary = buildItinerary({
    places: placeResult.places,
    startDate: stay.startDate,
    endDate: stay.endDate,
    arrivalTime: stay.arrivalTime,
    departureTime: stay.departureTime,
    interests: stay.interests,
    destinationName: dest.name,
  });
  const counts = placeResult.places.reduce((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] || 0) + 1 }), {});
  return {
    destination: { code: stay.destination || null, name: dest.name, country: dest.country, center },
    itinerary,
    experiences,
    placeCounts: counts,
    warnings: placeResult.warnings,
  };
}
