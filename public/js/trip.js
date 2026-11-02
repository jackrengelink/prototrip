// Trip view. Step 1 (on open): the flight, weather, alternatives and compare links.
// Step 2 (only when clicked): "What to do here?" loads sights, food and the day-by-day plan.

import { h, extLink, money, fmtDate, fmtDuration, stopsLabel } from './dom.js';
import { dealBadge, compareLinks, trainLabel, dealLine, priceNumbers, priceSplit } from './board.js';
import { costPanel } from './cost-panel.js';
import { fareCalendar } from './fare-calendar.js';
import { copyButton } from './share.js';
import { costBreakdown, shareMessage } from './costs.js';
import { shortTripPath } from './shortlink.js';
import { formatDay } from './dates.js';

const KIND_LABEL = { sight: 'Sight', museum: 'Museum', nature: 'Outdoors', activity: 'Do', food: 'Eat', nightlife: 'Drinks', shopping: 'Market & shops', flight: 'Travel' };

function boardingPass({ label, from, to, date, time, flight, bookUrl, showPrice }) {
  return h('article', { class: 'pass' },
    h('div', { class: 'pass-main' },
      h('span', { class: 'pass-label' }, label),
      h('div', { class: 'pass-route' }, h('span', { class: 'pass-code' }, from), h('span', { class: 'pass-line', 'aria-hidden': 'true' }), h('span', { class: 'pass-code' }, to)),
      h('div', { class: 'pass-meta' },
        h('span', {}, 'Date ', h('b', {}, fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))),
        time ? h('span', {}, 'Departs ', h('b', {}, time)) : null,
        flight.airline ? h('span', {}, 'Airline ', h('b', {}, flight.airline)) : null,
        h('span', {}, h('b', {}, stopsLabel(flight.transfers))),
        flight.durationMin && showPrice ? h('span', {}, 'Flight ', h('b', {}, fmtDuration(flight.durationMin))) : null,
        showPrice && flight.arrival?.time ? h('span', {}, 'Lands ', h('b', {}, `${flight.arrival.time}${flight.arrival.estimated ? ' (est.)' : ''}`)) : null,
      ),
      showPrice && trainLabel(flight) ? h('span', { class: 'pass-train' }, `${trainLabel(flight)} to ${from}. Leave ~${Math.round(flight.travelMin / 60 + 2)}h before take-off.`) : null,
      showPrice && flight.deal ? h('span', { class: 'dim' }, dealLine(flight)) : null,
    ),
    showPrice
      ? h('div', { class: 'pass-stub' },
        h('span', { class: 'big-price' }, priceNumbers(flight)),
        h('span', { class: 'dim' }, `${flight.returnDate ? 'return' : 'one way'}, per person`),
        priceSplit(flight) ? h('span', { class: 'price-split' }, priceSplit(flight)) : null,
        dealBadge(flight),
        extLink(bookUrl, { class: 'btn-primary' }, flight.mixed ? `Book ticket 1 (${money(flight.outPrice, flight.currency)})` : flight.live ? 'Book this fare' : 'Check this fare'),
        h('small', {}, flight.sourceLabel))
      : flight.mixed
        ? h('div', { class: 'pass-stub' },
          h('span', {}, 'Second ticket'),
          extLink(bookUrl, { class: 'btn-primary' }, `Book ticket 2 (${money(flight.backPrice, flight.currency)})`))
        : h('div', { class: 'pass-stub' }, h('span', {}, 'Included in the'), h('b', {}, 'return fare')),
  );
}

function weatherStrip(weather) {
  if (!weather?.length) return null;
  const typical = weather[0].typical;
  return h('div', {},
    h('div', { class: 'weather' }, weather.map((w) =>
      h('div', { class: 'wx' }, fmtDate(w.date, { weekday: 'short', day: 'numeric' }),
        h('strong', {}, w.high === null ? '–' : `${w.high}° / ${w.low}°`), w.summary))),
    h('p', { class: 'wx-note' }, typical ? 'Too far out for a forecast, so this is last year\'s weather on these dates (°C).' : 'Forecast in °C from Open-Meteo.'));
}

function stop(item) {
  const p = item.place;
  const title = p?.url ? extLink(p.url, {}, item.title) : item.title;
  const meta = [p?.price, p?.hours].filter(Boolean).join(' · ');
  return [
    item.travel ? h('div', { class: 'stop' }, h('span'), h('div', { class: 'travel' }, `↓ ${item.travel.minutes} min ${item.travel.mode === 'walk' ? 'walk' : 'by transit / taxi'} · ${item.travel.km} km`)) : null,
    h('div', { class: 'stop', 'data-kind': item.kind },
      h('div', { class: 'stop-time' }, item.time, h('small', {}, item.slot)),
      h('div', { class: 'stop-card' },
        h('div', {},
          h('span', { class: 'stop-kind' }, KIND_LABEL[item.kind] || item.kind),
          h('h4', {}, title),
          (p?.description || item.description) ? h('p', {}, p?.description || item.description) : null,
          meta ? h('p', { class: 'stop-meta' }, meta) : null),
        p?.image ? h('img', { class: 'stop-img', src: p.image, alt: '', loading: 'lazy', width: 86, height: 64 }) : null)),
  ];
}

function dayBlock(day) {
  return h('section', { class: 'day', 'aria-labelledby': `day-${day.dayNumber}` },
    h('header', { class: 'day-head' },
      h('span', { class: 'day-num' }, String(day.dayNumber).padStart(2, '0')),
      h('h3', { class: 'day-title', id: `day-${day.dayNumber}` }, day.title),
      h('span', { class: 'day-date' }, fmtDate(day.date))),
    day.items.map(stop));
}

function experience(x) {
  const meta = [
    x.fromPrice ? `from ${money(x.fromPrice, x.currency)}` : null,
    x.rating ? `★ ${x.rating.toFixed(1)} (${x.reviews})` : null,
    x.duration,
  ].filter(Boolean).join(' · ');
  return h('li', {}, extLink(x.url, { class: 'xp' },
    x.image ? h('img', { src: x.image, alt: '', loading: 'lazy', width: 64, height: 64 }) : h('span'),
    h('div', {}, h('b', {}, x.title), h('span', {}, meta))));
}

function flightPanels(trip, onSwitchOffer) {
  const alts = trip.alternatives?.length
    ? h('div', { class: 'panel' }, h('h3', {}, 'Other flights'),
      h('ul', {}, trip.alternatives.map((o) => h('li', { class: 'alt-row' },
        h('span', {}, `${o.origin} · ${fmtDate(o.departDate, { month: 'short', day: 'numeric' })} ${o.departTime || ''} · ${o.airline}`),
        h('button', { class: 'btn-ghost', type: 'button', onClick: () => onSwitchOffer(o) }, money(o.price, o.currency))))))
    : null;
  return [h('div', { class: 'panel' }, h('h3', {}, 'Compare this trip'), compareLinks(trip.compare, '')), alts];
}

/** The way out, and the way home on a return. For two tickets the way home has its own airports. */
function calendarLegs(f) {
  const out = { id: 'out', label: 'Way out', from: f.origin, to: f.destination, date: f.departDate };
  if (!f.returnDate) return [out];
  return [out, { id: 'home', label: 'Way home', from: f.returnFrom || f.destination, to: f.returnTo || f.origin, date: f.returnDate }];
}

/** The cost panel and copy button share one group size, so a copied message has the latest total. */
function tripExtras(ctx, panel, message) {
  let people = ctx.people;
  const onPeople = (n) => {
    people = n;
    ctx.onPeople(n);
  };
  return {
    cost: costPanel({ ...panel, people, onPeople }),
    share: copyButton(() => {
      const { total } = costBreakdown({ ticket: panel.ticket, travel: panel.travel, people });
      const url = `${location.origin}${shortTripPath({ ...message.link, people })}`;
      return shareMessage({ ...message, price: money(panel.ticket, panel.currency), travel: panel.travel ? money(panel.travel, panel.currency) : null, url, people, total: money(total, panel.currency) });
    }),
  };
}

/** A copied message only brags about good deals. */
const dealWorthSharing = (offer) => (['crazy', 'great'].includes(offer.deal?.tier) ? offer.deal.label : null);

const whenLabel = (startDate, endDate, isReturn) => (isReturn ? `${formatDay(startDate)} to ${formatDay(endDate)}` : formatDay(startDate));

/** Renders the "what to do" results into its section. */
export function renderExplore(root, data) {
  const counts = data.placeCounts || {};
  const found = [['sight', 'sights'], ['museum', 'museums'], ['food', 'places to eat'], ['nightlife', 'bars'], ['activity', 'things to do']]
    .filter(([k]) => counts[k]).map(([k, label]) => `${counts[k]} ${label}`).join(' · ');
  const extras = data.itinerary.extras?.length
    ? h('div', { class: 'panel' }, h('h3', {}, 'If you have extra time'),
      h('ul', {}, data.itinerary.extras.map((p) => h('li', {}, extLink(p.url, {}, p.name), p.description ? h('div', { class: 'dim' }, p.description) : null))))
    : null;
  const xp = data.experiences?.length
    ? h('div', { class: 'panel' }, h('h3', {}, 'Bookable experiences'), h('ul', {}, data.experiences.slice(0, 6).map(experience)))
    : null;
  root.replaceChildren(...[
    h('header', { class: 'explore-head' },
      h('h2', {}, `Your days in ${data.destination?.name || 'town'}`),
      found ? h('p', { class: 'dim' }, `Found ${found} (Wikipedia + Wikivoyage).`) : null),
    data.warnings?.length ? h('div', { class: 'notice' }, data.warnings.join(' · ')) : null,
    h('div', { class: 'trip-layout' },
      h('div', {}, data.itinerary.days.map(dayBlock)),
      h('aside', { class: 'trip-aside' }, xp, extras)),
  ].filter(Boolean));
}

/**
 * @param {HTMLElement} root
 * @param {object} trip  response of /api/trip
 * @param {{onBack:Function, onSwitchOffer:Function, onExplore:(target:HTMLElement, trip:object)=>void}} ctx
 */
export function renderTrip(root, trip, ctx) {
  const f = trip.flight;
  const name = trip.destination.name;
  const exploreRoot = h('section', { class: 'explore', id: 'explore' });
  exploreRoot.append(
    h('button', { class: 'btn-explore', type: 'button', onClick: (e) => { e.currentTarget.disabled = true; ctx.onExplore(exploreRoot, trip); } },
      h('span', { class: 'ring', 'aria-hidden': 'true' }),
      h('span', {}, h('b', {}, `What to do in ${name}?`), h('small', {}, 'Sights, food, drinks and a day-by-day plan for your dates'))));

  const extras = f ? tripExtras(ctx,
    { costs: trip.costs, ticket: f.price, ticketLabel: f.returnDate ? 'Flights' : 'Flight', travel: f.travelEur || 0, airline: f.airline, currency: f.currency },
    {
      name,
      deal: dealWorthSharing(f),
      from: `${f.originName || f.origin}${f.mixed ? `, back to ${f.returnTo}` : ''}`,
      when: whenLabel(f.departDate, f.returnDate, Boolean(f.returnDate)),
      link: { from: f.origin, to: f.destination, returnTo: f.mixed ? f.returnTo : null, depart: f.departDate, ret: f.returnDate },
    }) : null;

  const hero = h('header', { class: 'trip-hero' },
    h('div', {},
      h('div', { class: 'trip-actions' }, h('button', { class: 'btn-ghost back', type: 'button', onClick: ctx.onBack }, '← All deals'), extras?.share.button),
      extras?.share.fallback,
      h('p', { class: 'trip-kicker' }, [trip.destination.country, f?.distanceKm ? `${f.distanceKm.toLocaleString('en')} km from ${f.origin}` : null].filter(Boolean).join(' · ')),
      h('h2', { class: 'trip-title' }, name),
      h('p', { class: 'trip-dates' }, `${fmtDate(trip.stay.startDate)} → ${fmtDate(trip.stay.endDate)}`)),
    weatherStrip(trip.weather));

  const outbound = f ? boardingPass({ label: 'Outbound', from: f.origin, to: f.destination, date: f.departDate, time: f.departTime, flight: f, bookUrl: f.bookingUrl, showPrice: true }) : null;
  const inbound = f?.returnDate ? boardingPass({ label: 'Flight home', from: f.returnFrom || f.destination, to: f.returnTo || f.origin, date: f.returnDate, time: f.returnTime || (f.returnTimeAssumed ? '~17:00 (assumed)' : null), flight: f, bookUrl: f.returnBookingUrl, showPrice: false }) : null;

  root.replaceChildren(...[
    hero,
    trip.demoFares ? h('div', { class: 'notice' }, 'These fares are simulated (demo mode): Ryanair could not be reached and no other fare source is set up.') : null,
    trip.warnings?.length ? h('div', { class: 'notice' }, trip.warnings.join(' · ')) : null,
    f?.mixed ? h('div', { class: 'notice' }, `These are 2 separate tickets, so book both. If the first flight is late or cancelled, the second ticket isn't changed for you.`) : null,
    f ? null : h('div', { class: 'notice', 'data-kind': 'error' }, 'No flights found for these dates any more.'),
    h('div', { class: 'trip-layout' },
      h('div', {}, f?.coords?.destination ? h('div', { class: 'route-map', role: 'img', 'aria-label': `Route from Enschede via ${f.origin} to ${name}` }) : null, outbound, inbound,
        f ? fareCalendar(calendarLegs(f), ctx.onMoveDates) : null),
      h('aside', { class: 'trip-aside' }, extras?.cost, flightPanels(trip, ctx.onSwitchOffer))),
    exploreRoot,
  ].filter(Boolean));
}

/* ---------- Bus & train trips ---------- */

const modeLabel = (modes = []) => (modes.includes('train') && modes.includes('bus') ? 'Bus + train' : modes.includes('train') ? 'Train' : 'Bus');

function connection(c, { best = false } = {}) {
  return h('li', { class: `conn${best ? ' is-best' : ''}` },
    h('span', { class: 'mode-pill' }, modeLabel(c.modes)),
    h('span', {},
      h('b', {}, `${c.departTime} → ${c.arriveTime}`),
      ` · ${fmtDate(c.departDate, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtDuration(c.durationMin)} · ${c.transfers ? `${c.transfers} change${c.transfers > 1 ? 's' : ''}` : 'direct'}`),
    h('span', { class: 'conn-price' }, money(c.price)));
}

function legCard(label, best, options) {
  if (!best) return h('article', { class: 'panel' }, h('h3', {}, label), h('p', { class: 'dim' }, 'No connections found on this day.'));
  return h('article', { class: 'panel' },
    h('span', { class: 'pass-label' }, label),
    h('h3', {}, `${best.departTime} → ${best.arriveTime} · ${money(best.price)}`),
    h('ul', { class: 'conn-list' }, options.map((c) => connection(c, { best: c.id === best.id }))));
}

/**
 * @param {HTMLElement} root
 * @param {object} trip response of /api/ground-trip
 * @param {{onBack:Function, onExplore:(target:HTMLElement, trip:object)=>void}} ctx
 */
export function renderGroundTrip(root, trip, ctx) {
  const o = trip.offer;
  const name = trip.destination.name;
  const exploreRoot = h('section', { class: 'explore', id: 'explore' });
  exploreRoot.append(
    h('button', { class: 'btn-explore', type: 'button', onClick: (e) => { e.currentTarget.disabled = true; ctx.onExplore(exploreRoot, trip); } },
      h('span', { class: 'ring', 'aria-hidden': 'true' }),
      h('span', {}, h('b', {}, `What to do in ${name}?`), h('small', {}, 'Sights, food, drinks and a day-by-day plan for your dates'))));

  const extras = o ? tripExtras(ctx,
    { costs: trip.costs, ticket: o.price, ticketLabel: 'Bus or train', airline: o.airline, currency: o.currency || 'EUR' },
    {
      icon: '🚌',
      name,
      deal: dealWorthSharing(o),
      from: 'Enschede',
      when: whenLabel(trip.stay.startDate, trip.stay.endDate, Boolean(o.returnDate)),
      link: { mode: 'ground', cityId: ctx.current().trip, depart: ctx.current().tripDepart, ret: ctx.current().tripReturn },
    }) : null;

  const hero = h('header', { class: 'trip-hero' },
    h('div', {},
      h('div', { class: 'trip-actions' }, h('button', { class: 'btn-ghost back', type: 'button', onClick: ctx.onBack }, '← All deals'), extras?.share.button),
      extras?.share.fallback,
      h('p', { class: 'trip-kicker' }, [trip.destination.country, o?.distanceKm ? `${o.distanceKm.toLocaleString('en')} km from Enschede` : null, 'by bus & train'].filter(Boolean).join(' · ')),
      h('h2', { class: 'trip-title' }, name),
      h('p', { class: 'trip-dates' }, `${fmtDate(trip.stay.startDate)} → ${fmtDate(trip.stay.endDate)}`)),
    weatherStrip(trip.weather));

  const total = o
    ? h('article', { class: 'pass' },
      h('div', { class: 'pass-main' },
        h('span', { class: 'pass-label' }, 'Enschede ⇄ ' + name),
        h('div', { class: 'pass-route' }, h('span', { class: 'pass-code' }, 'ENS'), h('span', { class: 'pass-line', 'aria-hidden': 'true' }), h('span', { class: 'pass-code' }, name.slice(0, 3).toUpperCase())),
        h('span', { class: 'dim' }, dealLine(o)),
        h('span', { class: 'dim' }, "ProtoTrip's sweet spot is €50–70 return per person.")),
      h('div', { class: 'pass-stub' },
        h('span', { class: 'big-price' }, money(o.price)),
        h('span', { class: 'dim' }, o.returnDate ? 'return, per person' : 'one way, per person'),
        dealBadge(o),
        extLink(trip.compare.find((c) => c.id === 'flixbus')?.url, { class: 'btn-primary' }, 'Book on FlixBus'),
        h('small', {}, 'FlixBus / FlixTrain (live)')))
    : null;

  root.replaceChildren(...[
    hero,
    trip.warnings?.length ? h('div', { class: 'notice' }, trip.warnings.join(' · ')) : null,
    h('div', { class: 'trip-layout' },
      h('div', {},
        h('div', { class: 'route-map', role: 'img', 'aria-label': `Route from Enschede to ${name}` }),
        total,
        legCard('Outbound', trip.outbound, trip.outboundOptions),
        trip.inbound || trip.inboundOptions?.length ? legCard('Way back', trip.inbound, trip.inboundOptions) : null),
      h('aside', { class: 'trip-aside' },
        extras?.cost,
        h('div', { class: 'panel' }, h('h3', {}, 'Compare bus & train'), compareLinks(trip.compare, '')))),
    exploreRoot,
  ].filter(Boolean));
}
