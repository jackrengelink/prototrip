# ProtoTrip: find the crazy deal, plan the whole trip

A trip finder for **S.A. Proto** (Creative Technology, University of Twente). It scans every airport you can reach
by train from Enschede, puts the **crazy deals first**, and turns any deal into a full trip: the flight out (with your
train to the airport), a day-by-day plan, and the flight home.

> Open it and you land straight on this week's crazy deals from NL & nearby: say Nice for €58 from Schiphol,
> 56% below normal. Click it and you get the boarding pass ("🚆 2h15 from Enschede to AMS"), real weather, and days like
> *"Around Place Masséna"*, with sights grouped by neighbourhood, walking times, lunch and dinner spots, and a
> "head to the airport" reminder timed to the flight.

See **[RESEARCH.md](RESEARCH.md)** for which flight sites are best and which APIs are usable in 2026.

## Run it

Needs Node.js 22 or newer. There are no dependencies to install.

```bash
npm start
```

Then open http://localhost:5173.

**No API keys needed.** Out of the box you get live Ryanair fares from every nearby airport, live FlixBus/FlixTrain trips, things to do from
Wikipedia + Wikivoyage, and Open-Meteo weather. For more airlines, add a free Travelpayouts token.
**[API-KEYS.md](API-KEYS.md)** explains how to get each key and what the limits really are.

## What it's tuned for

Two modes, switched with the tabs at the top of the search:

### ✈ Fly
- **Home = "Netherlands & nearby".** *Which airports?* picks one of three sets:
  - *Dutch only*: Schiphol, Eindhoven, Rotterdam, Groningen
  - *NL + German border* (the default): adds Münster/Osnabrück, Düsseldorf, Weeze and Cologne
  - *+ Belgium*: adds Brussels and Charleroi
- **Two numbers per fare.** The flight price, plus a rough return train or bus ticket from Enschede to the airport:
  "€46 + €30" means a €46 flight and ~€30 to Weeze. Lists always run from the lowest flight price up. The deal label
  still looks at both together, so a €34 flight from Charleroi (+ ~€100) doesn't count as crazy.
- **A whole country as destination.** Type a country in *To* (or pick "Spain · all airports · ES") to see every flight we
  can find from your From airport(s) to that country: one row per airline per route, with *How far?* ignored. Google
  Flights fills in airlines like KLM and TAP, using 3–6 of the 250 monthly SerpApi searches per new country and date
  (saved for 6 hours). Google's fares are for your exact dates; Ryanair's can be ±3 days.
- **Fly home from another airport.** With a country or city in *To*, ProtoTrip pairs two Ryanair one-way tickets: fly into
  Porto and home from Faro, or leave from Eindhoven and come back to Weeze. The airports at the destination are at most
  600 km apart, because you make that hop yourself. These are 2 separate bookings, marked "2 tickets", and they use no
  Google searches. Other airlines and "Anywhere" searches stay normal returns.
- **Flexible dates.** ±3 days around your dates; the trip length stays within a night.
- **How far?**
  - *Europe-ish*: flights up to about 4.5 hours
  - *Europe + crazy long-haul* (the default): far places only appear when they're crazy cheap
  - *Whole world*: everything

- **On the trip page, for one fare:**
  - *Cheapest days*: Ryanair's lowest one-way price per day, for the way out and the way home. Pick a day to move the
    trip there. It hides itself on routes Ryanair doesn't fly.
  - *What it really costs*: the ticket and train, a tick box for a 10 kg cabin bag (low-cost airlines only), a tick box
    for hostel, food and transport, and the total for your group. These are estimates. The daily budget comes from
    the Europe Backpacker Index 2025; the group warning is there because fares don't say how many seats are left.
  - *Share trip*: a ready-made message with the price, dates and link, or straight to WhatsApp.

### 🚌 Bus & train
- **Straight from Enschede** by FlixBus and FlixTrain: no airport, no hassle. Every trip-worthy destination
  within 10 hours (Berlin, Paris, Brussels, Hamburg, Bruges, Lille, Potsdam…). Small towns, airport stops and
  Dutch cities are left out; Dutch cities are opt-in, since most students already travel there free with their student OV.
- **ProtoTrip's sweet spot is €50–70 return per person.** The bus & train crazy line grows with distance but
  tops out at €50, and anything up to about €70 counts as a great price.
- The deal list shows "from" prices (the cheapest seat each way). Opening a trip searches the exact connections for your dates,
  both ways, and picks the best one, with a few euros' allowance for every hour saved. It also lists the alternatives and links to FlixBus to book.
  The first live test found Berlin at €46.98 return on direct buses.

### Both modes
- **The map** is on top, full width. Every destination is a dot coloured by deal tier. Click a deal or a dot to see
  its route: the dashed train line to the airport, then the flight, or the bus/train line from Enschede.
  Scroll over the map to zoom; satellite view is in the top-right corner.
- **Two steps per trip.** Clicking a deal shows the trip (connections, weather, route map). *"What to do in …?"* then
  loads sights, food, drinks and the day-by-day plan; only that click looks anything up.
- Euros, dark mode by default (☀ for light, which turns the deal board light too), and Proto's lime and cyan.

## What counts as a crazy deal

Two things are combined. A deal is **crazy** when either is true:

1. **Cheap for the distance.** It's under the trip's *crazy line*, which grows with distance:

   | Return trip | Crazy line |
   |---|---|
   | London | €45 |
   | Barcelona | €69 |
   | Málaga | €86 |
   | Tenerife | €123 |
   | New York | €194 |

   The formula is `35 + 0.027 × km` euros for a return; a one-way gets 55% of that.
2. **A big real discount.** It's 45% or more below the route's *real* normal price, and no more than 2× the
   crazy line. The normal price comes from one of these, in order:
   - Google's typical price
   - Ryanair's earlier price
   - this month's fares on the route
   - the fares we found to that city from all the nearby airports

Each card shows ✓ chips for the reasons it qualifies, plus the % off. When there's no real price data, the % is
compared with a typical fare for the distance. That number is shown but never makes a deal crazy by itself.
The score blends both, so a fare that is cheap for the distance *and* a big discount ranks highest.

## How the itinerary is built

1. Sights come from up to 500 Wikipedia articles near the centre, ranked by size and pageviews. Restaurants,
   bars and activities come from Wikivoyage's traveller listings, with prices and hours. Must-sees get a boost,
   and your interests add weight.
2. Arrival and departure days get fewer slots, based on flight times.
3. Each day is anchored on a headline sight. The best areas go on the first full days.
4. Each day is ordered as a walking route, with walk or transit times. Meals and drinks go to the nearest good spot.

## Booking

ProtoTrip doesn't sell tickets. Every flight links to the fare, and to the same search on Skyscanner,
Google Flights, Momondo, Kayak and Kiwi.com. Always confirm the price there before the committee commits.

## Develop

```bash
npm test
```

```bash
npm run coverage
```

`npm start` restarts the server by itself when code in `server/` or `.env` changes. Front-end files in `public/`
are picked up on a page refresh. Use `npm run start:once` for a run that doesn't watch for changes.

```
server/
  index.js, app.js        HTTP server, routes, security headers, rate limiting
  trip.js                 assembles a full trip
  data/airports.js        airports, home airports + train times from Enschede
  lib/                    deal scoring, itinerary algorithm, validation, links, cache
  data/directory.js       public airport directory (cached in .cache/)
  providers/flights/      ryanair (keyless), travelpayouts, serpapi, demo engine; multi-origin + reach filter
  providers/places/       wikipedia, wikivoyage (keyless), geoapify, viator (optional)
  providers/weather.js    Open-Meteo geocoding and weather
public/                   front end (vanilla JS modules, no build step)
test/                     node:test suites
```

## Known limits

- Demo fares only appear if every live source fails (no internet, Ryanair blocked).
- The Ryanair endpoint is unofficial: free and keyless, but Ryanair could change it. Add Travelpayouts as a backup.
- Travelpayouts prices are cached (2–7 days old), so they can be gone by the time you click.
- Train times from Enschede are rough door-to-gate guides, not timetables.
- Without a SerpApi key the flight home has no exact time, so the last day assumes a 17:00 departure.
