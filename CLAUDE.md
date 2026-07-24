

SF Radar — Project Memory
Read this file at the start of every session, before doing anything else. It exists because context gets wiped (/clear, session restarts) and this project has hard constraints that must never be re-derived from guessing.

Status: core sprint is DONE. Real Luma data is ingested, pipeline and dashboard are live. Current phase is visual polish only, hard freeze Sunday evening. Demo is Monday. Do not touch ingestion, scoring, or schema unless explicitly asked — that work is finished and verified.

What this is
A live dashboard ranking real SF tech/startup/investor events for someone with ~14 nights in San Francisco and no local network yet. Built for a 30-minute conversation on Monday with the founders of a program that hosts short-stay cohorts in SF. Timeline was compressed to ~4 days.

The product thesis: with only 14 nights, picking the wrong event has real opportunity cost — the ranking exists to solve that. Accessibility (free + open-RSVP) is a co-equal scoring signal with investor/founder relevance, not a bolt-on filter.

Repo: github.com/alexkoukos/sf-radar-ingest (public) Stack: Java standalone batch job → Supabase Postgres → PostgREST → Vite + React (plain CSS, no Tailwind) → Vercel.

Non-negotiable architecture decisions — do not revisit these
Java is a standalone batch job. Never a server, never Spring Boot, never a REST controller. Fetch → normalize → score → upsert → exit.
Frontend (Vite + React) talks directly to Supabase via PostgREST. No custom Java API layer, ever. No client-side scoring, no client-side re-sorting by score, no client-side timezone math.
All filtering/sorting/time-window logic lives in SQL, specifically in get_dashboard_events(p_days). Java only computes time-invariant semantic scores. Java never pre-splits events into UI sections.
No mock, synthetic, or hand-authored event data anywhere in production. Real data only. Empty states show honest empty states.
Data source is Luma's embedded page JSON (Next.js streamed self.__next_f.push(...) chunks on luma.com/sf and calendar pages) — NOT the ICS feed (no discoverable unauthenticated URL) and NOT the official API (paid, per-calendar, wrong scope).
Recorded fixtures (frozen real HTTP responses) are allowed only in src/test/resources/, for parser tests. Never reachable from production code.
No ingestion-time keyword gate. Keyword matching is a scoring input only (KeywordScorer), never a filter that discards events. Source curation (which calendars are scraped) is the relevance filter.
Timezone: all date/window logic is anchored to America/Los_Angeles inside Postgres (la_window_start()), never UTC, never JVM default, never browser locale. All timestamps rendered client-side with explicit Intl.DateTimeFormat(..., { timeZone: 'America/Los_Angeles' }) + a visible "PDT" label. Dev machine is in Athens — historically the most likely silent-bug source.
Dedupe key: Luma's own global event id (source_event_id), not scoped per scrape-target — the same event found via two different pages must collapse to one row. discovered_via is observability only, unioned across runs, never part of the dedupe key.
Ghost events: never hard-deleted. last_seen_at + a 24-hour grace window in get_dashboard_events lets transient single-target failures self-heal while genuinely cancelled events still clear.
Run-level failure is a total-failure gate only (zero events across all targets, or a structural shape-match break). A single target 502-ing is logged per-target in ingestion_runs.source_summary and does NOT fail the run or touch the DB. Fail-loud persistence: any total failure skips the upsert entirely — events table is provably untouched, last good snapshot stays live.
Anon key is safe in the shipped bundle only because RLS restricts it to SELECT. Service-role/direct credentials live only in GitHub Actions secrets and the local Java .env — never anything Vite-prefixed.
Resolved Day-1 unknowns (do not re-investigate)
Location data: confirmed rich. 20/20 sampled events on luma.com/sf had city/sublocality/region/country_code and lat/long (some exact address + Google place_id, some privacy-obfuscated coordinates for venue-type meetups). VenueScorer (there is no separate LocationFilter class) is built and live.
Volume: confirmed sparse, as suspected. luma.com/sf alone gives ~20 events clustered in a 24-48h window. Curated community calendars were load-bearing for density, not padding — this is why calendar curation happened and matters.
Fetch origin: resolved via the first live ingest.yml run (2026-07-23, GitHub-hosted ubuntu runner, US). Same per-target counts as the Greece dev machine — no observed geographic difference.
Deployment (load-bearing indefinitely, not just for the demo)
.github/workflows/ingest.yml — cron every 6h + workflow_dispatch, runs the Java batch job against production Supabase via the Supavisor session pooler connection string (not direct — GitHub runners commonly lack reliable IPv6 egress).
.github/workflows/keepalive.yml — separate daily cron, one curl GET against PostgREST with the anon key. Fully decoupled from ingest.yml so a broken parser can never silently pause the Supabase free-tier DB (auto-pauses after 7 days idle → HTTP 540).
Vercel (sf-radar-web) — static Vite build, auto-deploy on push, env vars set in the Vercel dashboard (not just local .env).
This phase (now through Sunday evening): what to build, in order
14-night strip — the signature visual. One horizontal row, one cell per evening of the ~14-day window, colored by that night's best event score; empty nights visibly empty. Click a night → that evening's ranked events. This is the product thesis as a single glance. Must work at ~390px width — the demo happens on a phone.
Score breakdown bars — upgrade why-it-ranked chips to small horizontal bars per component (keyword / host / venue / accessibility). Data already exists in the row payload; no new queries needed.
Same-evening conflict flag — when 2+ strong events land on the same evening, surface it ("3 strong picks tonight — you can make one"). Purely presentational, computed from the already-fetched list.
Category + accessibility filter chips — category, newcomer- friendly, "free & open only" if not already present. Layer PostgREST .eq() filters on the RPC result; never re-filter client-side data you didn't fetch.
Explicitly out of scope this weekend
Dataset analytics: trend lines, pie/donut charts, events-per-week graphs, category distribution. The user cares about tonight, not the dataset as a whole.
Onboarding / preference elicitation / personalized scoring — v2, mention-only on Monday, not built now.
Auth, accounts, saved events, notifications.
Any change to Java, schema.sql, or workflows — that layer is finished and verified; don't reopen it. (Scoring weights live directly in the Java scorer classes - KeywordScorer, VenueScorer, AccessibilityScorer, EventScorer - there is no separate scoring-weights.json file.)
New data-fetching patterns beyond the existing RPC + chips.
Design direction
The ranked list is the hero. Density over decoration: an event card must communicate title, time (PDT), host, price/free, RSVP openness, and score at a glance without tapping.
Score high = visually loud, score low = visually quiet. Free + open events should look inviting (that's the thesis); invite-only/paid events render dimmed or flagged, never hidden.
Dark-mode-first is fine, but verify contrast on a real phone in daylight — the demo is a phone handed across a table.
Motion: subtle or none. Nothing that can jank on mid-range mobile.
If using a template/theme as a base: strip its branding, its demo charts, and any component that fetches its own data. Templates donate layout and typography only — data flow stays exactly as specified above.
Loading states: skeletons, not spinners. Error state: show the last good data with the stale banner, never a blank page.
Non-negotiable presentation constraints
No program name, no logo, anywhere in UI or README — the pitch is general usefulness, not flattery.
Ranking is never hand-curated or staged. Tune weights, then narrate whatever real data actually produces — including an awkward result.
Gift to the founders is the URL only — no repo handover, no transferred ownership. Maintenance is on the user indefinitely.
Verification before Sunday freeze
Open the deployed Vercel URL (not localhost) on a real phone: all views render, chips work, times show PDT, strip is tappable.
Quick performance pass — first paint must feel instant on mobile; the demo moment is someone opening a link cold.
grep the built dist/ bundle: no service-role credential, no connection string.
Deliberately kill the network mid-session: UI degrades to cached/last data + banner, not a crash.
After freeze: no pushes except fixes for something actually broken.
Ignore
.github/modernize/ (JDK 21→25 modernization) — unrelated tooling run, not part of this project's plan.











