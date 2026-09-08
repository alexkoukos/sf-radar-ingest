CREATE TABLE IF NOT EXISTS events (
    api_id                     TEXT PRIMARY KEY,
    name                       TEXT NOT NULL,
    url_slug                   TEXT,
    starts_at                  TIMESTAMPTZ,
    ends_at                    TIMESTAMPTZ,
    is_online                  BOOLEAN NOT NULL,
    host_name                  TEXT,
    city                       TEXT,
    region                     TEXT,
    sublocality                TEXT,
    country_code               TEXT,
    latitude                   DOUBLE PRECISION,
    longitude                  DOUBLE PRECISION,
    is_free                    BOOLEAN,
    price_cents                INTEGER,
    require_approval           BOOLEAN,
    waitlist_status            TEXT,
    registration_availability  TEXT,
    calendar_access_level      TEXT,
    discovered_via             TEXT,
    category                   TEXT NOT NULL,
    rsvp_type                  TEXT NOT NULL,
    -- Populated by Java's scoring pass (Day 2). Time-invariant: reflects
    -- keyword/host/venue/accessibility relevance, never a time window.
    score                      DOUBLE PRECISION,
    first_seen_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per ingest run, regardless of outcome. Lets a total-failure run
-- (zero events across all targets, or a structural shape-match break) be
-- recorded and inspected without ever touching the events table.
CREATE TABLE IF NOT EXISTS ingestion_runs (
    id              BIGSERIAL PRIMARY KEY,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    status          TEXT NOT NULL,
    total_events    INTEGER NOT NULL,
    persisted       BOOLEAN NOT NULL,
    source_summary  JSONB NOT NULL
);

-- The anon key shipped in the frontend bundle is public by construction, so
-- RLS is what actually keeps it read-only. events gets a SELECT-everyone
-- policy (the data is already public event listings); no INSERT/UPDATE/
-- DELETE policy exists for it, so PostgREST denies writes by default.
-- ingestion_runs gets RLS enabled with zero policies - it's never read via
-- PostgREST, only written by the Java job's direct, privileged connection,
-- which bypasses RLS entirely and isn't affected by any of this.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events are publicly readable" ON events;
CREATE POLICY "events are publicly readable" ON events FOR SELECT USING (true);

ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;

-- Start of "today" in San Francisco's timezone, expressed as a timestamptz.
-- Every dashboard time window is anchored here, never UTC or JVM/browser
-- local time - the dev machine and any given viewer can be anywhere.
CREATE OR REPLACE FUNCTION la_window_start() RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE AS $$
    SELECT date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles')
        AT TIME ZONE 'America/Los_Angeles';
$$;

-- All filtering/sorting for the dashboard lives here, not in the frontend
-- or Java. last_seen_at within 24h is the ghost-event grace window: a
-- transient single-target scrape failure self-heals within a run or two,
-- while an event that's genuinely gone stops being seen and ages out.
--
-- Geo gate: the curated topic calendars (ai-sf, genai-sf,
-- bayareafoundersclub, theaibuildersdev, ...) are subject-scoped, not
-- location-scoped, so the raw feed carries New York / LA / Tokyo / Seoul /
-- Austin events. Keep the greater Bay Area + Silicon Valley (roughly a
-- 1.5-hour radius of SF: San Francisco, the Peninsula, South Bay, East Bay,
-- Marin, up to Napa/Santa Rosa, down to San Jose/Santa Cruz), drop
-- everything else.
--   * events WITH coordinates: must fall in the Bay Area bounding box
--     (lat 36.85..38.5, lon -122.9..-121.4 - excludes LA 34.0, San Diego,
--     Sacramento/Tahoe, Fresno, and anything out of state/country).
--   * events WITHOUT coordinates: kept only if nothing contradicts a Bay
--     Area origin - region is null or 'California', country is null or 'US'.
--     A fully untagged event is a coin flip; we keep it (recall over
--     precision) rather than name-matching, which the project forbids.
CREATE OR REPLACE FUNCTION get_dashboard_events(p_days INTEGER)
RETURNS SETOF events
LANGUAGE sql STABLE AS $$
    SELECT *
    FROM events
    WHERE starts_at >= la_window_start()
        AND starts_at < la_window_start() + (p_days::text || ' days')::interval
        AND last_seen_at >= now() - INTERVAL '24 hours'
        AND (
            (latitude BETWEEN 36.85 AND 38.5 AND longitude BETWEEN -122.9 AND -121.4)
            OR (
                latitude IS NULL
                AND (region IS NULL OR region = 'California')
                AND (country_code IS NULL OR country_code = 'US')
            )
        )
    ORDER BY score DESC NULLS LAST, starts_at ASC;
$$;

-- Plans + group trip-coordination schema is migration-managed (001–005, see
-- ../../migrations/), not applied here — the ingest job never touches those
-- tables. This file is re-applied in full by PostgresEventStore.ensureSchema()
-- on every run, so it must only ever DDL the ingest-owned objects above.
