// The sums behind the trip page's cost panel and share message. No DOM here.

const MAX_PEOPLE = 60;
const SEATS_WARNING_FROM = 5;
const RYANAIR_GROUP_FROM = 15;

export function clampPeople(value) {
  const people = Number.parseInt(value, 10);
  return Number.isFinite(people) ? Math.min(MAX_PEOPLE, Math.max(1, people)) : 1;
}

/** Per person and group totals. The bag and the stay only count when switched on. */
export function costBreakdown({ ticket, travel = 0, bagPerFlight = null, flights = 2, dayRate = null, nights = 0, withBag = false, withStay = false, people = 1 }) {
  const bag = (bagPerFlight || 0) * flights;
  const stay = (dayRate || 0) * nights;
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

/** A ready-to-send message for the group chat. */
export function shareMessage({ name, from, price, travel, when, url, people = 1, total }) {
  return [
    `ProtoTrip found ${name} for ${price}${travel ? ` + ${travel}` : ''} per person`,
    [from && `From ${from}`, when].filter(Boolean).join(' · '),
    people > 1 && total ? `For ${people} people: ${total} in total` : null,
    url,
  ].filter(Boolean).join('\n');
}
