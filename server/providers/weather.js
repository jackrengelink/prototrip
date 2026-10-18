// Open-Meteo: free geocoding + weather, no key needed.
// Within 16 days we use the forecast; further out we show last year's weather for the same dates.

import { fetchJson } from '../lib/http.js';
import { HOUR } from '../lib/cache.js';

const FORECAST_DAYS = 16;
const DAY_MS = 86_400_000;
const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code';

/** WMO weather code -> short label */
export function describeWeather(code) {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  return 'Thunderstorms';
}

const shiftYear = (iso, years) => `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;

export function normalizeDaily(body, dates, typical) {
  const d = body?.daily;
  if (!d?.time) return [];
  return d.time.map((_, i) => ({
    date: dates[i] || d.time[i],
    high: Number.isFinite(d.temperature_2m_max[i]) ? Math.round(d.temperature_2m_max[i]) : null,
    low: Number.isFinite(d.temperature_2m_min[i]) ? Math.round(d.temperature_2m_min[i]) : null,
    rainMm: Math.round((d.precipitation_sum[i] || 0) * 10) / 10,
    summary: describeWeather(d.weather_code[i]),
    typical,
  }));
}

export function createWeatherService({ cache, logger = console }) {
  async function geocode(name, countryCode) {
    return cache.wrap(`geo:${name}:${countryCode}`, 7 * 24 * HOUR, async () => {
      const qs = new URLSearchParams({ name, count: '5', language: 'en', format: 'json' });
      const body = await fetchJson('open-meteo', `https://geocoding-api.open-meteo.com/v1/search?${qs}`);
      const results = body?.results || [];
      const hit = results.find((r) => r.country_code === countryCode) || results[0];
      return hit ? { lat: hit.latitude, lon: hit.longitude } : null;
    });
  }

  async function forecast({ lat, lon }, startDate, endDate) {
    // The forecast must cover the whole trip; otherwise use last year's weather for every day.
    const daysAhead = (Date.parse(endDate) - Date.now()) / DAY_MS;
    const typical = daysAhead > FORECAST_DAYS - 2;
    const dates = [];
    for (let t = Date.parse(startDate); t <= Date.parse(endDate); t += DAY_MS) dates.push(new Date(t).toISOString().slice(0, 10));
    const [from, to] = typical ? [shiftYear(startDate, -1), shiftYear(endDate, -1)] : [startDate, endDate];
    const host = typical ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
    const qs = new URLSearchParams({ latitude: String(lat), longitude: String(lon), daily: DAILY, timezone: 'auto', start_date: from, end_date: to });
    try {
      return await cache.wrap(`wx:${lat},${lon}:${from}:${to}`, 6 * HOUR, async () =>
        normalizeDaily(await fetchJson('open-meteo', `${host}?${qs}`), dates, typical));
    } catch (err) {
      logger.warn(`[weather] ${err.message}`);
      return [];
    }
  }

  return { geocode, forecast };
}
