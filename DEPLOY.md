# Putting ProtoTrip online with Koyeb

ProtoTrip runs on Koyeb's free plan: one small server in Frankfurt with HTTPS and an address like
`https://prototrip-<yourname>.koyeb.app`. If nobody visits for an hour it goes to sleep; the next visit wakes it
in a few seconds. Every push to GitHub redeploys it automatically.

## What's already prepared in the code

| Piece | What it does |
|---|---|
| `Dockerfile` | Builds the app on Node 24 (no other dependencies), runs it as an unprivileged user on port 8000 |
| `.dockerignore` / `.gitignore` | Keep `.env` (your keys) and local caches out of GitHub and the server |
| `ACCESS_PASSWORD` | When set, the browser asks for a login. User name `proto` (change it with `ACCESS_USER`), password your choice |
| `/healthz` | A health-check page for Koyeb that needs no password |
| `TRUST_PROXY=1` | Set in the Dockerfile: uses visitors' real IPs (for rate limiting and wrong-password lockout) and forces HTTPS |

## Steps

### 1. Put the code on GitHub (private)
1. On https://github.com/new create a repository called `prototrip`. Make it **Private**, and **don't** add a README or a .gitignore (the project has them).
2. Copy the repository URL (`https://github.com/<you>/prototrip.git`) and push the code. Claude can do this part, and Windows will ask you to log in to GitHub once.

### 2. Create the service on Koyeb
1. Sign up at https://app.koyeb.com. The easiest way is **Continue with GitHub**.
2. **Create Web Service → GitHub**, and allow Koyeb to see the `prototrip` repository (only that one is enough).
3. **Builder:** *Dockerfile* (it's detected automatically).
4. **Instance:** *Free*. **Region:** *Frankfurt*.
5. **Ports / health check:** port `8000`, protocol HTTP, health check path `/healthz`.
6. **Environment variables.** Add these from your local `.env` file, as *Secret* where Koyeb offers it:

   | Name | Value |
   |---|---|
   | `ACCESS_PASSWORD` | a password for the committee (pick something new, not one you use elsewhere) |
   | `TRAVELPAYOUTS_TOKEN` | from `.env` |
   | `SERPAPI_KEY` | from `.env` |
   | `GEOAPIFY_KEY` | from `.env` (optional) |
   | `CONTACT_EMAIL` | from `.env` |

7. **Service name:** `prototrip`, then press **Deploy**. The first build takes a few minutes.

### 3. Open it
Go to the `*.koyeb.app` address Koyeb shows. Your browser asks for a login: user `proto`, plus the password you chose.
Share both with the committee.

## Updating
Change the code, commit and push; Koyeb rebuilds and redeploys by itself. To change a key or the password, edit the
environment variable in Koyeb and press **Redeploy**.

## If something's off
- **Fares missing online but fine at home?** Ryanair or FlixBus may block requests from data centres. The app keeps
  working with Travelpayouts; check the Koyeb **Logs** tab for lines like `[flights] ryanair ... failed`.
- **Slow first page?** The server was asleep. It wakes in a few seconds, then it's quick again.
- **Locked out after typing the wrong password?** After 10 wrong tries from one address, wait 10 minutes.
