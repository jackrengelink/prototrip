// Deep links that open the same search on the big comparison sites,
// so the user can always double-check a fare before buying.

const pad = (n) => String(n).padStart(2, '0');

/** 2026-11-05 -> 261105 (Skyscanner's date format) */
function yymmdd(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${y.slice(2)}${m}${d}`;
}

/** 2026-11-05 -> 0511 (Aviasales' date format) */
function ddmm(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${pad(d)}${pad(m)}`;
}

/**
 * @param {{origin:string, destination:string, departDate:string, returnDate?:string|null, adults?:number}} q
 * @returns {{id:string, name:string, url:string, note:string}[]}
 */
export function comparisonLinks({ origin, destination, departDate, returnDate = null, adults = 1 }) {
  const o = origin.toUpperCase();
  const d = destination.toUpperCase();
  const lo = o.toLowerCase();
  const ld = d.toLowerCase();
  const rt = Boolean(returnDate);
  const gfQuery = `Flights from ${o} to ${d} on ${departDate}${rt ? ` through ${returnDate}` : ''}`;

  return [
    {
      id: 'skyscanner',
      name: 'Skyscanner',
      note: 'Widest budget-airline coverage',
      url: `https://www.skyscanner.net/transport/flights/${lo}/${ld}/${yymmdd(departDate)}/${rt ? `${yymmdd(returnDate)}/` : ''}?adultsv2=${adults}`,
    },
    {
      id: 'google',
      name: 'Google Flights',
      note: 'Fastest, best date grid',
      url: `https://www.google.com/travel/flights?q=${encodeURIComponent(gfQuery)}`,
    },
    {
      id: 'momondo',
      name: 'Momondo',
      note: 'Often finds the lowest OTA fare',
      url: `https://www.momondo.com/flight-search/${o}-${d}/${departDate}${rt ? `/${returnDate}` : ''}?sort=price_a`,
    },
    {
      id: 'kayak',
      name: 'Kayak',
      note: 'Price forecast + hacker fares',
      url: `https://www.kayak.com/flights/${o}-${d}/${departDate}${rt ? `/${returnDate}` : ''}?sort=price_a`,
    },
    {
      id: 'kiwi',
      name: 'Kiwi.com',
      note: 'Self-transfer combos other sites miss',
      url: `https://www.kiwi.com/en/search/results/${lo}/${ld}/${departDate}/${rt ? returnDate : 'no-return'}`,
    },
  ];
}

/** Aviasales search URL, used as the booking link for Travelpayouts fares. */
export function aviasalesSearchUrl({ origin, destination, departDate, returnDate = null, marker = '' }) {
  const path = `${origin}${ddmm(departDate)}${destination}${returnDate ? ddmm(returnDate) : ''}1`;
  const tag = marker ? `?marker=${encodeURIComponent(marker)}` : '';
  return `https://www.aviasales.com/search/${path}${tag}`;
}
