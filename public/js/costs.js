// The sums behind the trip page's cost panel and share message. No DOM here.

const MAX_PEOPLE = 60;
const SEATS_WARNING_FROM = 5;
const RYANAIR_GROUP_FROM = 15;
const GROUP_STAY_DISCOUNTS = [[15, 0.2], [8, 0.15], [4, 0.1], [2, 0.05]]; // [from this many people, off the stay]

export function clampPeople(value) {
  const people = Number.parseInt(value, 10);
  return Number.isFinite(people) ? Math.min(MAX_PEOPLE, Math.max(1, people)) : 1;
}

/** A group shares rooms and shopping, so a day costs each person less. A rough rule of thumb, not a quote. */
export function stayDiscount(people) {
  return GROUP_STAY_DISCOUNTS.find(([from]) => people >= from)?.[1] ?? 0;
}

/** Per person and group totals. The bag and the stay only count when switched on. */
export function costBreakdown({ ticket, travel = 0, bagPerFlight = null, flights = 2, dayRate = null, nights = 0, withBag = false, withStay = false, people = 1 }) {
  const bag = (bagPerFlight || 0) * flights;
  const stay = Math.round((dayRate || 0) * nights * (1 - stayDiscount(people)));
  const perPerson = ticket + travel + (withBag ? bag : 0) + (withStay ? stay : 0);
  return { ticket, travel, bag, stay, perPerson, people, total: perPerson * people };
}

/** The honest small print for a group. Fare data doesn't say how many seats are left at this price. */
export function groupNote({ people, airline }) {
  if (people < SEATS_WARNING_FROM) return null;
  const seats = `This price may not have ${people} seats left, so check before you promise it.`;
  const isRyanair = /ryanair/i.test(airline || '');
  return isRyanair && people >= RYANAIR_GROUP_FROM ? `${seats} Ryanair's group booking starts at ${RYANAIR_GROUP_FROM} people, all on the same flight.` : seats;
}

/** A ready-to-send message for the group chat. WhatsApp shows *text* in bold. */
export function shareMessage({ icon = '✈️', name, deal, from, price, travel, when, url, people = 1, total }) {
  const details = [
    `${icon} *${name}*${deal ? ` · ${deal}` : ''}`,
    `*${price}* per person${travel ? ` + ~${travel} train/bus` : ''}`,
    when,
    from ? `From ${from}` : null,
    people > 1 && total ? `*${people} people: ${total} in total*` : null,
  ].filter(Boolean);
  return [...details, '', url].join('\n');
}
