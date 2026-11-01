// Results: a "crazy deals" spotlight on top, then the full departures board.

import { h, extLink, money, fmtDate, stopsLabel, fmtDuration } from './dom.js';

const SPOTLIGHT_MAX = 9;
const short = { month: 'short', day: 'numeric' };

const km = (n) => `${Math.round(n).toLocaleString('en')} km`;

const NORMAL_SOURCE = {
  'typical-range': 'usual price on this route',
  'previous-price': "Ryanair's earlier price",
  'route-median': 'other fares on this route',
  'city-median': 'other fares to this city from NL & nearby',
  'distance-typical': 'typical for this distance',
};

/** "−62% vs the usual price on this route (~€90)" or null when it isn't cheaper. */
export function discountLine(offer) {
  const d = offer.deal;
  if (!d || !(d.savingsPct > 0)) return null;
  return `−${d.savingsPct}% vs ${NORMAL_SOURCE[d.normalBasis] || 'normal'} (~${money(d.normalPrice, offer.currency)})`;
}

/** What you really pay: the flight plus the train/bus to the airport, or the bus/train ticket itself. */
export const totalOf = (offer) => offer.totalPrice ?? offer.price;

/** "€34 flight + ~€45 train to EIN" for flights from a home airport; null otherwise. */
export function priceSplit(offer) {
  if (offer.mode === 'ground') return offer.priceIsFrom ? 'from-price: cheapest seat each way' : null;
  if (!offer.travelEur) return null;
  return `${money(offer.price, offer.currency)} flight + ~${money(offer.travelEur, offer.currency)} train to ${offer.origin}`;
}

/** Both reasons in one sentence: price for the distance, and % off normal. */
export function dealLine(offer) {
  const d = offer.deal;
  if (!d) return '';
  const what = offer.mode === 'ground' ? 'by bus/train' : 'door to door';
  const base = `${money(totalOf(offer), offer.currency)} ${what} for ${km(offer.distanceKm)} (crazy is under ${money(d.crazyLine, offer.currency)} for this distance).`;
  const off = discountLine(offer);
  return off ? `${base} ${off}.` : base;
}

export function dealBadge(offer) {
  if (!offer?.deal) return null;
  return h('span', { class: 'badge', 'data-tier': offer.deal.tier, title: dealLine(offer) }, offer.deal.label);
}

export function compareLinks(links, label = 'Double-check on') {
  if (!links?.length) return null;
  return h('div', { class: 'compare' },
    label ? h('span', { class: 'compare-label' }, label) : null,
    links.map((l) => extLink(l.url, { class: 'btn-ghost', title: l.note }, l.name)));
}

/** "2h 15m by train from Enschede" style label for a home airport. */
export function trainLabel(offer) {
  if (!Number.isFinite(offer.travelMin)) return null;
  return `🚆 ${fmtDuration(offer.travelMin)} from Enschede`;
}

const originName = (offer, home) => (offer.mode === 'ground' ? 'Enschede' : home?.airports?.find((a) => a.iata === offer.origin)?.name || offer.origin);
const groundLabel = (o) => [o.airline, o.durationMin ? fmtDuration(o.durationMin) : null, o.transfers === 0 ? 'direct' : 'with a change'].filter(Boolean).join(' · ');
const whenLabel = (o) => (o.returnDate ? `${fmtDate(o.departDate, short)} – ${fmtDate(o.returnDate, short)}` : fmtDate(o.departDate));

/** Click anywhere on a card or row (except its buttons/links) to show that route on the map. */
function selectable(offer, ctx) {
  return {
    'data-offer-id': offer.id,
    tabindex: '0',
    onClick: (e) => { if (!e.target.closest('button, a')) ctx.onSelect?.(offer); },
    onKeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); ctx.onSelect?.(offer); } },
  };
}

/** Update which card/row looks selected, without re-rendering. */
export function markSelected(root, offerId) {
  for (const el of root.querySelectorAll('[data-offer-id]')) {
    el.classList.toggle('is-selected', el.dataset.offerId === offerId);
  }
}

function crazyCard(offer, index, ctx) {
  const { onPlan, home } = ctx;
  const title = offer.destinationName || offer.destination;
  return h('article', { class: 'crazy-card', style: `--i:${index}`, ...selectable(offer, ctx) },
    h('div', { class: 'crazy-inner' },
      h('div', { class: 'crazy-top' },
        h('h3', { class: 'crazy-city' }, title),
        offer.deal.savingsPct > 0 ? h('span', { class: 'crazy-save', title: discountLine(offer) }, `−${offer.deal.savingsPct}%`) : null),
      h('div', { class: 'crazy-price' }, offer.priceIsFrom ? h('small', {}, 'from ') : null, money(totalOf(offer), offer.currency), h('small', {}, offer.returnDate ? ' return' : ' one way')),
      priceSplit(offer) ? h('div', { class: 'price-split' }, priceSplit(offer)) : null,
      h('div', { class: 'crazy-why' },
        h('span', { class: 'why', 'data-on': String(offer.deal.reasons.includes('cheap-for-distance')) },
          `${km(offer.distanceKm)} · crazy under ${money(offer.deal.crazyLine, offer.currency)}`),
        discountLine(offer) ? h('span', { class: 'why', 'data-on': String(offer.deal.reasons.includes('big-discount')) }, discountLine(offer)) : null),
      offer.mode === 'ground'
        ? h('div', { class: 'crazy-meta' },
          h('span', {}, h('span', { class: 'mode-pill' }, offer.airline), ' from ', h('b', {}, 'Enschede')),
          h('span', {}, groundLabel(offer)),
          h('span', {}, whenLabel(offer)))
        : h('div', { class: 'crazy-meta' },
          h('span', {}, 'From ', h('b', {}, `${originName(offer, home)} (${offer.origin})`), ` · ${stopsLabel(offer.transfers)}`),
          h('span', {}, whenLabel(offer), offer.departTime ? ` · dep ${offer.departTime}` : ''),
          trainLabel(offer) ? h('span', {}, trainLabel(offer)) : null),
      h('div', {}, h('button', { class: 'btn-cyan', type: 'button', onClick: () => onPlan(offer) }, 'Plan this trip →'))));
}

function spotlight(crazy, ctx) {
  if (crazy.length === 0) return null;
  return h('section', { class: 'spotlight', 'aria-labelledby': 'crazy-heading' },
    h('header', { class: 'spotlight-head' },
      h('span', { class: 'ring', 'aria-hidden': 'true' }),
      h('h2', { id: 'crazy-heading' }, `${crazy.length} crazy deal${crazy.length > 1 ? 's' : ''}`),
      h('p', {}, ctx.mode === 'ground'
        ? "Crazy = cheap for the distance by bus or train (at most €50 return), or 45%+ off the usual price. ProtoTrip's sweet spot: €50–70."
        : 'Crazy = cheap door to door for the distance (under ~€69 to Barcelona, €123 to Tenerife, return, incl. the train to the airport) or 45%+ off the usual price.'),
      h('button', {
        class: 'btn-ghost only-crazy', type: 'button', 'aria-pressed': String(ctx.onlyCrazy),
        onClick: ctx.onToggleOnlyCrazy,
      }, ctx.onlyCrazy ? 'Show all fares' : 'Only crazy deals')),
    h('div', { class: 'crazy-grid' }, crazy.slice(0, SPOTLIGHT_MAX).map((o, i) => crazyCard(o, i, ctx))));
}

function row(offer, index, ctx) {
  const { anywhere, onPlan, home } = ctx;
  const saving = [offer.deal?.savingsPct > 0 ? `−${offer.deal.savingsPct}%` : null, offer.distanceKm ? km(offer.distanceKm) : null].filter(Boolean).join(' · ');
  return h('div', { class: 'board-row', style: `--i:${Math.min(index, 30)}`, role: 'row', 'data-tier': offer.deal?.tier, ...selectable(offer, ctx) },
    h('div', { class: 'c-dest dest', role: 'cell' },
      anywhere ? offer.destinationName : `${offer.departTime || '--:--'} → ${offer.destination}`,
      h('small', {}, offer.mode === 'ground' ? offer.country : anywhere ? offer.destination : offer.destinationName)),
    h('div', { class: 'c-from', role: 'cell' },
      h('span', { class: 'from' }, offer.mode === 'ground' ? 'Enschede' : offer.origin),
      h('small', {}, offer.mode === 'ground' ? offer.airline : Number.isFinite(offer.travelMin) ? `🚆 ${fmtDuration(offer.travelMin)} · ~${money(offer.travelEur || 0)}` : originName(offer, home))),
    h('div', { class: 'c-when', role: 'cell' }, whenLabel(offer), offer.departTime && anywhere ? h('small', {}, `dep ${offer.departTime}`) : null),
    h('div', { class: 'c-air dim', role: 'cell' }, offer.airline, h('small', {}, [stopsLabel(offer.transfers), offer.durationMin ? fmtDuration(offer.durationMin) : null].filter(Boolean).join(' · '))),
    h('div', { class: 'c-price price', role: 'cell' }, money(totalOf(offer), offer.currency),
      h('small', {}, offer.priceIsFrom ? 'from' : offer.travelEur ? `incl. ~${money(offer.travelEur)} train` : offer.live ? 'live' : offer.source === 'demo' ? 'demo' : 'recent')),
    h('div', { class: 'c-badge', role: 'cell' }, dealBadge(offer), saving ? h('small', {}, saving) : null),
    h('div', { class: 'c-plan', role: 'cell' },
      h('button', { class: 'btn-plan', type: 'button', onClick: () => onPlan(offer) }, 'Plan trip →')),
  );
}

function board(offers, data, ctx) {
  const title = ctx.mode === 'ground' ? 'Bus & train from Enschede'
    : data.country ? `Flights to ${data.country.name}`
      : ctx.anywhere ? `Departures from ${data.origin?.name || ''}` : `${offers.length} flights to ${offers[0]?.destinationName || 'your destination'}`;
  const subtitle = [
    data.country ? `${offers.length} routes to ${new Set(offers.map((o) => o.destination)).size} airports, best deals first`
      : ctx.anywhere ? `${offers.length} destinations, cheapest for the distance first` : 'Cheapest first',
    data.demo ? 'Demo fares: add API keys for real prices' : null,
  ].filter(Boolean).join(' · ');
  return h('div', { class: 'board', role: 'table', 'aria-label': title },
    h('div', { class: 'board-head' }, h('h2', {}, title), h('p', {}, subtitle)),
    h('div', { class: 'board-cols', role: 'row' },
      ['Destination', 'From', 'When', ctx.mode === 'ground' ? 'How' : 'Airline', ctx.mode === 'ground' ? 'Price' : 'Door to door', 'Deal', ''].map((c) => h('div', { role: 'columnheader' }, c))),
    offers.length
      ? offers.slice(0, ctx.limit || 80).map((o, i) => row(o, i, ctx))
      : h('p', { class: 'empty' }, 'No fares match. Try other dates, a bigger budget, or "Whole world".'),
    compareLinks(data.links));
}

/**
 * @param {HTMLElement} root
 * @param {{offers:object[], demo:boolean, origin:object, links:object[]|null}} data
 * @param {{anywhere:boolean, limit?:number, onlyCrazy:boolean, home:object, onPlan:Function, onToggleOnlyCrazy:Function}} ctx
 */
export function renderBoard(root, data, ctx) {
  const crazy = data.offers.filter((o) => o.deal?.tier === 'crazy');
  const rest = ctx.onlyCrazy ? [] : data.offers;
  const parts = [
    spotlight(crazy, ctx),
    ctx.onlyCrazy && crazy.length ? null : board(rest, data, ctx),
  ];
  root.replaceChildren(...parts.filter(Boolean));
}
