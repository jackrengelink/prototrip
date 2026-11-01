// Date maths for the date picker and fare calendar. No DOM here. Dates are "YYYY-MM-DD", months "YYYY-MM".

const DAY_MS = 86_400_000;
export const MAX_TRIP_NIGHTS = 21; // Same limit as the server

const toTime = (iso) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (time) => new Date(time).toISOString().slice(0, 10);

export const addDays = (iso, days) => toIso(toTime(iso) + days * DAY_MS);
export const nightsBetween = (from, to) => Math.round((toTime(to) - toTime(from)) / DAY_MS);
export const monthOf = (iso) => iso.slice(0, 7);

export function shiftMonth(month, by) {
  const [year, number] = month.split('-').map(Number);
  return toIso(Date.UTC(year, number - 1 + by, 1)).slice(0, 7);
}

/** The weeks of a month, Monday first, including the days around it that fill those weeks. */
export function monthWeeks(month) {
  const first = `${month}-01`;
  const mondayOffset = (new Date(toTime(first)).getUTCDay() + 6) % 7;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const weeks = [];
  for (let start = addDays(first, -mondayOffset); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, day) => addDays(start, day)));
  }
  return weeks;
}

const inUtc = (iso, options) => new Date(toTime(iso)).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });

/** "Fri 29 Jan" */
export const formatDay = (iso) => `${inUtc(iso, { weekday: 'short' })} ${inUtc(iso, { day: 'numeric' })} ${inUtc(iso, { month: 'short' })}`;
/** "January 2027" */
export const formatMonth = (month) => inUtc(`${month}-01`, { month: 'long', year: 'numeric' });
/** "Friday 29 January 2027", for screen readers */
export const formatFullDay = (iso) => `${inUtc(iso, { weekday: 'long' })} ${inUtc(iso, { day: 'numeric', month: 'long', year: 'numeric' })}`;

const tooLong = (from, to) => nightsBetween(from, to) > MAX_TRIP_NIGHTS;

/** What clicking a day does to the choice: departure first, then the return. */
export function pickDate({ depart, ret, target }, day) {
  if (target === 'depart') {
    const keepsReturn = ret && ret >= day && !tooLong(day, ret);
    return { depart: day, ret: keepsReturn ? ret : '', target: 'return', done: false };
  }
  // A day that can't be the return starts a new trip from there.
  if (day < depart || tooLong(depart, day)) return { depart: day, ret: '', target: 'return', done: false };
  return { depart, ret: day, target: 'return', done: true };
}

/** The "3 nights" shortcut. */
export const withNights = ({ depart }, nights) => ({ depart, ret: addDays(depart, nights), target: 'return', done: true });
