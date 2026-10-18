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
| Environment variables | `ACCESS_PASSWORD`, `TRAVELPAYOUTS_TOKEN`, `SERPAPI_KEY`, `GEOAPIFY_KEY`, `CONTACT_EMAIL` (and `RYANAIR=on`) |

Don't set `PORT`: Render picks it and the app listens on whatever Render says.

## Logging in
Anyone opening the site gets the ProtoTrip login page and only needs the **committee password** (`ACCESS_PASSWORD`).
After logging in, a device stays logged in for 30 days. `/logout` logs out. This works in every browser, including
WhatsApp and Instagram's built-in ones. After 10 wrong passwords from one address, that address has to wait 10 minutes.

**Changing the password:** in Render go to *prototrip → Environment*, edit `ACCESS_PASSWORD`, then save
(Render redeploys). This also logs everybody out.

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
- **Locked out?** Wait 10 minutes after too many wrong passwords.
