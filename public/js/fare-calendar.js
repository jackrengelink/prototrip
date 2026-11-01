// Cheapest-day calendar on the trip page: Ryanair's lowest one-way fare per day, for the way out and the way home.
// Picking a day moves the trip there. The whole panel removes itself on routes Ryanair doesn't fly.

import { h, money } from './dom.js';
import { getJson } from './api.js';
import { monthOf, monthWeeks, shiftMonth, formatMonth, formatFullDay } from './dates.js';
import { pickFareTiers } from './fares.js';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const loadMonth = (leg, month) => getJson('/api/calendar', { origin: leg.from, destination: leg.to, month }).then((r) => r.days).catch(() => []);
const hasFares = (days) => days.some((d) => Number.isFinite(d.price));

/**
 * @param {{id:string,label:string,from:string,to:string,date:string}[]} legs way out, and way home on a return
 * @param {(legId:string, day:string)=>void} onPick
 */
export function fareCalendar(legs, onPick) {
  const panel = h('section', { class: 'panel fare-cal', 'aria-label': 'Cheapest days on this route', hidden: true });
  const today = new Date().toISOString().slice(0, 10);
  let leg = legs[0];
  let month = monthOf(leg.date);
  let days = [];

  function dayCell(day, byDate, tiers) {
    if (monthOf(day) !== month) return h('span', { class: 'fc-blank', 'aria-hidden': 'true' });
    const price = byDate.get(day)?.price;
    const chosen = day === leg.date;
    const canPick = Number.isFinite(price) && day >= today;
    return h('button', {
      type: 'button', class: `fc-day${chosen ? ' is-chosen' : ''}`, 'data-tier': tiers[day], disabled: !canPick,
      'aria-pressed': String(chosen), 'aria-label': `${formatFullDay(day)}${canPick ? `, ${money(price)}` : ', no fare'}`,
      onClick: () => onPick(leg.id, day),
    },
    h('span', { class: 'fc-num' }, String(Number(day.slice(8)))),
    h('span', { class: 'fc-price' }, canPick ? money(price) : '–'));
  }

  function draw() {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const tiers = pickFareTiers(days.filter((d) => d.date >= today));
    panel.replaceChildren(
      h('div', { class: 'fc-head' },
        h('h3', {}, 'Cheapest days'),
        legs.length > 1 ? h('div', { class: 'fc-tabs', role: 'group', 'aria-label': 'Which flight' }, legs.map((l) => h('button', {
          type: 'button', class: 'fc-tab', 'aria-pressed': String(l.id === leg.id), onClick: () => showLeg(l),
        }, l.label))) : null),
      h('div', { class: 'fc-nav' },
        h('button', { type: 'button', class: 'dp-arrow', 'aria-label': 'Earlier month', disabled: month <= monthOf(today), onClick: () => showMonth(shiftMonth(month, -1)) }, '‹'),
        h('b', {}, `${leg.from} to ${leg.to} · ${formatMonth(month)}`),
        h('button', { type: 'button', class: 'dp-arrow', 'aria-label': 'Later month', onClick: () => showMonth(shiftMonth(month, 1)) }, '›')),
      h('div', { class: 'fc-grid' },
        WEEKDAYS.map((d) => h('span', { class: 'dp-weekday', 'aria-hidden': 'true' }, d)),
        monthWeeks(month).flat().map((day) => dayCell(day, byDate, tiers))),
      h('p', { class: 'fc-note' }, hasFares(days) ? 'Ryanair one-way prices per person, without the train. Pick a day to move your trip there.' : 'No Ryanair flights on this route this month.'));
  }

  async function showMonth(next) {
    month = next;
    days = await loadMonth(leg, month);
    draw();
  }

  function showLeg(next) {
    leg = next;
    showMonth(monthOf(leg.date));
  }

  async function start() {
    const firstMonths = await Promise.all(legs.map((l) => loadMonth(l, monthOf(l.date))));
    if (!firstMonths.some(hasFares)) {
      panel.remove();
      return;
    }
    [days] = firstMonths;
    panel.hidden = false;
    draw();
  }

  start();
  return panel;
}
