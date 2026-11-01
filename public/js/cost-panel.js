// "What it really costs" on the trip page: the ticket and train, plus an optional bag and stay, for the whole group.

import { h, money } from './dom.js';
import { costBreakdown, groupNote, clampPeople } from './costs.js';

const nightsLabel = (n) => `${n} night${n === 1 ? '' : 's'}`;

function budgetSource(daily) {
  const where = daily.basis === 'city' ? daily.place : daily.place ? `${daily.place}, the closest city with numbers` : 'other cities in this country';
  return `Hostel, food and local transport based on ${where} (Backpacker Index 2025).`;
}

function row(label, amount, { strong = false } = {}) {
  return h('div', { class: `cost-row${strong ? ' is-total' : ''}` }, h('span', {}, label), h('b', {}, amount));
}

function toggleRow(label, amount, checked, onChange) {
  return h('label', { class: 'cost-row cost-toggle' },
    h('span', {}, h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.currentTarget.checked) }), label),
    h('b', {}, amount));
}

/**
 * @param {{costs:object, ticket:number, ticketLabel:string, travel:number, airline:string, currency:string, people:number, onPeople:(n:number)=>void}} input
 */
export function costPanel({ costs, ticket, ticketLabel, travel = 0, airline, currency, people: startPeople, onPeople }) {
  const panel = h('section', { class: 'panel cost-panel', 'aria-label': 'What this trip really costs' });
  const eur = (n) => money(n, currency);
  let people = clampPeople(startPeople);
  let withBag = false;
  let withStay = false;

  function setPeople(next) {
    people = clampPeople(next);
    onPeople(people);
    draw();
  }

  const stepper = () => h('div', { class: 'cost-row cost-people' },
    h('span', { id: 'cost-people-label' }, 'People'),
    h('div', { class: 'stepper', role: 'group', 'aria-labelledby': 'cost-people-label' },
      h('button', { type: 'button', 'aria-label': 'One person less', disabled: people <= 1, onClick: () => setPeople(people - 1) }, '−'),
      h('input', {
        type: 'number', min: '1', max: '60', value: String(people), 'aria-label': 'Number of people', inputmode: 'numeric',
        onChange: (e) => setPeople(e.currentTarget.value),
      }),
      h('button', { type: 'button', 'aria-label': 'One person more', onClick: () => setPeople(people + 1) }, '+')));

  function draw() {
    const sum = costBreakdown({ ticket, travel, bagPerFlight: costs?.bagPerFlight, flights: costs?.flights, dayRate: costs?.daily?.eur, nights: costs?.nights, withBag, withStay, people });
    const canBag = Boolean(costs?.bagPerFlight);
    const canStay = Boolean(costs?.daily && costs.nights > 0);
    const note = groupNote({ people, airline });
    panel.replaceChildren(...[
      h('h3', {}, 'What it really costs'),
      row(ticketLabel, eur(ticket)),
      travel ? row('Train/bus to the airport', `~${eur(travel)}`) : null,
      canBag ? toggleRow(`10 kg cabin bag, ${costs.flights} flight${costs.flights > 1 ? 's' : ''}`, `~${eur(sum.bag)}`, withBag, (on) => { withBag = on; draw(); }) : null,
      canStay ? toggleRow(`Stay and food, ${nightsLabel(costs.nights)}`, `~${eur(sum.stay)}`, withStay, (on) => { withStay = on; draw(); }) : null,
      row('Per person', eur(sum.perPerson), { strong: true }),
      stepper(),
      people > 1 ? row(`Total for ${people}`, eur(sum.total), { strong: true }) : null,
      note ? h('p', { class: 'cost-note is-warning' }, note) : null,
      canBag || canStay ? h('p', { class: 'cost-note' }, ['Estimates.', canBag ? 'Your airline shows the real bag price when you book.' : null, canStay ? budgetSource(costs.daily) : null].filter(Boolean).join(' ')) : null,
    ].filter(Boolean));
  }

  draw();
  return panel;
}
