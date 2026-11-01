// One calendar for both dates: pick the way out, then the way back, and see the trip as a band across the days.

import { h, isoPlusDays } from './dom.js';
import { addDays, monthOf, monthWeeks, shiftMonth, nightsBetween, pickDate, withNights, formatDay, formatMonth, formatFullDay } from './dates.js';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const STAY_SHORTCUTS = [2, 3, 4, 7];
const TWO_MONTHS_FROM_PX = 520;
const MAX_DAYS_AHEAD = 355; // A little under the server's limit
const KEY_STEPS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

const nightsLabel = (n) => `${n} night${n === 1 ? '' : 's'}`;

/**
 * @param {{row:HTMLElement, departButton:HTMLButtonElement, returnButton:HTMLButtonElement, popover:HTMLElement}} els
 */
export function createDatePicker({ row, departButton, returnButton, popover }) {
  const today = isoPlusDays(0);
  const lastDay = isoPlusDays(MAX_DAYS_AHEAD);
  let picked = { depart: today, ret: '', target: 'depart' };
  let month = monthOf(today);
  let focusDay = today;
  let opener = departButton;

  const isOpen = () => !popover.hidden;
  const bookable = (day) => day >= today && day <= lastDay;
  const monthsShown = () => (row.clientWidth >= TWO_MONTHS_FROM_PX ? 2 : 1);
  const visibleMonths = () => Array.from({ length: monthsShown() }, (_, i) => shiftMonth(month, i));

  function showDates() {
    departButton.textContent = formatDay(picked.depart);
    returnButton.textContent = picked.ret ? formatDay(picked.ret) : 'One way';
    returnButton.classList.toggle('is-empty', !picked.ret);
    departButton.classList.toggle('is-active', isOpen() && picked.target === 'depart');
    returnButton.classList.toggle('is-active', isOpen() && picked.target === 'return');
    departButton.setAttribute('aria-expanded', String(isOpen()));
    returnButton.setAttribute('aria-expanded', String(isOpen()));
  }

  function dayClasses(day) {
    const { depart, ret } = picked;
    return ['dp-day',
      day === depart && 'is-start',
      day === ret && 'is-end',
      day === depart && ret && ret !== depart && 'has-range',
      ret && day > depart && day < ret && 'in-range',
      day === today && 'is-today',
    ].filter(Boolean).join(' ');
  }

  function dayCell(day, shownMonth) {
    if (monthOf(day) !== shownMonth) return h('span', { class: 'dp-blank', 'aria-hidden': 'true' });
    return h('button', {
      type: 'button', class: dayClasses(day), 'data-day': day, disabled: !bookable(day),
      tabindex: day === focusDay ? '0' : '-1', 'aria-label': formatFullDay(day),
      'aria-pressed': String(day === picked.depart || day === picked.ret),
    }, String(Number(day.slice(8))));
  }

  function monthGrid(shownMonth) {
    return h('div', { class: 'dp-month' },
      h('h4', { class: 'dp-month-name' }, formatMonth(shownMonth)),
      h('div', { class: 'dp-grid' },
        WEEKDAYS.map((d) => h('span', { class: 'dp-weekday', 'aria-hidden': 'true' }, d)),
        monthWeeks(shownMonth).flat().map((day) => dayCell(day, shownMonth))));
  }

  const canGoBack = () => month > monthOf(today);
  const canGoOn = () => shiftMonth(month, 1) <= monthOf(lastDay);

  function summary() {
    const { depart, ret, target } = picked;
    if (!ret) return target === 'return' ? `${formatDay(depart)}. Now pick your way back, or stay one way.` : 'Pick your way out';
    return `${formatDay(depart)} to ${formatDay(ret)} · ${nightsLabel(nightsBetween(depart, ret))}`;
  }

  function draw() {
    popover.replaceChildren(
      h('div', { class: 'dp-nav' },
        h('button', { type: 'button', class: 'dp-arrow', 'data-move': '-1', 'aria-label': 'Earlier months', disabled: !canGoBack() }, '‹'),
        h('p', { class: 'dp-prompt' }, picked.target === 'depart' ? 'When do you leave?' : 'When are you back?'),
        h('button', { type: 'button', class: 'dp-arrow', 'data-move': '1', 'aria-label': 'Later months', disabled: !canGoOn() }, '›')),
      h('div', { class: 'dp-months' }, visibleMonths().map(monthGrid)),
      h('div', { class: 'dp-quick' },
        h('span', { class: 'dp-quick-label' }, 'Stay'),
        STAY_SHORTCUTS.map((n) => h('button', {
          type: 'button', class: 'dp-chip', 'data-nights': String(n),
          'aria-pressed': String(Boolean(picked.ret) && nightsBetween(picked.depart, picked.ret) === n),
        }, nightsLabel(n))),
        h('button', { type: 'button', class: 'dp-chip', 'data-oneway': '1', 'aria-pressed': String(!picked.ret) }, 'One way')),
      h('div', { class: 'dp-foot' },
        h('span', { class: 'dp-summary', role: 'status' }, summary()),
        h('button', { type: 'button', class: 'btn-cyan', 'data-done': '1' }, 'Done')));
    showDates();
  }

  function close({ refocus = true } = {}) {
    if (!isOpen()) return;
    popover.hidden = true;
    document.removeEventListener('pointerdown', onOutside);
    showDates();
    if (refocus) opener.focus();
  }

  function onOutside(event) {
    if (!row.contains(event.target)) close({ refocus: false });
  }

  function focusOn(day) {
    popover.querySelector(`[data-day="${day}"]`)?.focus();
  }

  function open(target) {
    opener = target === 'depart' ? departButton : returnButton;
    picked = { ...picked, target };
    focusDay = target === 'return' && picked.ret ? picked.ret : picked.depart;
    month = monthOf(picked.depart);
    const wasOpen = isOpen();
    popover.hidden = false;
    if (!visibleMonths().includes(monthOf(focusDay))) month = monthOf(focusDay);
    draw();
    focusOn(focusDay);
    if (wasOpen) return;
    document.addEventListener('pointerdown', onOutside);
    popover.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function apply(next) {
    const { done, ...choice } = next;
    picked = choice;
    focusDay = picked.ret || picked.depart;
    if (done) close();
    else draw();
  }

  /** Shows how long the trip gets while hovering over a day. */
  function preview(day) {
    const from = picked.depart;
    const active = picked.target === 'return' && day && day >= from;
    for (const cell of popover.querySelectorAll('[data-day]')) {
      cell.classList.toggle('in-preview', Boolean(active) && cell.dataset.day > from && cell.dataset.day <= day);
    }
  }

  function moveFocus(event, day) {
    const step = KEY_STEPS[event.key];
    const target = step ? addDays(day, step)
      : event.key === 'PageUp' ? addDays(day, -30)
        : event.key === 'PageDown' ? addDays(day, 30) : null;
    if (!target) return;
    event.preventDefault();
    if (!bookable(target)) return;
    focusDay = target;
    const shown = visibleMonths();
    if (!shown.includes(monthOf(target))) month = target < `${month}-01` ? monthOf(target) : shiftMonth(monthOf(target), 1 - shown.length);
    draw();
    focusOn(target);
  }

  popover.addEventListener('click', (event) => {
    const el = event.target.closest('button');
    if (!el) return;
    if (el.dataset.day) apply(pickDate(picked, el.dataset.day));
    else if (el.dataset.nights) apply(withNights(picked, Number(el.dataset.nights)));
    else if (el.dataset.oneway) apply({ ...picked, ret: '', target: 'return', done: true });
    else if (el.dataset.done) close();
    else if (el.dataset.move) {
      month = shiftMonth(month, Number(el.dataset.move));
      draw();
    }
  });
  popover.addEventListener('pointerover', (event) => preview(event.target.closest('[data-day]')?.dataset.day));
  popover.addEventListener('pointerleave', () => preview(null));
  popover.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    const day = event.target.dataset?.day;
    if (day) moveFocus(event, day);
  });
  departButton.addEventListener('click', () => open('depart'));
  returnButton.addEventListener('click', () => open('return'));
  window.addEventListener('resize', () => { if (isOpen()) draw(); });

  return {
    /** The dates as the rest of the app uses them. */
    get value() {
      return { departDate: picked.depart, returnDate: picked.ret };
    },
    set(departDate, returnDate) {
      picked = { depart: departDate, ret: returnDate || '', target: 'depart' };
      showDates();
    },
  };
}
