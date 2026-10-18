// Small DOM helpers. Text is always set via textContent, so API data can't inject HTML.

/** Only allow absolute https links from API data. */
export const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : null);

/**
 * Create an element.
 * @param {string} tag
 * @param {Record<string, any>} [attrs] class, data-*, aria-*, on<Event> handlers, href/src (https only)
 * @param {...(Node|string|number|null|false)} children
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else if (key === 'href' || key === 'src') {
      // Same-site paths ("/x", "#x") or https links only. "//evil.com" is not a same-site path.
      const str = typeof value === 'string' ? value : '';
      const isLocal = (str.startsWith('/') && !str.startsWith('//')) || str.startsWith('#');
      const url = isLocal ? str : safeUrl(str);
      if (url) el.setAttribute(key, url);
    } else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** External link that opens in a new tab without leaking the opener. */
export const extLink = (href, attrs, ...children) =>
  safeUrl(href) ? h('a', { href, target: '_blank', rel: 'noopener noreferrer', ...attrs }, ...children) : h('span', attrs, ...children);

export const money = (n, currency = 'EUR') =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

export const fmtDate = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }) : '';

export function fmtDuration(min) {
  if (!Number.isFinite(min)) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export const stopsLabel = (n) => (n === 0 ? 'Nonstop' : n === 1 ? '1 stop' : `${n} stops`);

export function isoPlusDays(days, from = new Date()) {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate() + days));
  return d.toISOString().slice(0, 10);
}
