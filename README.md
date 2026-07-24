# SF Radar

A live dashboard that ranks real San Francisco tech/startup/investor events for someone spending a short, fixed window of nights in the city with no existing local network. It answers one question: **out of everything happening tonight, what's actually worth walking into?**

## The problem this solves

With a fixed number of nights in a city, picking the wrong event has a real cost — an evening spent at a low-signal meetup is an evening not spent somewhere that mattered. Two things make that decision hard to make alone:

- SF has a lot of overlapping events on any given night, unevenly distributed — some nights have several strong options, some have none.
- The "best" event by pure investor/founder relevance isn't always the most useful one to actually attend. A free, open-RSVP meetup you can walk into and a strong-but-invite-only investor dinner you can't get into are different in *kind*, not just degree.

So the ranking treats **accessibility (free + open RSVP) as a co-equal signal with topical relevance**, not a filter bolted on afterward — see [Scoring](#scoring) for exactly how that plays out numerically.

## Architecture

```
Java batch job   →   Supabase Postgres   →   PostgREST   →   Vite + React   →   Vercel
(scrape, score)       (all filtering/          (auto REST      (renders             (static
                       sorting logic)            API)           already-sorted        hosting)
                                                                 data)
```

- **Java** (`src/main/java/com/sfradar/ingest/`) is a standalone batch job — fetch → normalize → dedupe → score → upsert → exit. Never a server; no REST endpoints of its own.
- **Postgres** owns every piece of filtering, time-window, and sort logic, exposed through one RPC function the frontend calls directly.
- **The frontend** talks to Postgres only through PostgREST/Supabase's client library — no custom API layer, no client-side re-sorting, no client-side timezone math.

Data flows one direction only: Java writes, Postgres orders, React reads and displays. Nothing downstream of Postgres is allowed to override its ordering.

## Data source

Every 6 hours, the Java job fetches a curated list of Luma pages and extracts event data embedded directly in the page HTML — specifically the `<script id="__NEXT_DATA__" type="application/json">` tag that Luma's Next.js frontend embeds on every page render (`NextDataExtractor.java`). This is a single self-contained JSON document, pulled out with a plain substring match. No Luma API key, no ICS feed (Luma doesn't expose one without auth), no paid per-calendar API — just the same data the page itself renders from.

Because different Luma page types wrap the same event object differently (a discover page nests events under `data.events[]`, a community calendar under `featured_items[]`), extraction doesn't hardcode either path. `EventShapeMatcher.java` instead walks the whole parsed JSON tree looking for any object shaped like an event — has `api_id`, `start_at`, `end_at`, `name`, `url` — and pulls it out wherever it's found. If a field that passed that signature check later turns out missing during extraction, that's treated as Luma's page shape having changed, not a silent drop (see [Ingestion resilience](#ingestion-resilience)).

### Curated sources

There's no keyword filter at ingestion time — the list of *which pages get scraped* is the relevance filter, not anything applied after the fact. `src/main/resources/luma-sources.json` configures the general `luma.com/sf` discover feed plus 15 curated community calendars spanning AI/GenAI builder groups, founder and investor social calendars, hackathon collections, and general SF tech meetup/networking calendars. Any event surfaced by any of these is in scope for scoring — nothing is discarded for being the "wrong kind" of event once it comes from a curated source.

## Normalization & dedupe

Each raw scraped record becomes a `RawEvent` — deliberately loose, since different Luma sources expose different amounts of detail; everything except the identifying fields may be `null`.

The dedupe key is **`api_id`** — Luma's own global event ID, not scoped to whichever page it was found on. So the same event appearing on both `luma.com/sf` and a community calendar collapses into a single row, not two. This happens at two layers:

1. **Within a run** (`EventDeduper.java`) — if two targets in the same scrape surface the same `api_id`, they're merged before scoring.
2. **Across runs**, in the Postgres upsert (`ON CONFLICT (api_id) DO UPDATE`) — so a run that only reached some targets doesn't erase discovery history recorded by a previous run that reached others.

At both layers, `discovered_via` (which page(s) surfaced this event — observability only) is *unioned*, never overwritten, and never used as part of the identity key:

```sql
discovered_via = (
    SELECT string_agg(DISTINCT via, ',' ORDER BY via)
    FROM unnest(
        string_to_array(events.discovered_via, ',') || string_to_array(EXCLUDED.discovered_via, ',')
    ) AS via
)
```

## Scoring

Every event gets a single `score` between 0 and 1, computed once by Java and persisted — never recomputed by SQL or the frontend, and never a function of the time window (an event's relevance doesn't change because it's Tuesday). It's the **unweighted average of three sub-scores**, each also 0–1:

```
score = (keyword + venue + accessibility) / 3
```

### Keyword — how relevant is this to a founder/investor audience

A lookup by category. Category comes from matching the event's title against an ordered list of substrings (`CategoryClassifier.java`, first match wins): `hackathon` / `hack` / `challenge` / `build day` → Hackathon; `demo` / `pitch night` / `showcase` → Demo Day; `investor` / `venture` / `angel` → Investor Meetup; `founder` / `startup school` → Founder Social; `networking` / `mixer` / `meetup` / `workshop` / `tech talk` / etc → Networking; everything else → Other.

| Category | Weight |
|---|---|
| Investor Meetup | 1.0 |
| Demo Day | 0.9 |
| Founder Social | 0.85 |
| Hackathon | 0.7 |
| Networking | 0.6 |
| Other | 0.4 |

### Venue — how useful is this location for someone staying in SF with no car and no local network

```
online                              → 0.0
in-person, city = "San Francisco"   → 1.0
in-person, some other named city    → 0.5
in-person, no city data at all      → 0.3
```

### Accessibility — can you actually walk in — the product's core thesis, not a tiebreaker

Average of two components:

**Free** — `true → 1.0`, `false → 0.0`, unknown → `0.5`

**RSVP openness** — derived from Luma's registration fields, checked in priority order (waitlist beats "requires approval" beats "open"):

| RSVP type | Weight |
|---|---|
| Open | 1.0 |
| Waitlist | 0.4 |
| Application required | 0.3 |
| Members only | 0.1 |
| Invite only | 0.0 |
| Unknown | 0.5 |

*(Members-only and invite-only are reserved values with no producing signal yet — every source observed so far only ever surfaces public listings.)*

`accessibility = (free + rsvp) / 2`

This is what lets a free, open-RSVP community meetup outrank a topically "hotter" but invite-only investor dinner — deliberately, not a bug.

### Why there's no "Host" score

The breakdown bars in the app show Keyword / Venue / Access — there's no fourth "Host" bar, and that's intentional, not a missing feature. A host-reputation scorer was cut for time, so every host defaults to equal weight rather than being ranked on an incomplete signal. Showing a host bar backed by no real data would be worse than not showing one at all.

## Ingestion resilience

- **A single target failing** (502, timeout, empty page) doesn't fail the run. It's caught, logged with a reason, and excluded from that run's batch — every other target's events still get scored and upserted.
- **A "structural break"** — Luma's page shape changing enough that the `__NEXT_DATA__` extraction itself breaks — is different: since every target shares the same extraction logic, one structural break means the assumptions behind *all* targets are probably wrong. That trips a **total-failure gate** for the whole run.
- **Total failure** (zero events scraped across every target, or any single structural break) skips the Postgres upsert entirely — the `events` table is provably untouched, and the last good snapshot stays live on the dashboard. A row is still written to `ingestion_runs` (status, event count, per-target JSON breakdown) so the failure is fully observable — that table just isn't reachable through the public API (see [Security](#security)).

## Ghost events — nothing is ever hard-deleted

Every successful sighting of an event bumps `last_seen_at = now()`. The dashboard's read query only shows events seen in the **last 24 hours**:

```sql
WHERE last_seen_at >= now() - INTERVAL '24 hours'
```

So a target failing for one run — or even three or four, since ingestion runs every 6 hours — doesn't make its events vanish, as long as it recovers within 24 hours. An event that's genuinely cancelled or removed just stops being re-discovered by any target, ages past 24 hours, and quietly drops out of the dashboard's `WHERE` clause, while the row itself stays in the table permanently for later inspection. There is no `DELETE` anywhere in the codebase.

## The database layer

Two tables, two functions, defined once in `src/main/resources/schema.sql`.

**`events`** — one row per `api_id`, holding the raw scraped fields (name, time, location, host, price, RSVP mechanics), the derived `category` / `rsvp_type`, the single `score`, and `first_seen_at` / `last_seen_at`.

**`ingestion_runs`** — one row per ingest attempt regardless of outcome (status, total event count, whether the upsert actually ran, per-target JSON summary).

**`get_dashboard_events(p_days)`** — the one RPC the frontend calls. All filtering, windowing, and sorting for the whole app happens here and nowhere else:

```sql
SELECT * FROM events
WHERE starts_at >= la_window_start()
  AND starts_at <  la_window_start() + (p_days || ' days')::interval
  AND last_seen_at >= now() - INTERVAL '24 hours'
ORDER BY score DESC NULLS LAST, starts_at ASC
```

Sort is score first, start time as the tiebreaker — nothing else. No keyword filter here either, matching the "curation is the filter, scoring is the ranking" principle all the way through the read path.

**`la_window_start()`** anchors "today" to `America/Los_Angeles`, converting through LA local time and back to an absolute instant — immune to whatever timezone the ingest job, the database server, or the person viewing the dashboard happens to be in.

## Security

- The `anon` key shipped in the public frontend bundle is safe only because Row Level Security makes it read-only: `events` has exactly one policy, `SELECT USING (true)` — no INSERT/UPDATE/DELETE policy exists, so PostgREST refuses writes by default.
- `ingestion_runs` has RLS **enabled with zero policies** — completely unreachable through the public API in either direction. It's only ever written by the Java job's own privileged database connection, which bypasses PostgREST/RLS entirely.
- The service-role/direct database credentials the Java job uses live only in GitHub Actions secrets and a local `.env` — never in anything shipped to the browser.

## Deployment

- **`.github/workflows/ingest.yml`** — cron every 6 hours plus manual `workflow_dispatch`, runs the Java job against production Supabase over the Supavisor *session pooler* connection string rather than a direct connection, since GitHub-hosted runners commonly lack reliable IPv6 egress.
- **`.github/workflows/keepalive.yml`** — a separate daily cron doing one plain `curl` GET against PostgREST with the anon key. Deliberately decoupled from `ingest.yml`: Supabase's free tier auto-pauses a database after 7 days idle, and a broken parser failing silently should never be able to also pause the database out from under the last-good data.
- **Vercel** — static Vite build, auto-deploy on push.

## The frontend

### The 14-night strip

One bar per night in the window. Bar height and color are a continuous function of that night's best event score (`height = score × 100%`, color mixed between the accent color and neutral gray, weighted by score) — not a discrete bucket. A ✦ mark appears on any night with 2+ events scoring ≥0.7 ("strong picks"), which also drives the "N strong picks tonight — you can only make one" banner when that night is selected. A night you've marked **Attending** renders as a solid full-height bar in a different color entirely, overriding the score gradient — it's yours regardless of how it scored. Empty nights are dashed and unclickable. Click a night to filter the list below to just that night; click again to clear it.

### Sort — Balanced / Investor signal first

Two pills. "Balanced" clears all filters (plain score order). "Investor signal first" is a relabeled shortcut for the Investor Meetup category filter — visually a sort, but really just filtering to a category that's already sorted by score within itself, so nothing is ever re-sorted client-side.

### View — My Plan / Tonight only

Two toggles, mutually exclusive — clicking one turns the other off if it was on; neither active is also a valid, default state. "Tonight only" jumps to the current window's first night. "My Plan" filters the ranked list down to events you've marked Attending. Logged nights (below) aren't ranked events, so they always show regardless of this toggle.

### Filter chips — Newcomer friendly / Free & open only / category

"Free & open only" means free **and** open RSVP. "Newcomer friendly" is broader — open RSVP alone, regardless of price. Category chips are generated from whatever categories are actually present in the current window, so there's never a chip pointing at zero results. On a phone, the Sort and Filter Chips rows scroll horizontally in a single line instead of wrapping across multiple short rows — same interaction as Luma's own mobile chip rows, so every option stays one swipe away instead of stacking into a wall of buttons.

### Event cards

Rank badge, category + numeric score (0–100), title, time (always rendered in explicit `America/Los_Angeles` with a visible "PDT" label — never the browser's local timezone), venue, host, then three tags: price/free, RSVP openness, and a "Harder to get into" flag for invite-only/members-only events. Gated events are flagged, never hidden. Visual loudness maps to *rank*, not raw score directly: the #1 card gets a solid accent fill and, on wider screens, double width; #2–#3 get an accent border; everything else is deliberately muted (`opacity: 0.78`). Tapping a card opens the detail modal; the **Attend** button toggles the My Plan state directly from the card without opening it.

### Event detail modal

Same data as the card, more room, plus the score breakdown: three horizontal bars (Keyword / Venue / Access) showing exactly the sub-scores described in [Scoring](#scoring), and an "Open on Luma ↗" link when available.

### Log a Night

The "+ Log a night" button in the header lets you record something that isn't a ranked/scraped event at all — dinner with a friend, anything off-platform. Pick a night, give it a title and an optional note. It renders back as a dashed-border card, visually distinct from ranked cards (no score, not clickable), and counts toward the "N nights planned" total and the strip's booked-night fill exactly like an Attending toggle does.

### My Plan storage

Both Attending toggles and logged nights live in a single object in `localStorage` only — no accounts, no login, nothing ever sent to Supabase. It survives a page reload, so a demo doesn't lose your picks, but it never leaves the browser.

### Offline / stale-data handling

Cached events load instantly from `localStorage` on open. If a live fetch fails and a cache exists, the last good data stays on screen with a timestamped "stale" banner instead of a blank page or a crash. A hard error banner only shows if there's no cache at all — a true first-load failure with nothing to fall back to.

## Running locally

```
# Java ingest job — writes to Postgres, needs DB credentials in .env
mvn package && java -jar target/sf-radar-ingest.jar

# Frontend
cd sf-radar-web
npm install
npm run dev
```

The frontend needs `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (safe to expose — see [Security](#security)) in its environment. It never needs Java or a local database running; it just reads whatever's already live in Supabase.
