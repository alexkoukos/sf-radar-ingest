# SF Radar — Handoff

Written for a session with no prior context. Read this and `CLAUDE.md` before touching anything.

The foundation is done and verified. The **group trip-coordination feature** (spec at the bottom) is now **functionally complete** — see the checkpoint below. The active phase is **UI / UX polish** on top of it.

---

## CHECKPOINT — group feature built (tag `group-feature-complete`, commit `5acbbcc`)

Parts **1, 2, 3, 5, 6, 8** of the group spec are shipped to `master`, deployed on Vercel, and each was proven with live requests against production (curl + headless-browser walkthroughs). 131 web tests green; `tsc` / `oxlint` / `vite build` clean; `grep dist/` for secrets clean on every build. **No migration was run** — migrations 003 / 004 / 005 already had every table and function; `schema.sql` was touched only for the geo gate (below).

| Part | What | Key files | Commit |
|---|---|---|---|
| 1 | `create` / `login` / `join` / `view` endpoints + server-enforced passphrase gate | `api/group/*.ts`, `api/_lib/{groupCore,groupToken,groupHttp,supabaseAdmin,passphrase,groupIds,groupText}.ts` | `284b04b` |
| 2 | Group calendar view at `/group/<slug>` — merged shared events (one card + stacked member chips), per-member colors, me/some/everyone filter, night-by-night | `src/components/{GroupCalendarPage,GroupCalendar,GroupGate,MergedEventCard,GroupCustomEventCard,MemberChips}.tsx`, `src/lib/{groupView,groupMerge,memberColor}.ts` | `9e049d6` |
| 3 | Custom events + meetings, `busy` default for meetings, visibility enforced in `group_view` (SQL) | `src/components/CustomEventForm.tsx`, `src/lib/{customEvent,laTime}.ts` | `ee344d0` |
| 5 | Below-list hub restructured into GROUP / SHARE / CALENDAR; create/join group flows; nav group chip; scroll affordance | `src/components/{PlanActions,GroupHubSection,CopyField}.tsx`, `src/lib/groupMembership.ts` | `72f933f`, `c6002ec` |
| 6 | Combined group feed `GET /group/feed/<token>.ics` — `[Name]`-prefixed, `[Name] Busy` redaction, stable per-(member,event) UIDs | `api/group/feed/[token].ts`, `api/_lib/groupFeed.ts`, `buildGroupFeedIcs` in `api/_lib/ics.ts` | `637d7bc`, `47b21ae` |
| 8 | "How to subscribe" panel on the group page + README "Trip groups" section (menu paths verified vs vendor docs Sept 2026) | `src/components/GroupHowTo.tsx`, `README.md` | `26d9aa4` |

**Also in this checkpoint, NOT part of the group feature:** `get_dashboard_events` gained a geo gate (`schema.sql`, commits `6d610b7` → `5acbbcc`) — keeps the greater Bay Area (bounding box `lat 36.85–38.5`, `lon -122.9…-121.4`, plus null-coord events whose region/country don't contradict a Bay origin), drops LA / Sacramento / out-of-state / out-of-country. The topic calendars are subject-scoped, not geo-scoped, so ~12 of ~277 live events were New York / Tokyo / Singapore / Austin / Florence.

**Deferred by design — do NOT build:** passphrase rotation / token versioning; the optional grid view; per-member feeds + per-member Google-color buttons; linking a meeting's "who" (`with_member_id`) to a group member; a rotate/revoke-feed-token button (the `rotate_feed_token` RPC exists, no UI).

**Still owed by the human (service-role SQL editor / a real device), tracked so a fresh session doesn't re-derive it:**
1. Run the geo-gate `CREATE OR REPLACE FUNCTION get_dashboard_events(...)` (the `schema.sql` version) — the 6h ingest cron re-applies it anyway, so this only matters for immediacy.
2. `DELETE FROM groups WHERE group_slug IN (...)` for the throwaway proof groups: `f9d9b79a2a15799ff088ddded2dcc692`, `9b19f63b6fc2fe97ff057a3aab7d8e9e`, `e7dd448dc021960ac54fd48d10481240`, `cd3d84b8e5fc22aa79d1be659574a5dd`, `bf3f3c8a2153df1f4395ed9cf57a9d7d`, `b08cf7dbf2759c0e62433b439f5f6265`, `5cca1c8975e22c1c7fd7e6e45297c6e4` (last one is the 007-client rename+busy-URL proof group — also `DELETE FROM plans WHERE slug = 'proof6cddd1eecf36a4656b78'`; some earlier ones may already be gone).
3. Delete two junk plans: slug `0890eaf4206729edc49ae00b33f16b36` (my Part 5 headless orphan) and `zzztestslugthatislongenough` (pre-existing manual test).
4. Subscribe the combined feed in a real Google Calendar and confirm it propagates on the next poll — validated here only by `ical.js` parse + live curl.

Deferred cleanup #1 (drop `legacy-locked` plan rows + tighten `plans_edit_key_shape` to `^[a-f0-9]{32,64}$`) was **run by the human** at this checkpoint — done. Deferred cleanup #2 (other leftover manual-test plan rows) is partly done via item 3 above; a few group-less `plans` rows with real content were left in place deliberately.

---

## What this is

A live dashboard that ranks real SF tech/startup/investor events for a ~2-week visitor with no local network. Real Luma data, ingested on a cron, scored in Java, served from Supabase. On top of it: a per-person plan (pick events, log nights), a read-only share link, an ICS calendar feed, and — next — multi-person trip groups with a passphrase gate, per-member colors, custom events/meetings, and a combined calendar feed.

Trip window the group feature targets: **Sep 14–27 2026**, San Francisco, ~12 people, mixed home timezones, coordinating in Slack.

---

## Stack & deployment

| Layer | What |
|---|---|
| Ingestion | Java **standalone batch job** (`sf-radar-ingest/`). Fetch Luma → normalize → score → upsert → exit. Never a server, never Spring. |
| Data source | Luma's embedded Next.js page JSON (`self.__next_f.push(...)` chunks on `luma.com/sf` + curated calendars). Not the ICS feed, not the paid API. |
| DB | Supabase Postgres, accessed by the frontend via **PostgREST only**. No custom Java API layer. |
| Frontend | Vite + React + **plain CSS** (no Tailwind), in `sf-radar-ingest/sf-radar-web/`. |
| Serverless | Vercel functions in `sf-radar-ingest/sf-radar-web/api/`. Currently one: `api/feed/[slug].ts` (ICS feed). All future group endpoints go here. |
| Hosting | Vercel project `sf-radar-web`, **auto-deploys on push to `master`**. Env vars set in the Vercel dashboard, not just local `.env`. |
| Cron | `.github/workflows/ingest.yml` — every 6h + manual dispatch; runs the Java jar against prod Supabase via the Supavisor **session pooler** string (GitHub runners lack reliable IPv6 for a direct connection). `.github/workflows/keepalive.yml` — daily `curl` GET so the free-tier DB doesn't auto-pause; deliberately decoupled from `ingest.yml`. |
| Repo | `github.com/alexkoukos/sf-radar-ingest` (public). Default branch `master`. Commits go straight to `master`. |

**Credentials:** the Supabase **anon key** is in the shipped bundle and that is fine — RLS restricts it to `SELECT` on `events` only. The **service-role key / direct DB URL** live *only* in GitHub Actions secrets and the local Java `.env`. Never anything Vite-prefixed, never in `api/*` client-reachable code. Part of every verification pass: `grep` the built `dist/` for a service-role key, JWT secret, or connection string — there must be none.

---

## Hard rules — do not break these

1. **Real data only** for *ingested* events. No mock, synthetic, or hand-authored event rows anywhere that reaches prod. Empty states render as honest empty states. (User-created custom events are a separate concept and are allowed.)
2. **No auth system.** No accounts, no OAuth, no email, no magic links. Access is an unguessable link plus, for groups, a passphrase.
3. **Ask before running any migration. Show the SQL first, wait for approval.** Migrations are applied by hand in the Supabase SQL editor, one file per paste.
4. **SF timezone always.** Every date/window is anchored to `America/Los_Angeles` inside Postgres (`la_window_start()`), never UTC or JVM/browser local. Every client-rendered timestamp uses an explicit `Intl.DateTimeFormat(..., { timeZone: 'America/Los_Angeles' })` and shows a `PDT`/`PST` suffix. The dev machine is in Athens — timezone bugs are the most likely silent failure.
5. **No program name and no logo** anywhere in the UI or the README. The pitch is general usefulness. Ranking is never hand-curated or staged.
6. **Never mint one credential with both read and write capability.** A public read slug and a private edit key are always separate values. This applies to plans and to group members.
7. **Existing stack only.** Vite/React, Supabase, Vercel functions. No new frameworks, no rewrites, no "modernizing" unrelated code.
8. **All filtering/sorting/time-window logic lives in SQL**, in `get_dashboard_events(p_days)`. Java computes only time-invariant semantic scores. No client-side scoring or re-sorting.

---

## The `api/_lib/` import rule (this cost hours — commit `aff5365`)

Vercel serverless functions on this project (`"type": "module"` package) **cannot import from `../../src/**`**. `@vercel/node` does not bundle files outside the `api/` tree; Node throws `ERR_MODULE_NOT_FOUND` at module *init*, so the function returns `FUNCTION_INVOCATION_FAILED` before the handler even runs — and it looks like a 500 with no useful stack.

The fix that is in place:

- Shared serverless code lives in **`sf-radar-ingest/sf-radar-web/api/_lib/`**: `ics.ts`, `possessive.ts`, `locationLine.ts`, `categoryLabels.ts`, `planFeed.ts`.
- `api/*` code imports it with **explicit `.js` specifiers** (e.g. `import { buildIcs } from "../_lib/ics.js"`). `tsconfig.api.json` is `nodenext`.
- The matching `src/lib/{ics,possessive,locationLine,categoryLabels}.ts` files are thin `export *` re-export shims so the browser build keeps one copy of the logic.
- **Every new group endpoint imports from `api/_lib/`, never from `src/`.** If you add shared logic, it goes in `api/_lib/` and gets a `src/lib/` shim if the browser needs it too.

---

## The `schema.sql` rule (this cost ~5h of failed ingest runs — commits `a96e2e1`, `78d44ff`)

`sf-radar-ingest/src/main/resources/schema.sql` is executed **in full on every ingest run** by `PostgresEventStore.ensureSchema()`, as one multi-statement string. Postgres runs that in one implicit transaction: **any single statement erroring rolls back the whole file and fails the run.**

Therefore `schema.sql` may only ever `CREATE`/`ALTER` the **ingest-owned** objects: `events`, `ingestion_runs`, their RLS, `la_window_start()`, `get_dashboard_events()`. All of those are idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`).

It must **never** DDL anything that is migration-managed (`plans`, `get_plan`, `upsert_plan`, `groups`, `group_members`, `custom_events`, `rate_limits`, or any group function). It used to recreate the `plans` block on every run — that silently reverted migration 002 every 6 hours, and once the migrations reshaped `get_plan`'s return type it started crashing the whole ingest with `42P13 cannot change return type`. The `plans` block has been removed; those objects live in `sf-radar-ingest/migrations/` now.

Corollary: if a future migration ever does `ALTER TABLE events ...`, update `schema.sql`'s `events` DDL **in the same commit** — `CREATE OR REPLACE FUNCTION get_dashboard_events() RETURNS SETOF events` breaks on a rowtype change the same way `get_plan` did.

---

## Current database state

Migrations are hand-run in the Supabase SQL editor and checked into `sf-radar-ingest/migrations/` (see that directory's `README.md`).

| # | File | State |
|---|---|---|
| 001 | `001_plans_edit_key.sql` | **Historical, do not run.** Rolled back (pasted with 003, its transaction aborted). Superseded by 004. |
| 002 | `002_drop_legacy_upsert_plan.sql` | **Run & verified.** Dropped the legacy 6-arg `upsert_plan`; closed finding **H1** (slug-only plan overwrite with no edit-key check). Live DB has exactly one `upsert_plan` — the 7-arg `upsert_plan(text,text,text,text,text,jsonb,jsonb)`. |
| 003 | `003_groups.sql` | **Committed.** Created `groups`, `group_members`, `custom_events`, `rate_limits` + functions. |
| 004 | `004_reconcile_001_and_fix_003.sql` | **Run.** Reapplied 001's substance into the post-003 state, closed anon-execute grants on `rl_hit`/`group_view`/`group_feed_by_token`, rebuilt the 7-arg `upsert_plan`, added `with_member_id`, `join_order` advisory lock, FK `ON UPDATE CASCADE`, `plan_capacity()`, `sweep_stale_plans()`, `regenerate_plan`/`delete_plan`/`join_group`/`rotate_feed_token`. |
| 005 | `005_fix_returns_table_column_ambiguity.sql` | **Run.** `#variable_conflict use_column` + qualified `RETURNING` for `42702` in the `RETURNS TABLE` plpgsql functions; `NULLIF(current_setting('request.headers',true),'')` guard. |

**The live plan/group schema of record is `003 + 004 + 005`.** All group tables and functions exist and passed a 15-step smoke test (create group → join ×2 → custom events generic/busy/member-linked → `group_view` redaction → `group_feed_by_token` → `rotate_feed_token` → `regenerate_plan` with cascade → `delete_*` → `sweep_stale_plans`), run inside a transaction that was rolled back.

**No further migration is required to start building the group feature.** New migrations are only needed for the two deferred cleanups below, or if the spec forces a schema change during the build (show the SQL first).

Key function contracts already live:

- `get_plan(p_slug)` → `RETURNS TABLE(slug, display_name, tz_mode, start_date, attending, logged, created_at, updated_at)`. **Does not** return `edit_key`. `anon`-executable.
- `upsert_plan(p_slug, p_edit_key, p_display_name, p_tz_mode, p_start_date, p_attending, p_logged)` → same row shape. Edit-key check is atomic inside the `ON CONFLICT ... WHERE plans.edit_key = EXCLUDED.edit_key`; wrong key raises `check_violation`. Rate-limited per IP + 50k-row ceiling on *new* slugs. `anon`-executable.
- `regenerate_plan`, `delete_plan`, `upsert_custom_event`, `delete_custom_event`, `rotate_feed_token` → `anon`-executable, authorized **only** by `plans.edit_key` matching the owner plan. Never by a member id.
- `group_view(p_group_slug)`, `group_feed_by_token(p_feed_token)`, `join_group(...)`, `rl_hit(...)`, `sweep_stale_plans(...)` → **not** `anon`-executable. Called by the Vercel layer as service role after cookie/passphrase validation. `group_view` and `group_feed_by_token` redact `busy` entries server-side (only `event_id`/`starts_at`/`ends_at`) and omit `private` entirely; they never return `passphrase_hash`, `edit_key`, or `feed_token`.
- `groups` tables all have `ENABLE ROW LEVEL SECURITY` with **zero policies** — no direct PostgREST read/write, everything goes through the SECURITY DEFINER functions.

---

## What's shipped and verified

- **Ingestion fix** — real Luma data, 14/14 trip nights populated; last run persisted ~273 events. Green on the 6h cron.
- **Part 0 UI fixes** — no horizontal overflow (`min-width: 0` chain + `overflow-x: hidden` backstop), export/share panel moved below the plan, radio buttons restyled, share link surfaced.
- **`edit_key` read/write split** — client wiring in `src/lib/plan.ts` + `components/PlanActions.tsx` (commit `22ab76a`). Read slug (`/plan/<slug>`) and edit key (localStorage only) are separate. Losing the edit key = losing edit access, surfaced in the UI.
- **Share page** — `components/SharedPlanPage.tsx` reads via `get_plan`.
- **ICS feed** — `api/feed/[slug].ts` + `api/_lib/ics.ts` / `planFeed.ts`. RFC 5545 validated by parsing with `ical.js` in `src/lib/ics.test.ts` + `planFeed.test.ts`: CRLF, 75-octet folding without splitting multi-byte chars, escaped `,;\`, and a `VTIMEZONE` for `America/Los_Angeles` with both DST sub-components + RRULEs (TZID mode). Serves `text/calendar; charset=utf-8`.
- **Regenerate link** — `regenerate_plan` moves content to a fresh slug + key and kills the old row.
- **"Add to Google Calendar" deep link** — commit `b25cde3`, verified working: opens `calendar.google.com/calendar/render?cid=webcal://.../feed/<slug>.ics`.
- **H1 closed** via migration 002 (see DB state above).

Test suite: `cd sf-radar-ingest/sf-radar-web && npm test` (vitest). Java: `cd sf-radar-ingest && ./mvnw -B test`.

---

## Two deferred cleanups (not blocking the group feature)

1. **Legacy plan rows.** After the user hand-deletes the sentinel rows as service role:
   ```sql
   DELETE FROM plans WHERE edit_key = 'legacy-locked';
   ```
   then drop the sentinel branch from the CHECK so it can never be written again — as a numbered migration `006_*.sql`:
   ```sql
   ALTER TABLE plans DROP CONSTRAINT plans_edit_key_shape;
   ALTER TABLE plans ADD  CONSTRAINT plans_edit_key_shape
     CHECK (edit_key ~ '^[a-f0-9]{32,64}$');
   ```
2. **Test plans.** There are leftover manual-test rows in the `plans` table from prod verification. Delete them (service role, by slug) before the trip.

---

## Group feature — full spec

Build order: **post the migration SQL (if any is needed) and wait for approval, then build. Work Parts in order.**

### Phasing

- **Ship (core): Parts 1–5.**
- **Ship if time remains: Part 6** (combined feed first), **Part 8** (instructions panel).
- **Deferred, do not build:** passphrase rotation / token versioning; the optional grid view (keep the night list); per-member feeds and per-member Google-color buttons (combined feed first).

### Agreed technical decisions — settled, do not re-litigate

- **Password hashing:** `bcryptjs` (pure JS, no native build risk on Vercel). Per-row salt. Constant-time compare. Never store/transmit plaintext, never in a URL, never in localStorage, never ship the hash to the client, never log it.
- **Rate-limit store:** the Postgres `rate_limits` table via `rl_hit(bucket, limit, window_seconds)`, service role only. No Redis/Upstash.
- **Web-UI token:** `HttpOnly; Secure; SameSite=Lax` cookie carrying a signed `{groupSlug, exp}`, ~30-day expiry, secret in the `GROUP_TOKEN_SECRET` Vercel env var.
- **Feed tokens:** 32-char CSPRNG string, `[A-Za-z0-9_-]` (~190 bits), in the feed URL path, minted after passphrase entry, revocable (`feed_revoked` flag + `rotate_feed_token`). DB CHECK already enforces `^[A-Za-z0-9_-]{32}$`.
- **Passphrase normalization:** `trim` → Unicode `NFC` → `toLowerCase`, in that order, in **one shared function** used by both set and verify so they can't drift. 4–64 chars.
- **Un-attended events in feeds:** plain **omission**, not `STATUS:CANCELLED`. Stable UIDs + 8–24h re-poll make omission clean; CANCELLED accumulates forever in some clients.
- **Meeting duration:** `DEFAULT_MEETING_DURATION_MS = 45 min`, a **separate** constant from the existing `DEFAULT_DURATION_MS = 2 h`.
- **Color palette:** Okabe–Ito CVD-safe set, **`#4D4D4D` in place of black**, auto-assigned by join order, member-overridable. Up to 12 members; past that, deterministic lightness variations — never an exact reuse. The palette array is already in `join_group` in migration 004/005.
- **Slugs / edit keys / feed tokens:** CSPRNG only (`crypto.getRandomValues` / `nanoid`, never `Math.random`), ≥128 bits. State the alphabet and length in code comments. Group slug is `^[a-f0-9]{32}$`.

### Part 1 — Data model (already migrated; wire it up)

- A trip **group**: unguessable slug, name, date window, passphrase hash.
- A **member** = display name + color + their own plan. Membership = opened the group link, entered the passphrase, claimed a name.
- Each member has a public **read slug** and a separate personal **edit key** (localStorage only). Losing the edit key = losing edit access; say so and make re-copy easy.
- An existing standalone plan must be **joinable** to a group without data loss: on group creation the local `plans` row is *adopted* as member #1's record (its slug becomes that member's read slug), not copied.

### Part 2 — Passphrase gate (gating, not auth)

The group link alone must not be enough to view or join.

- Creator sets the passphrase at group creation; shown once with a copy button and a clear "share this in Slack, we can't recover it" note.
- **Enforcement is server-side.** Group data must not be readable by the anon key. Group reads route through the Vercel layer, which validates the cookie token before calling `group_view` as service role. "Fetch with the anon key then hide the UI" is an automatic fail.
- Identical response **and comparable timing** for "no such group" and "wrong passphrase" — never reveal whether a slug exists.
- Rate-limit passphrase attempts per IP **and** per group slug (~10 per 15 min) via `rl_hit`.
- Calendar apps can't enter a passphrase, which is why feeds carry their own long revocable token in the path, minted after passphrase entry.

### Part 3 — Group calendar view (the main deliverable)

- Full trip window, every member's plan overlaid, per-member color from the palette.
- Show Luma events **and** custom events; visually distinguish custom ones (border/marker).
- **When multiple members attend the same event, render it once with stacked member indicators**, not N rows. This is the single most useful thing in the feature — make it prominent.
- Filter by member: only me / some / everyone.
- Keep the night-by-night structure (grid view deferred).
- Flag overlaps **within one member's own plan** with a subtle, non-blocking warning.

### Part 4 — Custom events, including 1:1s / coffee chats

One table (`custom_events`), `kind` discriminator: `generic` or `meeting`.

- **Generic:** title, start, optional end/location/note. Times entered in SF local, converted before insert.
- **Meeting:** optional title (auto-generate if empty, e.g. "Coffee with Sarah Chen"); `with_name` free text (link to a member if it matches, but do **not** require membership); optional `with_company`; `meeting_type` ∈ coffee/one_on_one/call/lunch/dinner/other (small icon/label only); start + optional end (45 min default); optional location/note.
- **Visibility** (`visibility` column, enforced server-side in `group_view` / `group_feed_by_token`):
  - `shared` — default for generic — full detail in the group view.
  - `busy` — **default for meetings** — group view shows an anonymous block in the member's color labeled "Busy": no title, no name, no company. Owner sees full detail in their own plan and feed.
  - `private` — absent from the group view entirely; owner-only, still in the owner's own feed.
  - Verify by inspecting the actual network response — the endpoint must not send hidden titles/names to the client.
- **Ownership:** only the holder of the personal edit key can edit/delete their entries (`upsert_custom_event` / `delete_custom_event` check `plans.edit_key`). Never accept a member id from the client as authorization.

### Part 5 — Page layout

Three grouped sections **below** the night list, in order:

1. **GROUP** — which group you're in, member list with colors, link to the group calendar view, invite link + passphrase.
2. **SHARE MY PLAN** — read-only share link, copy button, "regenerate link" action.
3. **CALENDAR** — subscribe URLs (https + webcal + Add to Google Calendar), download `.ics`, and the SF-timezone / floating-time toggle nested **inside** this section as a secondary/collapsed setting, not a standalone block.

Add a small persistent affordance near the top (next to "N nights planned") that scrolls to / opens this section. Don't recreate a large top panel. If the user arrived via a group link, make it immediately obvious they're in a group (compact header indicator).

### Part 6 — Calendar feeds (ship if time remains)

Per-event colors are impossible in ICS (Google colors by calendar, not event).

- **Combined group feed first:** one token-bearing URL, each `SUMMARY` prefixed with the member's name — `[Alekos] AI Biotech Block Party`.
- Per-member feeds (distinct Google colors) second, if time allows.
- Feeds respect visibility: `busy` → `[Name] Busy` in the combined feed; `private` omitted; owner's own feed always full detail.
- Stable UIDs across polls (update in place, no duplicates). Un-attended → omitted next poll.
- `text/calendar; charset=utf-8`, `Content-Disposition`, sane caching. Google polls every 8–24h — surface that expectation in the UI so nobody thinks it's instant.
- Keep the one-off `.ics` download separate (frozen copy).
- `X-WR-CALNAME` = member's name via the existing possessive helper. Set `COLOR` / `X-APPLE-CALENDAR-COLOR` best-effort with a code comment that Google ignores them and Apple honors `X-APPLE-CALENDAR-COLOR`.

### Part 7 — Security (applies throughout, not a phase)

- RLS `ENABLE`d (confirm `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, not just policies written) on every new table. No `USING (true)` on group data.
- anon can never enumerate groups/members/plans/custom events, never UPDATE/DELETE another member's rows.
- `rate_limits` is service-role only. `passphrase_hash` never reachable by anon via any view or function return.
- Slugs/edit keys/feed tokens from a CSPRNG, ≥128 bits — state alphabet + length.
- Rate-limit group creation, member creation, custom event creation, passphrase attempts.
- **Sanitize all user text at every sink** — HTML render, `document.title`, page metadata, ICS `SUMMARY`/`LOCATION`/`DESCRIPTION`/`X-WR-CALNAME`, `Content-Disposition` filename, logs. **Strip CR/LF specifically** — a CRLF in a name injects forged `VEVENT`s into a subscriber's calendar and can inject HTTP headers. (`clean_text()` in migration 003 does this server-side; the client and ICS builder must too.)
- `noindex` on all group/share/feed routes.
- `grep` the built bundle: no `service_role` key, no JWT secret, no DB URL.

### Part 8 — Instructions panel (ship if time remains)

Short "How to use this" panel on the group page + a copy in the README:

- Google Calendar: add by URL (Other calendars → From URL) and how to set the calendar's timezone to Los Angeles.
- Apple Calendar (macOS + iOS): New / Add Subscribed Calendar + refresh interval.
- Outlook: Add calendar → Subscribe from web.
- Subscribe (updates, ~8–24h delay) vs download `.ics` (frozen). Per-person subscribe = colors; combined = one calendar, no colors.
- The timezone caveat in one plain sentence.
- Scannable, no walls of text. **Verify the current menu paths** rather than writing them from memory — these UIs change.

### Validation requirements

- ICS must validate under RFC 5545 in **both** timezone modes for Luma events, custom events, meetings, and the combined feed: CRLF endings, 75-octet folding never splitting a multi-byte char, escaped `,;\`, valid `VTIMEZONE` with correct PDT/PST DST rules in TZID mode. **Verify by parsing with `ical.js` in an automated test.** Do not eyeball it. (`ical.js` is already a devDependency; see `src/lib/ics.test.ts` for the pattern.)

### Proofs the user will ask for

1. Passphrase is server-enforced: `curl` the group data endpoint **without** a valid token, and `curl` Supabase directly with the anon key — **both return no group data**.
2. Visibility is server-enforced: the network response for a group view containing a `busy` meeting **does not include** its title or the person's name.
3. Manual end-to-end: create a group with a passphrase, add 3 members with different colors, give one a `busy` coffee chat and one event two members both attend; confirm the group view merges the shared event and hides the meeting detail; subscribe to the combined feed in a real Google Calendar; change a plan and confirm it propagates on refresh.
4. Everything you guessed, flagged explicitly, **before** implementing it.
