// Itinerary builder.
//
// 1. Rank places by popularity, the traveller's interests and ratings.
// 2. Work out how many sightseeing slots each day has. Arrival and departure days are shorter.
// 3. Split the top sights into one geographic cluster per day, so each day stays in one area.
// 4. Order each day as a nearest-neighbour walking route.
// 5. Fill meal and evening slots with the closest good restaurant or bar.

import { haversineKm, centroid } from './geo.js';

export const INTERESTS = Object.freeze(['history', 'art', 'food', 'nature', 'nightlife', 'shopping']);
const KINDS_FOR_INTEREST = { history: ['sight'], art: ['museum'], food: ['food'], nature: ['nature', 'activity'], nightlife: ['nightlife'], shopping: ['shopping'] };
const SIGHT_KINDS = new Set(['sight', 'museum', 'nature', 'shopping', 'activity']);

const ARRIVAL_BUFFER_MIN = 120; // landing, passport control, hotel check-in
const DEPARTURE_BUFFER_MIN = 210; // get to the airport ~2.5h before, plus travel
const WALK_KMH = 4.5;
const TRANSIT_KMH = 18;
const WALKABLE_KM = 2.2;
const MIN_ANCHOR_SPACING_KM = 1.2;
// Headline sights (Sagrada Familia, Colosseum) belong in every plan, whatever the interests.
const MUST_SEE_POPULARITY = 0.75;
const MUST_SEE_BONUS = 1.5;
const INTEREST_BONUS = 1;

const DAY_TEMPLATE = Object.freeze([
  { time: '09:30', slot: 'Morning', type: 'sight' },
  { time: '12:30', slot: 'Lunch', type: 'meal' },
  { time: '14:30', slot: 'Afternoon', type: 'sight' },
  { time: '16:45', slot: 'Late afternoon', type: 'sight' },
  { time: '19:30', slot: 'Evening', type: 'evening' },
]);

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};
export const fromMinutes = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** Score and sort places. Returns new objects with a `score` field. */
export function rankPlaces(places, interests = []) {
  const wanted = new Set(interests.flatMap((i) => KINDS_FOR_INTEREST[i] || []));
  return places
    .map((p) => {
      const popularity = Number.isFinite(p.popularity) ? p.popularity : 0.3;
      const mustSee = popularity >= MUST_SEE_POPULARITY ? MUST_SEE_BONUS : 0;
      const interestBonus = wanted.has(p.kind) ? INTEREST_BONUS : 0;
      const ratingBonus = Number.isFinite(p.rating) ? (p.rating - 3.5) / 1.5 : 0;
      return { ...p, score: popularity * 4 + mustSee + interestBonus + ratingBonus };
    })
    .sort((a, b) => b.score - a.score);
}

/** List ISO dates from start to end inclusive. */
export function dateRange(startIso, endIso) {
  const out = [];
  const end = new Date(`${endIso}T00:00:00Z`);
  for (let d = new Date(`${startIso}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Which template slots fit on a given day, given flight times. */
export function slotsForDay({ isFirst, isLast, arrivalTime, departureTime }) {
  const earliest = isFirst && arrivalTime ? toMinutes(arrivalTime) + ARRIVAL_BUFFER_MIN : 0;
  const latest = isLast && departureTime ? toMinutes(departureTime) - DEPARTURE_BUFFER_MIN : 24 * 60;
  return DAY_TEMPLATE.filter((s) => toMinutes(s.time) >= earliest && toMinutes(s.time) <= latest);
}

/**
 * Pick k day "anchors". Points arrive best-first, so each anchor is the best remaining sight
 * that is at least MIN_ANCHOR_SPACING_KM from the others. That way each day is built around
 * a headline sight. If there aren't enough spread-out sights, fall back to farthest-point picks.
 */
function pickAnchors(points, k) {
  const anchors = [];
  for (const p of points) {
    if (anchors.length >= k) break;
    if (anchors.every((a) => haversineKm(a, p) >= MIN_ANCHOR_SPACING_KM)) anchors.push(p);
  }
  while (anchors.length < Math.min(k, points.length)) {
    const next = points
      .filter((p) => !anchors.includes(p))
      .reduce((best, p) => {
        const dist = Math.min(...anchors.map((a) => haversineKm(a, p)));
        return dist > best.dist ? { p, dist } : best;
      }, { p: null, dist: -1 });
    anchors.push(next.p);
  }
  return anchors;
}

/**
 * Split points into geographic groups with fixed sizes (one per day).
 * Points should be ordered best-first. The best anchors go to the roomiest days,
 * earliest first, so headline sights land on full days rather than the travel days.
 * Points with the strongest preference for one group are placed first.
 * @param {{lat:number, lon:number}[]} points
 * @param {number[]} capacities  how many points each group can take
 * @returns {Array<Array>} groups, same order as capacities
 */
export function clusterIntoDays(points, capacities) {
  const active = capacities
    .map((c, i) => ({ i, c }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c || a.i - b.i);
  const anchors = pickAnchors(points, active.length);
  const groups = capacities.map(() => []);
  const remaining = new Map(active.map((x) => [x.i, x.c]));

  const prefs = points.map((p) => {
    const ranked = anchors.map((s, si) => ({ day: active[si].i, dist: haversineKm(s, p) })).sort((a, b) => a.dist - b.dist);
    const regret = anchors.includes(p) ? Infinity : ranked.length > 1 ? ranked[1].dist - ranked[0].dist : 0;
    return { p, ranked, regret };
  });
  prefs.sort((a, b) => b.regret - a.regret);

  for (const { p, ranked } of prefs) {
    const choice = ranked.find((r) => remaining.get(r.day) > 0);
    if (!choice) break;
    groups[choice.day].push(p);
    remaining.set(choice.day, remaining.get(choice.day) - 1);
  }
  return groups;
}

/** Nearest-neighbour walking order, starting at the point farthest from the group's centre. */
export function orderRoute(points) {
  if (points.length < 3) return [...points];
  const center = centroid(points);
  const pool = [...points];
  const startIdx = pool.reduce((bi, p, i) => (haversineKm(p, center) > haversineKm(pool[bi], center) ? i : bi), 0);
  const route = pool.splice(startIdx, 1);
  while (pool.length) {
    const last = route[route.length - 1];
    const ni = pool.reduce((bi, p, i) => (haversineKm(last, p) < haversineKm(last, pool[bi]) ? i : bi), 0);
    route.push(...pool.splice(ni, 1));
  }
  return route;
}

/** How to get between two stops. */
export function travelBetween(a, b) {
  if (!a || !b) return null;
  const km = haversineKm(a, b);
  const walk = km <= WALKABLE_KM;
  const minutes = Math.max(3, Math.round((km / (walk ? WALK_KMH : TRANSIT_KMH)) * 60 + (walk ? 0 : 10)));
  return { km: Math.round(km * 10) / 10, mode: walk ? 'walk' : 'transit', minutes };
}

/** Closest unused place of the given kinds to an anchor point. */
function nearestOfKinds(pool, used, kinds, anchor) {
  const candidates = pool.filter((p) => kinds.includes(p.kind) && !used.has(p.id));
  if (candidates.length === 0) return null;
  if (!anchor) return candidates[0];
  // Balance distance against quality: a great spot 600m further away still wins.
  return candidates.reduce((best, p) =>
    haversineKm(anchor, p) - p.score * 0.3 < haversineKm(anchor, best) - best.score * 0.3 ? p : best);
}

function mealItem(slotDef, place, fallbackArea) {
  if (place) return { time: slotDef.time, slot: slotDef.slot, kind: place.kind, title: place.name, place };
  const what = slotDef.type === 'meal' ? 'Lunch' : 'Dinner';
  return {
    time: slotDef.time,
    slot: slotDef.slot,
    kind: 'food',
    title: `${what} near ${fallbackArea || 'your last stop'}`,
    description: 'Walk a couple of streets away from the main sights. Prices drop and quality goes up.',
    place: null,
  };
}

function flightItems(day, { isFirst, isLast, arrivalTime, departureTime, destinationName }) {
  const before = [];
  const after = [];
  if (isFirst && arrivalTime) {
    before.push({ time: arrivalTime, slot: 'Arrive', kind: 'flight', title: `Land in ${destinationName}`, description: 'Get through the airport, transfer into town and drop your bags.' });
  }
  if (isLast && departureTime) {
    const leave = fromMinutes(Math.max(0, toMinutes(departureTime) - 180));
    after.push({ time: leave, slot: 'Depart', kind: 'flight', title: 'Head to the airport', description: `Your flight home leaves at ${departureTime}.` });
  }
  return { before, after };
}

/** Lay out one day's items (sights in route order, meals and evening matched by proximity). */
function buildDay({ slots, sights, foodPool, used, wantsNightlife }) {
  const route = orderRoute(sights);
  const items = [];
  let sightIdx = 0;
  let lastPoint = null;
  for (const slotDef of slots) {
    if (slotDef.type === 'sight') {
      const place = route[sightIdx++];
      if (!place) continue;
      items.push({ time: slotDef.time, slot: slotDef.slot, kind: place.kind, title: place.name, place, travel: travelBetween(lastPoint, place) });
      lastPoint = place;
      continue;
    }
    const kinds = slotDef.type === 'evening' && wantsNightlife ? ['nightlife', 'food'] : ['food'];
    const anchor = lastPoint || route[0] || null;
    const place = nearestOfKinds(foodPool, used, kinds, anchor);
    if (place) used.add(place.id);
    items.push({ ...mealItem(slotDef, place, (lastPoint || route[0])?.name), travel: place ? travelBetween(lastPoint, place) : null });
    if (place) lastPoint = place;
  }
  return items;
}

/**
 * Build a day-by-day plan.
 * @param {object} opts
 * @param {object[]} opts.places normalised places {id,name,lat,lon,kind,popularity?,rating?}
 * @param {string} opts.startDate ISO date of arrival
 * @param {string} opts.endDate ISO date of departure (or last day for one-way trips)
 * @param {string} [opts.arrivalTime] HH:MM local, first day
 * @param {string} [opts.departureTime] HH:MM local, last day
 * @param {string[]} [opts.interests]
 * @param {string} [opts.destinationName]
 */
export function buildItinerary({ places, startDate, endDate, arrivalTime = null, departureTime = null, interests = [], destinationName = '' }) {
  const ranked = rankPlaces(places, interests);
  const dates = dateRange(startDate, endDate);
  const isLastDay = (i) => i === dates.length - 1 && Boolean(departureTime);
  const daySlots = dates.map((_, i) => slotsForDay({ isFirst: i === 0, isLast: isLastDay(i), arrivalTime, departureTime }));
  const capacities = daySlots.map((s) => s.filter((x) => x.type === 'sight').length);
  const totalSights = capacities.reduce((a, b) => a + b, 0);

  const sights = ranked.filter((p) => SIGHT_KINDS.has(p.kind)).slice(0, totalSights);
  const foodPool = ranked.filter((p) => p.kind === 'food' || p.kind === 'nightlife');
  const groups = clusterIntoDays(sights, capacities);
  const used = new Set();
  const wantsNightlife = interests.includes('nightlife');

  const days = dates.map((date, i) => {
    const isFirst = i === 0;
    const isLast = isLastDay(i);
    const { before, after } = flightItems(date, { isFirst, isLast, arrivalTime, departureTime, destinationName });
    const items = buildDay({ slots: daySlots[i], sights: groups[i], foodPool, used, wantsNightlife });
    const highlight = [...groups[i]].sort((a, b) => b.score - a.score)[0];
    return {
      date,
      dayNumber: i + 1,
      title: highlight ? `Around ${highlight.name}` : isLast ? 'Travel day' : 'Free time to explore',
      items: [...before, ...items, ...after],
    };
  });

  const usedSightIds = new Set(sights.map((s) => s.id));
  const extras = ranked.filter((p) => SIGHT_KINDS.has(p.kind) && !usedSightIds.has(p.id)).slice(0, 8);
  return { days, extras };
}
