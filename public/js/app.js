// ProtoTrip front end: Fly or Bus & train -> crazy deals + map + board -> trip -> "What to do".
// All search state lives in the URL, so every view can be shared or bookmarked.

import { h, isoPlusDays } from './dom.js';
import { getJson, resolveCode, HOME_CODE } from './api.js';
import { renderBoard, markSelected } from './board.js';
import { createDealMap, createRouteMap } from './map.js';
import { renderTrip, renderGroundTrip, renderExplore } from './trip.js';

const INTERESTS = [
  ['history', 'History'], ['art', 'Art & museums'], ['food', 'Food'],
  ['nature', 'Nature'], ['nightlife', 'Nightlife'], ['shopping', 'Markets'],
];
const DEFAULT_INTERESTS = ['history', 'food', 'nightlife'];
const HOME_LABEL = `Netherlands & nearby · ${HOME_CODE}`;
const AUTOCOMPLETE_DELAY_MS = 180;
const THEME_KEY = 'prototrip-theme';
const SOURCE_NAMES = { ryanair: 'Ryanair', travelpayouts: 'Aviasales', serpapi: 'Google Flights' };

const $ = (id) => document.getElementById(id);
const els = {
  form: $('search-form'), origin: $('origin'), destination: $('destination'),
  departDate: $('departDate'), returnDate: $('returnDate'), budget: $('budget'), flex: $('flex'), domestic: $('domestic'),
  chips: $('interest-chips'), airportList: $('airport-list'), results: $('results'),
  list: $('results-list'), mapEl: $('deal-map'), mapTitle: $('map-title'), mapClear: $('map-clear'),
  trip: $('trip'), notice: $('notice'), status: $('status-chip'), theme: $('theme-toggle'),
  tabs: [...document.querySelectorAll('.mode-tab')],
};

let lastDeals = null;
let home = null;
let dealMap = null;
let routeMap = null;
let boardState = null;
let selected = null;

/* ---------- Theme (dark by default) ---------- */
function storedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.theme.textContent = theme === 'dark' ? '☀' : '☾';
  els.theme.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  dealMap?.setTheme();
  routeMap?.setTheme();
  try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: theme just won't persist */ }
}

/* ---------- Small helpers ---------- */
function showNotice(message, kind = 'info') {
  els.notice.hidden = !message;
  els.notice.dataset.kind = kind;
  els.notice.textContent = message || '';
}
const loading = (text) => h('div', { class: 'loading' }, text);
const selectedInterests = () => [...els.chips.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.value);
const radioValue = (name, fallback) => els.form.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
const displayCode = (code) => (code === HOME_CODE ? HOME_LABEL : code);
const currentMode = () => els.tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.dataset.mode || 'fly';

function renderChips(active) {
  els.chips.replaceChildren(...INTERESTS.map(([value, label]) =>
    h('button', {
      type: 'button', class: 'chip', 'data-value': value, 'aria-pressed': String(active.includes(value)),
      onClick: (e) => e.currentTarget.setAttribute('aria-pressed', String(e.currentTarget.getAttribute('aria-pressed') !== 'true')),
    }, label)));
}

/** Show the form fields that belong to Fly or Bus & train. */
function setModeUi(mode) {
  for (const t of els.tabs) t.setAttribute('aria-selected', String(t.dataset.mode === mode));
  for (const el of document.querySelectorAll('[data-mode-only]')) el.hidden = el.dataset.modeOnly !== mode;
  document.body.dataset.mode = mode;
}

/** Suggest airports as the user types. The Netherlands group is always offered first. */
function wireAutocomplete(input) {
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return;
    timer = setTimeout(async () => {
      const matches = await getJson('/api/airports', { q }).catch(() => []);
      els.airportList.replaceChildren(
        h('option', { value: HOME_LABEL }),
        ...matches.map((a) => h('option', { value: `${a.name} · ${a.iata}` })));
    }, AUTOCOMPLETE_DELAY_MS);
  });
}

/* ---------- URL state ---------- */
function readUrlState() {
  const p = new URLSearchParams(location.search);
  return {
    mode: p.get('mode') === 'ground' ? 'ground' : 'fly',
    origin: p.get('origin') || HOME_CODE,
    destination: p.get('destination') || '',
    departDate: p.get('departDate') || isoPlusDays(30),
    returnDate: p.has('returnDate') ? p.get('returnDate') : isoPlusDays(34),
    budget: p.get('budget') || '',
    reach: p.get('reach') || 'smart',
    airports: ['nl', 'near', 'all'].includes(p.get('airports')) ? p.get('airports') : 'near',
    flex: p.get('flex') === '0' ? '0' : '3',
    domestic: p.get('domestic') === '1' ? '1' : '',
    crazy: p.get('crazy') === '1' ? '1' : '',
    interests: p.has('interests') ? p.get('interests').split(',').filter(Boolean) : DEFAULT_INTERESTS,
    trip: p.get('trip'),
    tripFrom: p.get('tripFrom'),
    tripDepart: p.get('tripDepart'),
    tripReturn: p.get('tripReturn'),
    offerId: p.get('offerId'),
  };
}

function writeUrlState(state, { replace = false } = {}) {
  const clean = Object.entries({ ...state, mode: state.mode === 'ground' ? 'ground' : '' })
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length));
  const url = `${location.pathname}?${new URLSearchParams(clean)}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}

const interestsParam = (s) => (Array.isArray(s.interests) ? s.interests.join(',') : s.interests);
const searchParams = (s) => (s.mode === 'ground'
  ? { mode: 'ground', departDate: s.departDate, returnDate: s.returnDate, budget: s.budget, domestic: s.domestic, interests: interestsParam(s) }
  : {
    origin: s.origin, destination: s.destination, departDate: s.departDate, returnDate: s.returnDate,
    budget: s.budget, reach: s.reach, airports: s.airports, flex: s.flex, interests: interestsParam(s),
  });

/* ---------- Map ---------- */
function getDealMap() {
  if (dealMap || !window.L) return dealMap;
  dealMap = createDealMap(els.mapEl, {
    onSelect: (offer) => selectOffer(offer, 'map'),
    onPlan: (offer) => openTrip(boardState, offer),
  });
  if (home) dealMap.setHome(home);
  return dealMap;
}

function mapTitle() {
  if (selected) {
    const from = selected.mode === 'ground' ? 'Enschede' : selected.origin;
    return `${from} → ${selected.destinationName} · ${selected.deal?.label || ''}`;
  }
  if (els.mapEl.classList.contains('is-outdated')) return 'Restart ProtoTrip to see trips on the map';
  return boardState?.mode === 'ground' ? 'Everywhere by bus & train from Enschede' : 'All flight deals on the map';
}

/** Select a deal (from the list or the map) to show its route; null shows every deal again. */
function selectOffer(offer, source = 'list') {
  const same = offer && selected && offer.id === selected.id;
  selected = offer && !(same && source === 'list') ? offer : null;
  markSelected(els.list, selected?.id || null);
  getDealMap()?.select(selected);
  els.mapTitle.textContent = mapTitle();
  els.mapClear.hidden = !selected;
  if (selected && source === 'map') {
    els.list.querySelector(`[data-offer-id="${CSS.escape(selected.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* ---------- Deals ---------- */
function drawBoard(state) {
  const { data } = lastDeals;
  boardState = state;
  const onlyCrazy = state.crazy === '1';
  renderBoard(els.list, data, {
    mode: state.mode,
    anywhere: state.mode === 'ground' || !state.destination,
    onlyCrazy,
    home,
    onSelect: (offer) => selectOffer(offer, 'list'),
    onPlan: (offer) => openTrip(state, offer),
    onToggleOnlyCrazy: () => {
      const next = { ...state, crazy: onlyCrazy ? '' : '1' };
      writeUrlState(next, { replace: true });
      drawBoard(next);
    },
  });
  const shown = (onlyCrazy ? data.offers.filter((o) => o.deal?.tier === 'crazy') : data.offers).slice(0, 80);
  // A server started before the map existed sends fares without coordinates: say so instead of an empty map.
  els.mapEl.classList.toggle('is-outdated', shown.length > 0 && !shown.some((o) => o.coords?.destination));
  const map = getDealMap();
  map?.refresh();
  map?.setOffers(shown);
  const keep = selected && shown.find((o) => o.id === selected.id);
  selected = null;
  selectOffer(keep || null, 'restore');
}

async function runSearch(state) {
  els.trip.hidden = true;
  els.results.hidden = false;
  selected = null;
  const msg = state.mode === 'ground' ? 'Finding every bus & train trip from Enschede…'
    : state.destination ? 'Comparing fares from every nearby airport…' : 'Scanning every departure from NL & nearby for crazy deals…';
  els.list.replaceChildren(loading(msg));
  showNotice('');
  try {
    const data = await getJson('/api/deals', searchParams(state));
    lastDeals = { data, key: JSON.stringify(searchParams(state)) };
    if (data.warnings?.length) showNotice(data.warnings.join(' · '));
    drawBoard(state);
  } catch (err) {
    els.list.replaceChildren();
    showNotice(err.message, 'error');
  }
}

/* ---------- Trips ---------- */
function openTrip(state, offer) {
  const next = {
    ...state,
    trip: offer.destinationCity || offer.destination,
    tripFrom: offer.mode === 'ground' ? '' : offer.origin,
    tripDepart: offer.departDate,
    tripReturn: offer.returnDate || '',
    offerId: offer.mode === 'ground' ? '' : offer.id,
  };
  writeUrlState(next);
  return loadTrip(next);
}

function showRouteMap(offer) {
  routeMap?.destroy();
  routeMap = null;
  const routeEl = els.trip.querySelector('.route-map');
  if (routeEl && offer?.coords && window.L) routeMap = createRouteMap(routeEl, offer, home);
}

async function loadTrip(state) {
  els.results.hidden = true;
  els.trip.hidden = false;
  els.trip.replaceChildren(loading(state.mode === 'ground' ? 'Finding bus & train connections both ways…' : 'Loading your flight, weather and alternatives…'));
  showNotice('');
  window.scrollTo({ top: els.trip.offsetTop - 70, behavior: 'smooth' });
  const interests = interestsParam(state);
  try {
    if (state.mode === 'ground') {
      const trip = await getJson('/api/ground-trip', { city: state.trip, departDate: state.tripDepart, returnDate: state.tripReturn });
      renderGroundTrip(els.trip, trip, { onBack: () => history.back(), onExplore: (target, t) => loadExplore(target, t, interests) });
      showRouteMap(trip.offer);
      return;
    }
    const query = { origin: state.tripFrom || state.origin, destination: state.trip, departDate: state.tripDepart, returnDate: state.tripReturn, interests, offerId: state.offerId };
    const trip = await getJson('/api/trip', query);
    renderTrip(els.trip, trip, {
      query,
      onBack: () => history.back(),
      onExplore: (target, t) => loadExplore(target, t, interests),
      onSwitchOffer: (offer) => {
        const next = { ...state, offerId: offer.id, tripFrom: offer.origin };
        writeUrlState(next, { replace: true });
        loadTrip(next);
      },
    });
    showRouteMap(trip.flight);
  } catch (err) {
    els.trip.replaceChildren();
    showNotice(err.message, 'error');
  }
}

/** Things to do: only fetched when the user asks for it. Works for airports and plain places. */
async function loadExplore(target, trip, interests) {
  target.replaceChildren(loading(`Finding sights, food and drinks in ${trip.destination.name}…`));
  const where = trip.destination.code
    ? { destination: trip.destination.code }
    : { name: trip.destination.name, lat: trip.destination.center.lat, lon: trip.destination.center.lon, country: trip.destination.country || '' };
  try {
    const data = await getJson('/api/explore', {
      ...where,
      startDate: trip.stay.startDate,
      endDate: trip.stay.endDate,
      arrivalTime: trip.stay.arrivalTime,
      departureTime: trip.stay.departureTime,
      interests,
    });
    renderExplore(target, data);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    target.replaceChildren(h('div', { class: 'notice', 'data-kind': 'error' }, err.message));
  }
}

/* ---------- Form ---------- */
async function onSubmit(event) {
  event.preventDefault();
  const button = els.form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const mode = currentMode();
    const base = {
      mode,
      departDate: els.departDate.value, returnDate: els.returnDate.value,
      budget: els.budget.value, crazy: '', interests: selectedInterests(),
    };
    let state = { ...base, domestic: els.domestic.checked ? '1' : '' };
    if (mode === 'fly') {
      const origin = await resolveCode(els.origin.value || HOME_CODE);
      const destText = els.destination.value.trim();
      const destination = destText && destText.toLowerCase() !== 'anywhere' ? await resolveCode(destText) : '';
      state = { ...base, origin, destination, reach: radioValue('reach', 'smart'), airports: radioValue('airports', 'near'), flex: els.flex.checked ? '3' : '0' };
    }
    writeUrlState(state);
    await runSearch(state);
  } catch (err) {
    showNotice(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function applyState(state) {
  setModeUi(state.mode);
  els.origin.value = displayCode(state.origin);
  els.destination.value = state.destination;
  els.departDate.value = state.departDate;
  els.returnDate.value = state.returnDate;
  els.budget.value = state.budget;
  els.flex.checked = state.flex !== '0';
  els.domestic.checked = state.domestic === '1';
  for (const [name, value] of [['reach', state.reach], ['airports', state.airports]]) {
    const input = els.form.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
    if (input) input.checked = true;
  }
  renderChips(state.interests);
  if (state.trip) return loadTrip(state);
  if (lastDeals && lastDeals.key === JSON.stringify(searchParams(state))) {
    els.trip.hidden = true;
    els.results.hidden = false;
    drawBoard(state);
    return null;
  }
  // No search yet? Show the crazy deals straight away.
  return runSearch(state);
}

/** Switching tabs runs that mode's search right away with the same dates. */
function switchMode(mode) {
  if (mode === currentMode() && !els.results.hidden) return;
  const state = { ...readUrlState(), mode, trip: null, tripFrom: null, tripDepart: null, tripReturn: null, offerId: null, crazy: '' };
  setModeUi(mode);
  writeUrlState(state);
  runSearch(state);
}

async function showStatus() {
  try {
    const s = await getJson('/api/status');
    home = s.home;
    getDealMap()?.setHome(home);
    els.status.dataset.mode = s.demoMode ? 'demo' : 'live';
    els.status.textContent = s.demoMode ? 'Demo fares · real places' : `Live: ${[...s.flights.map((f) => SOURCE_NAMES[f] || f), 'FlixBus'].join(' + ')}`;
  } catch {
    els.status.textContent = 'Offline';
  }
}

async function init() {
  applyTheme(storedTheme() === 'light' ? 'light' : 'dark');
  els.theme.addEventListener('click', toggleTheme);
  els.departDate.min = isoPlusDays(0);
  els.returnDate.min = isoPlusDays(0);
  els.departDate.addEventListener('change', () => {
    if (els.returnDate.value && els.returnDate.value < els.departDate.value) els.returnDate.value = '';
    els.returnDate.min = els.departDate.value;
  });
  els.origin.addEventListener('focus', () => {
    if (!els.airportList.children.length) els.airportList.replaceChildren(h('option', { value: HOME_LABEL }));
  });
  for (const tab of els.tabs) tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  wireAutocomplete(els.origin);
  wireAutocomplete(els.destination);
  els.form.addEventListener('submit', onSubmit);
  els.mapClear.addEventListener('click', () => selectOffer(null));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) selectOffer(null); });
  window.addEventListener('popstate', () => applyState(readUrlState()));
  await showStatus();
  applyState(readUrlState());
}

init();
