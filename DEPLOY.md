# ProtoTrip online (Render)

ProtoTrip runs at **https://prototrip.onrender.com** on Render's free plan (Frankfurt). Every push to the `main` branch
of `github.com/jackrengelink/prototrip` (private) is built and deployed automatically.

> Koyeb was the first choice, but since Mistral bought it (2026) it no longer accepts new free accounts.

## How it's set up

| Setting on Render | Value |
|---|---|
| Source | GitHub `jackrengelink/prototrip`, branch `main`, auto-deploy on |
| Language / builder | Docker (uses the `Dockerfile` in the repo) |
| Region · plan | Frankfurt (EU Central) · Free |
| Health check path | `/healthz` |
| Environment variables | `TRAVELPAYOUTS_TOKEN`, `SERPAPI_KEY`, `GEOAPIFY_KEY`, `CONTACT_EMAIL` (and `RYANAIR=on`) |

Don't set `PORT`: Render picks it and the app listens on whatever Render says. On Render (which sets `RENDER=true`)
the app listens on `0.0.0.0` and trusts Render's proxy by itself, so it also works if the service runs as plain
**Node** (build command `npm install`, start command `npm run start:once`) instead of Docker.

## Open to everyone
There is no login: anyone with the address can use the site. Each address gets at most 90 requests a minute. Visitors
share the 250 monthly SerpApi searches; when those run out, Google Flights fares drop out and the other sources keep working.

## Free plan behaviour
- After **15 minutes** without visitors the server sleeps; the next visit takes **~50–60 seconds** to wake it,
  then it's fast again.
- 750 free hours a month (enough for one service running all month) and ~5 GB of data a month.

## Updating
Commit and push to `main`. Render rebuilds by itself, and you can follow it under *prototrip → Events / Logs*.

## If something's off
- **Fares missing online but fine at home?** Ryanair or FlixBus may block requests from data centres. Check
  *Logs* for lines like `[flights] ryanair ... failed`. Travelpayouts (your key) keeps working either way.
- **Build failed?** *Events* shows the build log; the usual cause is a typo in a recent change. Run `npm test` locally first.