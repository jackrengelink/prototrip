# API keys: what you need, how to get them, and the real limits

**Short version: you don't need any keys.** ProtoTrip works out of the box with live prices and real
things-to-do, because its default sources are free and keyless:

| What | Source | Key? | Limit |
|---|---|---|---|
| Flights (live) | **Ryanair fare finder**: the same public endpoint ryanair.com uses | None | No published quota. Results are cached for 20 min. |
| Things to do | **Wikipedia** (sights, photos, popularity) + **Wikivoyage** (see / do / eat / drink, with prices and hours) | None | Wikimedia asks for fair use. We make 3–4 requests per "What to do?" click, cached for 24 h. |
| Airports | Travelpayouts open airport data (10,000+ airports) | None | Downloaded once a week into `.cache/` |
| Weather | Open-Meteo | None | 10,000 calls a day for non-commercial use |

Places are **only** looked up when someone clicks *"What to do in …?"*. The deals screen and the
flight view never touch them.

## "Forever, without limit": the honest answer

No official flight API is free *and* unlimited. Airlines and Google pay for every search. The closest you
can get, which is what ProtoTrip does:

1. **Ryanair's fare finder** has no key and no quota. It's unofficial, meaning Ryanair could change or block
   it someday. If that happens, ProtoTrip logs a warning and keeps working with the other sources (or demo fares).
   It covers Ryanair only, but for cheap European trips from Eindhoven, Weeze, Cologne and Charleroi
   that's where most crazy deals live.
2. **Travelpayouts** (below) is free forever and allows hundreds of requests *per minute*. For a committee
   tool that is effectively unlimited. It adds every other airline (Transavia, easyJet, Wizz, KLM, long-haul).
3. **Caching**: identical searches within 20–30 minutes reuse earlier answers, so ten people clicking around
   don't multiply the calls.

**Recommended setup:** no keys (Ryanair) + a free Travelpayouts token. Skip SerpApi unless you
want Google Flights checks for long-haul.

## Optional keys

Copy `.env.example` to `.env`, paste keys in, then restart:

```bash
npm start
```

### 1. Travelpayouts: recommended (free, effectively unlimited)
Adds all other airlines (cached prices that Aviasales users found in the last few days).
1. Sign up at **https://www.travelpayouts.com** (free; it's an affiliate network).
2. Go to **Profile → API token** and copy the token.
3. Put it in `.env` as `TRAVELPAYOUTS_TOKEN=...`.

- **Limits:** 300–600 requests per minute on the price endpoints. A search costs about 2 requests per home airport.
- **Earn back (optional):** set `TRAVELPAYOUTS_MARKER` to your affiliate id and bookings made through the links pay
  a small commission. That could go to the committee budget.

### 2. SerpApi: optional (Google Flights, limited)
Live Google Flights prices. Only useful for double-checking long-haul.
- Sign up at https://serpapi.com/users/sign_up, then copy the key from your dashboard into `SERPAPI_KEY`.
- **Limit:** about 250 free searches a month. ProtoTrip only uses it for the first 3 home airports, and only on
  searches with a specific destination, to save quota.

### 3. Geoapify: optional (no longer needed)
Extra restaurants and bars from OpenStreetMap, on top of Wikivoyage.
- https://myprojects.geoapify.com: create a project, then copy the key into `GEOAPIFY_KEY`.
- **Limit:** 3,000 credits a day. A "What to do?" click uses 2 requests (a few credits), so you get roughly
  hundreds of clicks a day. Only spent when someone clicks "What to do?".

### 4. Viator: optional (bookable tours)
- https://partnerresources.viator.com: sign up as an affiliate, then **Tools → Affiliate API**, and copy the key
  into `VIATOR_KEY`. Free "Basic Access", no approval needed.

## Turning Ryanair off
If you'd rather not use the unofficial endpoint, set `RYANAIR=off` in `.env`.
