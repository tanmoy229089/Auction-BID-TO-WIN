# Bid-to-Win: The Grand Reopening

A real backend for the tournament: player registration with photos, auction-based
team assignment, a leg-by-leg point table, and a server-authenticated organizer
panel. No external npm packages — pure Node.js — so there's nothing to fight
with `npm install` on any host.

## What's real here vs. the earlier version

- Admin login is checked **on the server**. The password itself never ships to
  the browser — only a session cookie does, after a correct login.
- Registration open/close, player edits, team assignment, captains, and the
  point table are all enforced by the API, not just hidden by the UI.
- Player photos are stored as real files on disk under `/uploads`, referenced
  by URL — not stuffed into the page as base64.

**Still worth knowing:** this uses a JSON file as its database (`data/db.json`).
That's genuinely fine for a single tournament with a few hundred players — but
it's not built for many people writing at the exact same instant, and some
free hosts wipe local files on redeploy (see hosting notes below).

---

## 1. Run it locally

Requires [Node.js](https://nodejs.org) 18 or newer. No `npm install` needed.

```bash
cd bidtowin-app
cp .env.example .env
node scripts/hash-password.js "@liveauction@2026"
# paste the two printed lines (ADMIN_PASSWORD_SALT / ADMIN_PASSWORD_HASH) into .env
node server.js
```

Open `http://localhost:3000`. The organizer passcode is whatever you passed
to `hash-password.js` — by default the app already ships with the salt/hash
for **`@liveauction@2026`** pre-filled in `.env`, so you can skip the hashing
step and just run `node server.js` if that password is fine to keep.

To change the password later, re-run `node scripts/hash-password.js "new-password"`
and swap the two values in `.env`, then restart the server.

---

## 2. Deploying it to a live URL

You need a host that runs a persistent Node.js process (not a static site
host — this app has a real server). Two good free options:

### Option A — Render.com (recommended, simplest)

1. Push this folder to a GitHub repo (private is fine).
2. On [render.com](https://render.com), click **New → Web Service**, connect
   the repo.
3. Settings:
   - Build command: *(leave blank — no dependencies to install)*
   - Start command: `node server.js`
4. Under **Environment**, add:
   - `ADMIN_PASSWORD_SALT` and `ADMIN_PASSWORD_HASH` (from step 1 above)
   - `PORT` is set automatically by Render — you don't need to add it.
5. Deploy. Render gives you a free `*.onrender.com` URL immediately.

**Important:** Render's free web services use an ephemeral filesystem —
`data/db.json` and anything in `/uploads` can be wiped when the service
restarts or redeploys. For a short-lived tournament this is often fine
(export your CSV and download player cards before the event wraps up), but
if you want registrations to survive indefinitely, upgrade to a Render
instance with a persistent disk, or ask me to swap the JSON file for a
real hosted database (see "Growing past this" below).

### Option B — Railway.app

Same idea: connect the repo, set the two env vars, start command
`node server.js`. Railway's free trial includes persistent volumes, which
suits this app's file-based storage better than Render's free tier.

### Connecting your own domain

Both Render and Railway let you add a custom domain under the service's
**Settings → Custom Domain**. You'll add a CNAME (or A record, depending on
the host) at your domain registrar pointing to the URL they give you. This
part happens on your domain registrar's dashboard (Namecheap, GoDaddy,
Cloudflare, wherever you bought the domain) — the host will show you exactly
which record to add once you type in your domain name.

---

## 3. Project structure

```
bidtowin-app/
  server.js            Main HTTP server + all API routes
  lib/
    db.js               JSON-file data layer, standings calculation
    auth.js              Password hashing (scrypt) + session tokens
  scripts/
    hash-password.js     CLI to generate a new admin password hash
  public/
    index.html            Frontend markup
    styles.css             All styling
    app.js                  All frontend logic (fetch calls to the API)
    assets/                 Team crests + tournament banner
  uploads/                Player photos land here at runtime
  data/db.json            Players, matches, registration status
  .env                    PORT + admin password salt/hash (never commit this)
```

## 4. API overview

Public (no login):
- `GET /api/teams`, `/api/players`, `/api/players/recent?limit=8`,
  `/api/standings`, `/api/matches`, `/api/registration-status`
- `POST /api/register` — blocked while registration is closed

Admin (requires a session cookie from `/api/admin/login`):
- `POST /api/admin/login` `{password}` / `POST /api/admin/logout`
- `POST /api/admin/registration-status` `{open}`
- `PUT /api/admin/players/:id`, `DELETE /api/admin/players/:id`
- `POST /api/admin/players/:id/assign` `{teamId}`, `/unassign`, `/captain`
- `POST /api/admin/matches` `{teamA, teamB, legs: [...5 legs]}`,
  `DELETE /api/admin/matches/:id`
- `GET /api/admin/export.csv`

## 5. Growing past this

If the tournament grows (money on the line, hundreds of concurrent players,
need for real backups), the two upgrades worth doing are: swap the JSON file
for a proper database (Postgres via Supabase/Railway is a natural fit), and
move photo storage to object storage (S3/Cloudflare R2) instead of local
disk. Both are contained changes — mainly `lib/db.js` and the photo-saving
logic in `server.js` — happy to help with either when you're there.
