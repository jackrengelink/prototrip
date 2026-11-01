// Maps with Leaflet (vendored in /vendor/leaflet) on free Esri tiles. No API key needed.
// (CARTO's basemaps now demand a key and stamp "API KEY REQUIRED" on tiles, so we don't use them.)
// - Deal map: every destination as a dot, all flight paths faint; select one to see its full route:
//   train from Enschede to the airport (dashed) + the flight as a great-circle arc with a plane on it.
// - Route map: the same route for one trip, on the trip screen.

import { h, money } from './dom.js';
import { priceNumbers } from './board.js';

const L = window.L;

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTRIBUTION = 'Tiles &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors';
const TILES = {
  dark: { base: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, maxZoom: 16 },
  light: { base: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, maxZoom: 16 },
  satellite: { base: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, maxZoom: 18 },
};
const TIER_COLOR = { crazy: '#ff3d6e', great: '#26d4ea', good: '#83b71a', typical: '#8b94a0', pricey: '#c98a3a' };
const ARC_POINTS = 64;
const PLANE_SPOT = 0.35; // A third of the way along each direction, so the two planes pass each other
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Points along the great circle from a to b ([lat, lon]), with longitudes kept continuous. */
export function greatCircle(a, b, n = ARC_POINTS) {
  const [lat1, lon1, lat2, lon2] = [a[0], a[1], b[0], b[1]].map(toRad);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2));
  if (d === 0) return [a, b];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pts.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
  }
  for (let i = 1; i < pts.length; i++) {
    while (pts[i][1] - pts[i - 1][1] > 180) pts[i][1] -= 360;
    while (pts[i][1] - pts[i - 1][1] < -180) pts[i][1] += 360;
  }
  return pts;
}

/** Bearing in degrees from p to q, for pointing the plane icon. */
function bearing(p, q) {
  const [la1, lo1, la2, lo2] = [p[0], p[1], q[0], q[1]].map(toRad);
  const y = Math.sin(lo2 - lo1) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const isDark = () => document.documentElement.dataset.theme !== 'light';

/** A base map + its place-name labels, with labels drawn above the flight paths. */
function styleLayer(t) {
  const base = L.tileLayer(t.base, { attribution: ESRI_ATTRIBUTION, maxZoom: t.maxZoom, maxNativeZoom: t.maxZoom });
  const labels = L.tileLayer(t.labels, { pane: 'labels', maxZoom: t.maxZoom, maxNativeZoom: t.maxZoom });
  return { group: L.layerGroup([base, labels]), base, labels };
}

function createMap(el) {
  const map = L.map(el, {
    scrollWheelZoom: true, // zoom by scrolling while hovering
    wheelPxPerZoomLevel: 90,
    zoomSnap: 0.25,
    worldCopyJump: true,
    minZoom: 2,
    attributionControl: true,
    // On phones one finger scrolls the page; two fingers move and zoom the map.
    dragging: !L.Browser.mobile,
    zoomControl: !L.Browser.mobile,
  });
  // Drop the "Leaflet" prefix; the tile credit itself stays (Esri's free tiles require it).
  map.attributionControl.setPrefix(false);
  // Leaflet stops wheel events on popups and buttons, so the page would scroll: pass them to the map to zoom.
  el.addEventListener('wheel', (event) => {
    if (!event.target.closest?.('.leaflet-control')) return;
    event.preventDefault();
    event.stopPropagation();
    el.dispatchEvent(new WheelEvent('wheel', event));
  }, { capture: true, passive: false });
  const labelsPane = map.createPane('labels');
  labelsPane.style.zIndex = '450';
  labelsPane.style.pointerEvents = 'none';
  const street = styleLayer(isDark() ? TILES.dark : TILES.light);
  const satellite = styleLayer(TILES.satellite);
  street.group.addTo(map);
  L.control.layers({ Map: street.group, Satellite: satellite.group }, null, { position: 'topright' }).addTo(map);
  return {
    map,
    /** Swap the street map between the dark and light styles to match the page theme. */
    setTheme() {
      const t = isDark() ? TILES.dark : TILES.light;
      street.base.setUrl(t.base);
      street.labels.setUrl(t.labels);
    },
  };
}

function homeMarker(home) {
  return L.marker([home.lat, home.lon], {
    icon: L.divIcon({ className: 'pin-home', html: '<span class="pin-home-dot"></span><span class="pin-home-label">Enschede</span>', iconSize: [16, 16], iconAnchor: [8, 8] }),
    zIndexOffset: 1000,
    keyboard: false,
  }).bindTooltip('Home: Enschede (UT)', { direction: 'top', offset: [0, -8] });
}

/** A plane on the line, pointing along it. `along` is how far down the line it sits, from 0 to 1. */
function planeMarker(arc, glyph = '✈', along = 0.5) {
  const mid = Math.floor((arc.length - 1) * along);
  const angle = bearing(arc[mid], arc[Math.min(arc.length - 1, mid + 1)]);
  const marker = L.marker(arc[mid], { icon: L.divIcon({ className: 'pin-plane', html: `<span class="plane">${glyph}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }), interactive: false, keyboard: false });
  // Rotate via the DOM (not an inline style string) so the page CSP stays strict. ✈ points east, so subtract 90°.
  if (glyph === '✈') marker.on('add', () => { marker.getElement().querySelector('.plane').style.transform = `rotate(${angle - 90}deg)`; });
  return marker;
}

/** The full route for one fare: train to the airport, then the flight. Returns a layer group + bounds points. */
function routeLayers(offer, home, { emphasis = true } = {}) {
  const group = L.layerGroup();
  const { origin, destination } = offer.coords || {};
  if (!origin || !destination) return { group, points: [] };
  const points = [origin, destination];
  if (offer.mode === 'ground') {
    // Bus & train: one line straight from Enschede.
    const line = greatCircle(origin, destination, 16);
    L.polyline(line, { className: 'route-glow', weight: 10, interactive: false }).addTo(group);
    L.polyline(line, { className: `route-ground tier-${offer.deal?.tier || 'typical'}`, weight: 3.5, interactive: false }).addTo(group);
    if (emphasis) planeMarker(line, '🚌').addTo(group);
    return { group, points };
  }
  if (home) {
    L.polyline([[home.lat, home.lon], origin], { className: 'route-train', weight: 3, interactive: false }).addTo(group);
    points.push([home.lat, home.lon]);
  }
  const arc = greatCircle(origin, destination);
  L.polyline(arc, { className: 'route-glow', weight: 10, interactive: false }).addTo(group);
  L.polyline(arc, { className: `route-flight tier-${offer.deal?.tier || 'typical'}`, weight: 3.5, interactive: false }).addTo(group);
  // A normal return flies this same line twice: one plane each way. Two tickets draw their own way home.
  const bothWays = offer.returnDate && !offer.mixed;
  if (emphasis) planeMarker(arc, '✈', bothWays ? PLANE_SPOT : 0.5).addTo(group);
  if (emphasis && bothWays) planeMarker([...arc].reverse(), '✈', PLANE_SPOT).addTo(group);
  L.circleMarker(origin, { radius: 5, className: 'pin-origin', interactive: false }).addTo(group);
  return { group, points: [...points, arc[Math.floor(arc.length / 2)], ...wayHome(offer, home, group)] };
}

/** Two-ticket trips: the flight home as its own dashed arc, then the train from that home airport. */
function wayHome(offer, home, group) {
  const { returnFrom, returnTo } = offer.coords || {};
  if (!returnFrom || !returnTo) return [];
  const arc = greatCircle(returnFrom, returnTo);
  L.polyline(arc, { className: `route-flight route-home tier-${offer.deal?.tier || 'typical'}`, weight: 3, interactive: false }).addTo(group);
  planeMarker(arc).addTo(group);
  L.circleMarker(returnFrom, { radius: 5, className: 'pin-origin', interactive: false }).addTo(group);
  L.circleMarker(returnTo, { radius: 5, className: 'pin-origin', interactive: false }).addTo(group);
  if (home) L.polyline([returnTo, [home.lat, home.lon]], { className: 'route-train', weight: 3, interactive: false }).addTo(group);
  return [returnFrom, returnTo];
}

/** The selected deal, small, in the corner of the map, so it never covers the route. */
function dealCard(offer, onPlan) {
  const card = h('div', { class: 'map-card' },
    h('div', { class: 'map-card-text' },
      h('b', {}, offer.destinationName),
      h('span', { class: 'map-card-price' }, priceNumbers(offer), h('small', {}, offer.returnDate ? ' return' : ' one way')),
      h('small', {}, offer.mode === 'ground' ? `${offer.airline} from Enschede` : `From ${offer.origin}${offer.mixed ? `, back to ${offer.returnTo}` : ''}`)),
    h('button', { class: 'btn-cyan', type: 'button', onClick: () => onPlan(offer) }, 'Plan →'));
  L.DomEvent.disableClickPropagation(card);
  return card;
}

/**
 * Map of all deals on the main screen.
 * @param {HTMLElement} el
 * @param {{home:{lat:number,lon:number}, onSelect:(offer|null)=>void, onPlan:(offer)=>void}} opts
 */
export function createDealMap(el, { onSelect, onPlan }) {
  const { map, setTheme } = createMap(el);
  let home = null;
  let homeLayer = null;
  const allLayer = L.layerGroup().addTo(map);
  const selectedLayer = L.layerGroup().addTo(map);
  let offers = [];
  let markers = new Map();
  let card = null;
  map.setView([50, 10], 4);
  map.on('click', () => onSelect(null));

  function fitAll() {
    const pts = offers.flatMap((o) => [o.coords?.destination, o.coords?.origin]).filter(Boolean);
    if (home) pts.push([home.lat, home.lon]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 6, animate: false });
  }

  function drawAll() {
    allLayer.clearLayers();
    markers = new Map();
    // Faint paths first so the dots sit on top. Crazy deals get brighter lines.
    for (const o of offers) {
      if (!o.coords?.origin || !o.coords?.destination) continue;
      L.polyline(greatCircle(o.coords.origin, o.coords.destination, 32), { className: `route-faint tier-${o.deal?.tier}${o.mode === 'ground' ? ' mode-ground' : ''}`, weight: o.deal?.tier === 'crazy' ? 1.6 : 1, interactive: false }).addTo(allLayer);
    }
    for (const o of offers) {
      if (!o.coords?.destination) continue;
      const crazy = o.deal?.tier === 'crazy';
      const m = L.circleMarker(o.coords.destination, {
        radius: crazy ? 5 + Math.min(3, Math.max(0, (o.deal.score - 60) / 8)) : 4,
        color: TIER_COLOR[o.deal?.tier] || TIER_COLOR.typical,
        fillColor: TIER_COLOR[o.deal?.tier] || TIER_COLOR.typical,
        fillOpacity: crazy ? 0.85 : 0.55,
        weight: crazy ? 2 : 1,
        className: `pin-dest${crazy ? ' pin-crazy' : ''}`,
      });
      m.bindTooltip(`<b>${escapeHtml(o.destinationName)}</b> ${escapeHtml(money(o.price, o.currency))}`, { direction: 'top', offset: [0, -6], className: 'map-tip' });
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); onSelect(o); });
      m.addTo(allLayer);
      markers.set(o.id, m);
    }
  }

  return {
    setHome(h0) {
      home = h0;
      if (homeLayer) homeLayer.remove();
      if (home) homeLayer = homeMarker(home).addTo(map);
    },
    setOffers(list) {
      offers = list.filter((o) => o.coords?.destination);
      drawAll();
      selectedLayer.clearLayers();
      card?.remove();
      el.classList.remove('has-selection');
      fitAll();
    },
    /** Highlight one fare's full route, or show everything again with null. */
    select(offer) {
      selectedLayer.clearLayers();
      card?.remove();
      el.classList.toggle('has-selection', Boolean(offer));
      if (!offer) {
        fitAll();
        return;
      }
      const { group, points } = routeLayers(offer, home);
      group.addTo(selectedLayer);
      card = dealCard(offer, onPlan);
      el.append(card);
      if (points.length) {
        // Jump instead of flying: an animated fly-to interrupted by scrolling can leave tiles and route misaligned.
        map.stop();
        // Extra room at the bottom keeps the route clear of the card.
        map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [40, 40], paddingBottomRight: [40, card.offsetHeight + 30], maxZoom: 7, animate: false });
      }
    },
    setTheme,
    refresh() { map.invalidateSize(); },
  };
}

/** Small map of one trip's route on the trip screen. Returns a cleanup function. */
export function createRouteMap(el, offer, home) {
  const { map, setTheme } = createMap(el);
  const { group, points } = routeLayers(offer, home);
  // Position the map first: Leaflet can't place markers or tooltips on a map without a view.
  // Extra room on the right for the destination's name label.
  if (points.length) map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [30, 30], paddingBottomRight: [110, 30], maxZoom: 7 });
  else map.setView([50, 10], 4);
  if (home) homeMarker(home).addTo(map);
  group.addTo(map);
  if (offer.coords?.destination) {
    L.circleMarker(offer.coords.destination, { radius: 8, color: TIER_COLOR[offer.deal?.tier] || TIER_COLOR.typical, fillOpacity: 0.9, className: 'pin-dest pin-crazy' })
      .bindTooltip(offer.destinationName, { permanent: true, direction: 'right', offset: [8, 0], className: 'map-tip' }).addTo(map);
  }
  return { setTheme, destroy: () => map.remove(), refresh: () => map.invalidateSize() };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
