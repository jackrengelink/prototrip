// Viator Partner API (Basic Access affiliate key): bookable tours and experiences.
// Docs: https://docs.viator.com/partner-api/affiliate/technical

import { fetchJson } from '../../lib/http.js';

const API = 'https://api.viator.com/partner/search/freetext';

function bestImage(images = []) {
  const variants = images[0]?.variants || [];
  const fit = variants.filter((v) => v.width >= 360).sort((a, b) => a.width - b.width)[0];
  return (fit || variants[variants.length - 1])?.url || null;
}

function durationLabel(duration = {}) {
  const mins = duration.fixedDurationInMinutes ?? duration.variableDurationFromMinutes;
  if (!Number.isFinite(mins)) return null;
  return mins >= 60 ? `${Math.round((mins / 60) * 10) / 10} h` : `${mins} min`;
}

export function normalizeViator(body) {
  const results = body?.products?.results || [];
  return results.map((p) => ({
    id: `viator-${p.productCode}`,
    title: p.title,
    description: p.description ? String(p.description).slice(0, 220) : null,
    image: bestImage(p.images),
    rating: p.reviews?.combinedAverageRating ?? null,
    reviews: p.reviews?.totalReviews ?? 0,
    fromPrice: p.pricing?.summary?.fromPrice ?? null,
    currency: p.pricing?.currency || 'EUR',
    duration: durationLabel(p.duration),
    url: p.productUrl,
    source: 'viator',
  }));
}

export function createViator({ apiKey }) {
  return {
    id: 'viator',
    async experiences({ cityName, interests = [] }) {
      const searchTerm = interests.includes('food') ? `${cityName} food tour` : cityName;
      const body = await fetchJson('viator', API, {
        method: 'POST',
        headers: {
          'exp-api-key': apiKey,
          Accept: 'application/json;version=2.0',
          'Accept-Language': 'en-US',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchTerm,
          currency: 'EUR',
          searchTypes: [{ searchType: 'PRODUCTS', pagination: { start: 1, count: 12 } }],
          productSorting: { sort: 'REVIEW_AVG_RATING', order: 'DESCENDING' },
        }),
      });
      return normalizeViator(body);
    },
  };
}
