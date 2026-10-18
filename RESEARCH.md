# Research: finding cheap flights, and APIs an app can use

Compiled October 2026. Some pricing and free-tier numbers below come from vendor blogs.
Check each provider's own pricing page before you rely on a number.

---

## Part 1: The best sites for cheap or good flights

No single site finds the lowest fare every time. Experienced deal hunters use two or three
sites together, and each one has a different job.

### Tier 1: The search engines (metasearch)

| Site | Best at | Weak spots |
|---|---|---|
| **Google Flights** | Fastest search. Its date grid, price graph and **Explore** map show the cheapest dates and places. It also has price tracking and price insights such as "prices are low". | It leaves out many small online travel agencies (OTAs). It does not show hidden-city fares, self-transfer combinations or error fares from consolidators. |
| **Skyscanner** | "Everywhere" search to find the cheapest destination for your dates, and "whole month" search for flexible dates. It covers a wide range of OTAs and budget airlines and works well in Europe and Asia. | Sometimes shows "ghost fares": a cheap OTA price that disappears or goes up when you click through. |
| **Momondo** (Kayak group) | Often finds the absolute lowest fare because it checks hundreds of small OTAs. Frommer's 2026 test rated it best overall. | Slower to search. Some small OTAs have poor customer service. |
| **Kayak** | A full travel planner with a price forecast ("buy or wait"), hacker fares (two one-way tickets) and good filters. | Slower, and sometimes more expensive than the cheapest option. |
| **Kiwi.com** | **Virtual interlining**: it combines airlines that don't partner with each other (for example a budget carrier plus a full-service one) into cheaper self-transfer trips, and protects them with the Kiwi Guarantee. | Self-transfer risk if a flight is delayed. Its fees can make the price less attractive. |

### Tier 2: Power tools for specialists

- **ITA Matrix** (matrix.itasoftware.com): Google's fare engine for experts. It handles complex routing codes,
  fare classes and multi-city trips. You can't book on it, but you can copy the itinerary to an airline or OTA.
- **Skiplagged**: **hidden-city ticketing**. You book A→B→C and get off at B. This can save a lot, but only on one-way
  trips with carry-on bags only. Airlines don't allow it and can close frequent-flyer accounts, and
  American Airlines has sued Skiplagged.
- **Azair**: European budget-airline combinations (Ryanair, Wizz, easyJet), with flexible date ranges and
  "around" airports.
- **Hopper**: price prediction plus "price freeze". Mobile only.

### Tier 3: Deal and error-fare alert services (the "crazy deals")

These are people plus software that watch for mistake fares and big sales and alert you right away:

- **Going** (formerly Scott's Cheap Flights). US focused. It tracked a record number of mistake fares in 2025.
- **Jack's Flight Club**. UK and Europe focused. Sends alerts through a newsletter and WhatsApp.
- **Secret Flying**. Free and global. Famous for spreading error fares on social media.
- **Thrifty Traveler**. US, with alerts from more than 200 airports.
- **HolidayPirates**. Europe, combines flights with packages.

Error fares get fixed fast. Book first (most US bookings can be cancelled free within 24 hours) and plan later.

### The playbook the experts use

1. **Find dates and places** in Google Flights (Explore / date grid) or Skyscanner (Everywhere / whole month).
2. **Check for cheaper sellers** in Momondo and Skyscanner, and **check combinations** in Kiwi.
3. **Compare with the airline directly** before you book. It's often the same price and easier to deal with when things go wrong.
4. **Set alerts** in Google Flights and subscribe to Going, Jack's Flight Club or Secret Flying.

---

## Part 2: APIs an app can actually use

### Big change in 2026: Amadeus Self-Service is gone

Amadeus was the default free flight API for hobby developers. It **paused new sign-ups in early 2026 and
shut down the Self-Service portal on 17 July 2026**. Only the Enterprise portal remains, and it needs a contract
and a travel consultant. Most older tutorials no longer apply.

### Flight data

| Provider | Access | Cost | Data | Verdict for this app |
|---|---|---|---|---|
| **Travelpayouts / Aviasales Data API** | Free sign-up, token from your profile | Free (an affiliate program, so you earn commission on bookings) | **Cached** cheapest prices seen by Aviasales users in the last 2–7 days. `prices_for_dates` for a route or month, and `city-directions` for "cheapest destinations from X". | ✅ **Best free fit for "crazy deal" discovery.** Use it for Everywhere and month-flex searches. Prices are approximate. |
| **SerpApi (Google Flights engine)** | Free sign-up | ~250 free searches a month, then ~$25 per 1k | **Live** Google Flights results plus `price_insights` (typical price range and price level) | ✅ **Best for live prices and deal scoring.** It is a scraper, so check the terms before running a large commercial product. |
| **Duffel** | Self-serve, test mode | Pay per booked order (~$3), searches mostly free | Live NDC/GDS offers, and you can **book inside your app** | ✅ The step up when you want in-app booking. |
| **Ignav, Tripgic, FlightPowers, SearchApi, HasData** | Self-serve | Free tiers, then about $2–25 per 1k | Mostly Google Flights-style data | ⚠️ Newer vendors that replaced Amadeus. Fine as backups. |
| **Skyscanner Partners API** | **Approval only**, for commercial partners | Revenue share | The full Skyscanner engine | ❌ Not available to individuals. Deep-link to Skyscanner instead (this app does). |
| **Kiwi Tequila** | **Invite-only since May 2024** | n/a | Virtual interlining | ❌ Closed. Deep-link to Kiwi. |
| **Google QPX** | Shut down in 2018 | n/a | n/a | ❌ |

### Things to do

| Provider | Access | Cost | What you get |
|---|---|---|---|
| **Wikipedia GeoSearch + Pageviews** | No key | Free (set a User-Agent) | Landmarks near a point, with descriptions, photos and **pageviews as a popularity signal** |
| **Geoapify Places** (OpenStreetMap data) | Free key | **3,000 credits a day** free, 5 requests a second | Sights, museums, parks, restaurants, bars and shops by category |
| **Viator Partner API: Basic Access** | Self-serve affiliate key, no approval | Free, and you earn commission | Bookable tours with ratings, prices, photos and a tagged booking URL |
| **GetYourGuide, Tiqets, TUI Musement** | Partner approval | Commission | Tours, attraction tickets |
| **Foursquare Places** | Key | Free tier cut to **500 Pro calls a month** (June 2026), then ~$15 per 1k | Rich place data, but expensive now |
| **Google Places (New)** | Key + billing | Paid per call, with a monthly credit | The best ratings and photos, but it costs money |
| **Ticketmaster Discovery** | Free key | 5,000 calls a day | Concerts and events during your dates |
| **Open-Meteo** | No key | Free | Weather forecasts and geocoding |

---

## What ProtoTrip uses (and why)

*Updated after live testing on 18 Oct 2026.*

- **Ryanair fare finder** (`ryanair.com/api/farfnd/v4`): keyless, about 100–300 ms, live euro prices, and the
  cheapest return per destination within a date window. It's the best crazy-deal source for Eindhoven, Weeze,
  Cologne and Charleroi. It's unofficial, so it's cached and has fallbacks.
- **Travelpayouts** (free token, 300–600 requests a minute): every other airline, as a backup and for long-haul.
- **SerpApi** is optional (250 searches a month), only for Google Flights checks.
- **Things to do**: **Wikivoyage** (keyless). Its traveller listings for See, Do, Eat and Drink come with coordinates,
  prices and hours: 41 restaurants in Nice, 66 in Rome across districts, 21 in Tirana. **Wikipedia** adds the headline sights and photos.
- **Tried and rejected**:
  - Overpass/OpenStreetMap: all four public servers were overloaded or timing out.
  - Wizz Air: bot wall.
  - Transavia: its developer keys are no longer handed out.
  - Kiwi Tequila: invite-only.
  - Amadeus Self-Service: shut down in July 2026.
- **Deal algorithm**: *price for the distance*. The crazy line is `35 + 0.027 × km` euros for a return trip. Ranking is
  by how far under that line a fare is.

## Sources

- [Going: best travel sites for cheap flights (2026)](https://www.going.com/guides/the-best-travel-sites-for-cheap-flights)
- [Google Flights vs Skyscanner 2026](https://www.travelandtourworld.com/news/article/google-flights-vs-skyscanner-the-ultimate-2026-showdown-for-finding-the-cheapest-flights-which-platform-reigns-supreme/)
- [Best flight search engines 2026 compared](https://flightsinsight.com/best-flight-search-engines-and-booking-platforms/)
- [PhocusWire: Amadeus to shut down self-service APIs portal](https://www.phocuswire.com/amadeus-shut-down-self-service-apis-portal-developers)
- [Ignav: Amadeus Self-Service shutdown migration guide](https://ignav.com/docs/amadeus-self-service-shutdown)
- [Thunderbit: 10 best flight APIs 2026, free tiers](https://thunderbit.com/blog/best-flight-api-with-free-tiers)
- [FlightPowers: Google Flights API benchmark 2026](https://flightpowers.com/guides/flight-api-benchmark-2026)
- [Travelpayouts: Aviasales Data API](https://support.travelpayouts.com/hc/en-us/articles/203956163)
- [Travelpayouts Data API docs](https://travelpayouts-data-api.readthedocs.io/)
- [Viator: technical guide for API partners](https://partnerresources.viator.com/travel-commerce/technical-guide/)
- [Geoapify pricing](https://geoapify.com/pricing)
- [Foursquare pricing](https://foursquare.com/pricing/)
- [IBM Community: best things-to-do APIs 2026](https://community.ibm.com/community/user/blogs/jacobo-weizenblut/2026/04/20/best-things-to-do-apis-partner-platforms-2026-for)
- [Tripgic: free travel APIs in 2026](https://www.tripgic.com/playbook/free-travel-api/)
- [Which?: how to find error fares](https://www.which.co.uk/news/article/error-fare-aIQQR9w9VR5T)
- [Kiwi.com: how to find mistake fares in 2026](https://www.kiwi.com/stories/how-to-find-mistake-fares-in-2026/)
- [Thrifty Traveler: Skiplagged and hidden-city ticketing](https://thriftytraveler.com/skiplagged-hidden-city-ticketing)
