# U2berClub Tools — creator platform

Invite-only hub for U2berClub's creator tools. Each approved creator signs in and gets
their **own private workspace** — their SAVEDREELS notes, teardowns, etc. are stored per
user in Postgres and never visible to anyone else.

## How it works
- **Signup is invite-code only.** Admin generates codes in the Admin panel and hands them out.
- New signups land as **pending** → admin approves → account goes **active** → tools unlock.
- **Admin panel**: approve/block users, mint invite codes (with usage limits).
- **Per-user data**: every tool's data is keyed to the signed-in user. Airtight isolation.
- **Tool hub**: a dashboard of tools. SAVEDREELS is live; add more by dropping a component
  in `client/src/tools/` and a line in `server/tools.js`.

## Stack
React + Vite (client) · Express + Postgres (server) · cookie sessions · scrypt passwords.
No third-party auth service — it all runs on your VPS.

## Deploy to your VPS (one command)
On a fresh Ubuntu VPS as root, with the repo copied up:
```bash
bash deploy-vps.sh tools.u2berclub.com you@email.com atul@u2berclub.com "a-strong-admin-password"
```
This installs Node + Postgres + nginx, creates the database, builds the app, starts it under
PM2, and gets HTTPS. First admin account is seeded from the email/password you pass in.

Point `tools.u2berclub.com`'s DNS A-record at the VPS IP **before** running (for SSL).

## Local development
```bash
# 1. a local Postgres running, then:
createdb u2berhub
export DATABASE_URL="postgres://you@localhost:5432/u2berhub"
export ADMIN_EMAIL="atul@u2berclub.com" ADMIN_PASSWORD="adminpass123"
# 2. build client + run server
npm install && npm run build && npm start
# open http://localhost:4000
```
For hot-reloading the UI: `cd client && npm run dev` (proxies /api to :4000).

## Adding a tool
1. `server/tools.js` — add `{ id, name, tagline, status:"live" }`.
2. `client/src/tools/YourTool.jsx` — build it; read/write via `/api/data/<toolid>`
   (GET returns your data object, PUT merges it, DELETE removes a key). Already scoped to the user.
3. `client/src/App.jsx` — add a route line for `/tool/<id>`.

## Security notes
- Passwords: scrypt with per-user salt. Sessions: random httpOnly cookies, 30-day expiry.
- The Claude "Ask your reels" box needs an API key server-side; it's off by default here.
  Say the word and I'll wire it to a shared key or the key-free paste flow.
- Add HTTP basic-auth or IP allowlist in nginx if you want the whole site private during beta.


## Per-user vault (v2)
Each creator's uploaded reels are now saved to their account, not just their browser.
- On first upload, the parsed vault is stored server-side under the user (`savedreels_vault`).
- On login from ANY browser/device, it auto-loads — no re-upload needed.
- "Load different files" clears the stored vault and lets them upload a fresh export.
- Notes and the vault are stored separately, both per-user, both isolated.


## Tools included
- **SAVEDREELS** — Instagram saved-reel vault, per-user, cross-device.
- **CONTENTFLOW** — content pipeline tracker (Inspiration → Idea → Script → Shoot → Edit).
  Served at `/contentflow/`, all data per-user via `/api/contentflow/*` in Postgres.


## SAVEDREELS -> CONTENTFLOW wire-up
Inside any ContentFlow project's Inspiration stage, **"⚡ Pull my saved reels"** fetches the
creator's own SAVEDREELS vault + notes directly (no CSV). A picker lets them search/filter by
collection, defaults to the reels they've annotated, and imports selected reels as inspiration
references — carrying the "why I saved this" note across. All per-user, all server-side.


## Shot breakdown (Inspiration -> Script)
Each inspiration reel has a **Break down shots** button. It opens a study modal with the
video (Instagram embed, or upload the file for exact timestamps + a "grab current time"
button). For each shot you capture a timestamp, a shot type / angle / movement from the
U2berClub shot vocabulary, and a note. Those captured shots then appear as a **reference
panel at the top of the Script section** — so every dialogue block is written next to the
actual shots you studied. **Click any captured shot** to stamp its type / angle / movement
(and note) straight into the block form below — no re-typing. All per-user, saved with the project.


## Mood canvas (Inspiration)
The Inspiration stage has a free-drag **mood canvas** (Milanote/Figma-style):
- **Capture from video** — upload a reel, scrub to a moment, grab the exact frame as an image on the board.
- **Add image** — upload your own screenshots.
- **Add note** — text frames.
- Drag frames anywhere; positions persist. Each frame carries a timestamp, shot type / angle /
  movement (from the shot vocabulary), a note, and a **color role tag** (Hook, B-roll, Talking,
  Text/GFX, Transition, CTA/End).
- Images are stored in a dedicated `canvas_images` table (not the project JSON), per-user and
  access-controlled — one user can't fetch another's frame.


## Project lifecycle (Idea-first + Post stage + dates + delete)
- Stages reordered: **Idea → Inspiration → Script → Shoot → Edit → Post** (a project starts
  with the raw idea, then gathers inspiration for it).
- **Per-stage date bar** under the tabs on every stage — manually set when you started each
  stage, building a real timeline of the project's life.
- New **Post stage**: log views, watch time, retention %, saves, shares, comments, post URL
  and notes, plus upload the **retention screenshot** from Instagram Insights.
- **Delete project** button (with confirm) removes the project and all its data.
- Old projects auto-backfill the new fields on load, so nothing breaks on deploy.


## TRENDS — community reel directory + publishable lists
The first tool with **deliberately shared** data.
- **Directory** (`trend_reels`) — shared across all approved creators. Anyone adds a reel
  (link + category + tags); deduped by normalised URL so the same reel is one entry.
  Admin can remove anything.
- **Notes** (`trend_notes`) — private per user, per reel: why it works + hook points.
  Two creators see the same reel but only their own notes.
- **Lists** (`trend_lists`) — named collections; **publish** to get a public URL at
  `/list/<username>/<slug>`, readable with no login. Published lists include the
  creator's notes — the UI warns about this before they write and again at publish time.
- **Usernames** — creator-chosen, uniqueness-checked, reserved words blocked so a username
  can never shadow a real route (`api`, `admin`, `contentflow`, ...).
- **Import from SAVEDREELS** — bulk-add reels from your own vault to seed the directory.
- Public pages are served from a standalone `list.html` (separate Vite entry), marked
  `noindex` since lists are unlisted rather than fully public.


### Trend entries publish as an article (magazine style)
Each reel in the directory carries **trend name**, **description of the trend**, **how many
reels were made with it**, and a **publish date**. A published list renders as an article —
each trend is a section: heading, description paragraph, stats line, the reel embed beside
the curator's "why it works" and "hook points", tags, and a Watch-the-reel link.

Published lists render as a dated roundup: a **Content** table of contents, entries grouped
under **month headings** (newest first), and each trend as *Trend: Name — 7 August 2026*
with a bold **Trend Recap:** paragraph, an **Audio:** line linking the sound, a stats line,
the reel embed, a Watch-on-Instagram link, then the curator's Why-it-works / Hook-points notes.
Fields per trend: trend name, description, reels made with it, publish date, audio name + link.
