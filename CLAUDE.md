# SF Radar — Project Memory

Read this file at the start of every session, before doing anything else.
It exists because context gets wiped (`/clear`, session restarts) and this
project has hard constraints that must never be re-derived from guessing.

## What this is

A live dashboard ranking real SF tech/startup/investor events for someone
with ~14 nights in San Francisco and no local network yet. Built for a
30-minute conversation on **Monday** with the founders of a program that
hosts short-stay cohorts in SF. Timeline is compressed to ~4 days.

Repo: github.com/alexkoukos/sf-radar-ingest (public)

## Non-negotiable architecture decisions — do not revisit these

- **Java is a standalone batch job. Never a server, never Spring Boot,
  never a REST controller.** Fetch → normalize → score → upsert → exit.
- **Frontend (Vite + React) talks directly to Supabase via PostgREST.**
  No custom Java API layer, ever.
- **All filtering/sorting/time-window logic lives in SQL**, specifically
  in `get_dashboard_events(p_days)`. Java only computes time-invariant
  semantic scores. Java never pre-splits events into UI sections.
- **No mock, synthetic, or hand-authored event data anywhere in
  production.** Real data only. (An earlier draft treated mock fixtures
  as the primary backbone — that was wrong and fully reversed.)
- **Data source is Luma's embedded page JSON** (Next.js streamed
  `self.__next_f.push(...)` chunks on luma.com/sf and calendar pages) —
  NOT the ICS feed (no discoverable unauthenticated URL) and NOT the
  official API (paid, per-calendar, wrong scope).
- Recorded fixtures (frozen real HTTP responses) are allowed **only** in
  `src/test/resources/`, for parser tests. Never reachable from
  production code.
- **No ingestion-time keyword gate.** Keyword matching is a scoring
  input only (`KeywordScorer`), never a filter that discards events.
  Source curation (which calendars are scraped) is the relevance filter.
- **Accessibility is a first-class, co-equal scoring signal** alongside
  keyword/host/venue relevance — free + open-RSVP events should score
  competitively with investor-heavy paid/invite-only ones. This is the
  product's actual thesis, not a nice-to-have.
- Timezone: **all date/window logic is anchored to `America/Los_Angeles`
  inside Postgres** (`la_window_start()`), never UTC, never JVM default,
  never browser locale. Dev machine is in Athens — this is the single
  most likely silent-bug source.
- Dedupe key: Luma's own **global event id** (`source_event_id`), not
  scoped per scrape-target — the same event found via two different
  pages must collapse to one row. `discovered_via` is observability
  only, unioned across runs, never part of the dedupe key.
- Ghost events: never hard-deleted. `last_seen_at` + a **24-hour grace
  window** in `get_dashboard_events` lets transient single-target
  failures self-heal while genuinely cancelled events still clear.
- Run-level failure is a **total-failure gate only** (zero events across
  all targets, or a structural shape-match break). A single target
  502-ing is logged per-target in `ingestion_runs.source_summary` and
  does NOT fail the run or touch the DB.
- Fail-loud persistence: any total failure skips the upsert entirely —
  `events` table is provably untouched, last good snapshot stays live.

## Open / branch-dependent decisions — resolved Day 1

- **Location data**: confirmed rich. 20/20 sampled events on luma.com/sf
  had city/sublocality/region/country_code and lat/long (some exact
  address + Google place_id, some privacy-obfuscated coordinates for the
  venue-type meetups). `LocationFilter`/`VenueScorer` stay in the plan.
- **Volume**: confirmed sparse, as suspected. luma.com/sf gives ~20
  events clustered in a 24-48h window. The two placeholder calendars in
  luma-sources.json are even thinner (1 and 2 events each). Day 3's
  10-15 curated calendars are load-bearing for density, not padding.
- **Fetch origin**: resolved via the first live `ingest.yml` run
  (2026-07-23, GitHub-hosted ubuntu runner, US). Same 20/1/2 per-target
  counts as the Greece dev machine — no observed geographic difference.

## Deployment (load-bearing, not just for the demo)

- `.github/workflows/ingest.yml` — cron every 6h + `workflow_dispatch`,
  runs the Java batch job against production Supabase via the
  **Supavisor session pooler** connection string (not direct — GitHub
  runners commonly lack reliable IPv6 egress).
- `.github/workflows/keepalive.yml` — separate daily cron, one curl GET
  against PostgREST with the anon key. Fully decoupled from `ingest.yml`
  so a broken parser can never silently pause the Supabase free-tier DB
  (auto-pauses after 7 days idle → HTTP 540).
- Vercel (`sf-radar-web`) — static Vite build, auto-deploy on push, env
  vars set in the Vercel dashboard (not just local `.env`).
- Anon key is safe in the shipped bundle only because RLS restricts it
  to SELECT. Service-role/direct credentials live only in GitHub Actions
  secrets and the local Java `.env` — never anything Vite-prefixed.

## Current 4-day plan (compressed from original 5-day plan)

- **Day 1 (today/Fri)**: resolve location/volume/origin unknowns first,
  schema + `la_window_start()`/`get_dashboard_events()`, scaffold both
  projects, frozen fixture + schema canary test, Vercel deploy skeleton
  live against cloud Supabase.
- **Day 2 (Sat)**: full pipeline against real scraped data — normalize,
  dedupe, accessibility extraction (typed fields, not prose-mining),
  scoring, upsert with fail-loud boundary. **Hard checkpoint: live URL
  with real ranked data by Saturday night.**
- **Day 3 (Sun)**: calendar curation (10-15 verified SF tech community
  calendars — reduced from 20-40 given compressed timeline), weight
  tuning against real data, GitHub Actions workflows live and verified.
- **Day 4 (Mon, morning only)**: buffer. No new code. Trigger
  `workflow_dispatch` ~1h before the call so "last updated" is fresh.

Cut list if time runs out, in order: category chips → Tonight/This Week
tabs (Your Stay alone carries the story) → `newcomer_friendly` flag →
`HostScorer` tier list (default everyone equally).

## Non-negotiable presentation constraints

- No program name, no logo, anywhere in UI or README — the pitch is
  general usefulness, not flattery.
- Ranking is never hand-curated or staged. Tune weights, then narrate
  whatever real data actually produces — including an awkward result.
- Gift to the founders is **the URL only** — no repo handover, no
  transferred ownership. Maintenance is on the user indefinitely.

## Ignore

`.github/modernize/` (JDK 21→25 modernization) — unrelated tooling run,
not part of this project's plan.