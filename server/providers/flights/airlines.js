// Common airline IATA codes -> display names. Unknown codes are shown as-is.
const NAMES = {
  AA: 'American Airlines', AC: 'Air Canada', AF: 'Air France', AY: 'Finnair', AZ: 'ITA Airways',
  B6: 'JetBlue', BA: 'British Airways', CX: 'Cathay Pacific', DL: 'Delta', DY: 'Norwegian',
  EI: 'Aer Lingus', EK: 'Emirates', EY: 'Etihad', FR: 'Ryanair', IB: 'Iberia', JL: 'Japan Airlines',
  KL: 'KLM', LH: 'Lufthansa', LX: 'SWISS', NH: 'ANA', NK: 'Spirit', OS: 'Austrian', QF: 'Qantas',
  QR: 'Qatar Airways', SK: 'SAS', SQ: 'Singapore Airlines', TK: 'Turkish Airlines', TP: 'TAP Air Portugal',
  U2: 'easyJet', UA: 'United', VS: 'Virgin Atlantic', VY: 'Vueling', W6: 'Wizz Air', WN: 'Southwest',
  AK: 'AirAsia', W4: 'Wizz Air', W9: 'Wizz Air', HV: 'Transavia', TO: 'Transavia', EW: 'Eurowings', D8: 'Norwegian',
  BT: 'airBaltic', LS: 'Jet2', RK: 'Ryanair', AL: 'Malta Air (Ryanair)', V7: 'Volotea', HG: 'HiSky', OU: 'Croatia Airlines', LO: 'LOT', A3: 'Aegean', PC: 'Pegasus', N0: 'Norse Atlantic', FI: 'Icelandair',
};

export function airlineName(code) {
  if (!code) return 'Unknown airline';
  return NAMES[String(code).toUpperCase()] || String(code).toUpperCase();
}
